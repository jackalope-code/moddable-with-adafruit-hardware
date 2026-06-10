/*
 * BMP390 Driver
 * Pure-JavaScript I2C driver for the Adafruit BMP390 (Bosch BMP3 series).
 *
 * I2C address: 0x77 (default) or 0x76 (SDO pulled low)
 *
 * Based on Bosch BMP3 SensorAPI and Adafruit BMP3XX library.
 */

import Timer from "timer";

const Register = Object.freeze({
	CHIP_ID: 0x00,
	ERR_REG: 0x02,
	STATUS: 0x03,
	DATA: 0x04,
	INT_STATUS: 0x11,
	PWR_CTRL: 0x1B,
	OSR: 0x1C,
	ODR: 0x1D,
	CONFIG: 0x1F,
	CALIB_DATA: 0x31,
	CMD: 0x7E
});

const CMD_SOFT_RESET = 0xB6;
const CHIP_ID_BMP390 = 0x60;

class BMP390 {
	#io;
	#calib;
	#byteBuffer;
	#ready;

	constructor(options) {
		const io = this.#io = new options.sensor.io({
			hz: 400_000,
			address: options.address ?? 0x77,
			...options.sensor
		});
		this.#byteBuffer = new Uint8Array(1);
		this.#ready = false;

		this.#writeReg(Register.CMD, CMD_SOFT_RESET);
		Timer.delay(10);

		const id = this.#readReg(Register.CHIP_ID);
		if (id !== CHIP_ID_BMP390) {
			this.close();
			throw new Error(`unexpected sensor (id=0x${id.toString(16)})`);
		}

		const calibRaw = this.#readBuffer(Register.CALIB_DATA, 21);
		this.#calib = this.#parseCalib(calibRaw);

		this.#writeReg(Register.OSR, 0x00);
		this.#writeReg(Register.ODR, 0x05);
		this.#writeReg(Register.CONFIG, 0x00);
		this.#writeReg(Register.PWR_CTRL, 0x33);
		Timer.delay(10);

		const status = this.#readReg(Register.STATUS);
		const pwr = this.#readReg(Register.PWR_CTRL);
		const err = this.#readReg(Register.ERR_REG);
		trace(`BMP390 init: status=0x${status.toString(16)} pwr=0x${pwr.toString(16)} err=0x${err.toString(16)}\n`);

		this.#ready = true;
	}

	get ready() { return this.#ready; }

	close() {
		this.#io?.close();
		this.#io = undefined;
		this.#ready = false;
	}

	sample() {
		if (!this.#ready) throw new Error("BMP390 not initialized");
		const status = this.#readReg(Register.STATUS);
		trace(`BMP390 status=0x${status.toString(16)} (drdy_temp=${!!(status&8)} drdy_press=${!!(status&16)})\n`);
		const data = this.#readBuffer(Register.DATA, 6);
		trace(`BMP390 raw bytes: ${Array.from(data).map(b => b.toString(16).padStart(2,'0')).join(' ')}\n`);
		const rawPress = this.#unpack24(data, 0);
		const rawTemp = this.#unpack24(data, 3);
		trace(`BMP390 raw ADC: press=${rawPress} temp=${rawTemp}\n`);
		const temp = this.#compensateTemp(rawTemp);
		const press = this.#compensatePress(rawPress, temp.t_lin);
		trace(`BMP390 compensated: temp=${temp.value} press=${press}\n`);
		return {
			thermometer: { temperature: temp.value },
			barometer: { pressure: press }
		};
	}

	/* ---- private ---- */

	#readReg(reg) {
		const w = new Uint8Array([reg]);
		const b = new Uint8Array(1);
		this.#io.writeRead(w, b);
		return b[0];
	}

	#writeReg(reg, val) {
		this.#io.write(new Uint8Array([reg, val]));
	}

	#readBuffer(reg, len) {
		const w = new Uint8Array([reg]);
		const buf = new Uint8Array(len);
		this.#io.writeRead(w, buf);
		return buf;
	}

	#unpack24(buf, off) {
		return (buf[off + 2] << 16) | (buf[off + 1] << 8) | buf[off];
	}

	#concat16(msb, lsb) {
		return (msb << 8) | lsb;
	}

	#parseCalib(d) {
		const cal = {};
		cal.par_t1 = this.#concat16(d[1], d[0]);
		cal.par_t1_q = cal.par_t1 / 0.00390625;
		cal.par_t2 = this.#concat16(d[3], d[2]);
		cal.par_t2_q = cal.par_t2 / 1073741824.0;
		cal.par_t3 = this.#toSigned8(d[4]);
		cal.par_t3_q = cal.par_t3 / 281474976710656.0;

		cal.par_p1 = this.#toSigned16(this.#concat16(d[6], d[5]));
		cal.par_p1_q = (cal.par_p1 - 16384) / 1048576.0;
		cal.par_p2 = this.#toSigned16(this.#concat16(d[8], d[7]));
		cal.par_p2_q = (cal.par_p2 - 16384) / 536870912.0;
		cal.par_p3 = this.#toSigned8(d[9]);
		cal.par_p3_q = cal.par_p3 / 4294967296.0;
		cal.par_p4 = this.#toSigned8(d[10]);
		cal.par_p4_q = cal.par_p4 / 137438953472.0;

		cal.par_p5 = this.#concat16(d[12], d[11]);
		cal.par_p5_q = cal.par_p5 * 8.0;
		cal.par_p6 = this.#concat16(d[14], d[13]);
		cal.par_p6_q = cal.par_p6 / 64.0;
		cal.par_p7 = this.#toSigned8(d[15]);
		cal.par_p7_q = cal.par_p7 / 256.0;
		cal.par_p8 = this.#toSigned8(d[16]);
		cal.par_p8_q = cal.par_p8 / 32768.0;
		cal.par_p9 = this.#toSigned16(this.#concat16(d[18], d[17]));
		cal.par_p9_q = cal.par_p9 / 281474976710656.0;
		cal.par_p10 = this.#toSigned8(d[19]);
		cal.par_p10_q = cal.par_p10 / 281474976710656.0;
		cal.par_p11 = this.#toSigned8(d[20]);
		cal.par_p11_q = cal.par_p11 / 36893488147419103232.0;

		return cal;
	}

	#toSigned8(v) {
		return v > 127 ? v - 256 : v;
	}

	#toSigned16(v) {
		return v > 32767 ? v - 65536 : v;
	}

	#compensateTemp(uncomp) {
		const c = this.#calib;
		const partial_data1 = uncomp - c.par_t1_q;
		const partial_data2 = partial_data1 * c.par_t2_q;
		const t_lin = partial_data2 + (partial_data1 * partial_data1) * c.par_t3_q;
		return { value: t_lin, t_lin };
	}

	#compensatePress(uncomp, t_lin) {
		const c = this.#calib;
		const p1 = c.par_p6_q * t_lin;
		const p2 = c.par_p7_q * Math.pow(t_lin, 2);
		const p3 = c.par_p8_q * Math.pow(t_lin, 3);
		const partial_out1 = c.par_p5_q + p1 + p2 + p3;

		const p4 = c.par_p2_q * t_lin;
		const p5 = c.par_p3_q * Math.pow(t_lin, 2);
		const p6 = c.par_p4_q * Math.pow(t_lin, 3);
		const partial_out2 = uncomp * (c.par_p1_q + p4 + p5 + p6);

		const p7 = Math.pow(uncomp, 2);
		const p8 = c.par_p9_q + c.par_p10_q * t_lin;
		const p9 = p7 * p8;
		const p10 = p9 + Math.pow(uncomp, 3) * c.par_p11_q;

		return partial_out1 + partial_out2 + p10;
	}
}

export { BMP390 as default, BMP390 };
