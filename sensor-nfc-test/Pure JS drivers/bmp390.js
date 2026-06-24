/*
 * BMP390 Driver - Pure JavaScript Implementation
 * Ported from native C++ implementation for demonstration purposes.
 * 
 * NOTE: This pure JS implementation is slower than the native bridge version
 * due to the complex floating-point calibration algorithms. For production use,
 * prefer the native bridge driver in moddable/modules/drivers/sensors/bmp390/.
 * 
 * Original native implementation: moddable/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp
 * Based on Bosch BMP3 SensorAPI
 */

import Timer from "timer";

// BMP390 registers
const BMP390_REG_CHIP_ID = 0x00;
const BMP390_REG_ERR_REG = 0x02;
const BMP390_REG_STATUS = 0x03;
const BMP390_REG_DATA = 0x04; // press[2:0], temp[5:3]
const BMP390_REG_PWR_CTRL = 0x1B;
const BMP390_REG_OSR = 0x1C;
const BMP390_REG_ODR = 0x1D;
const BMP390_REG_CONFIG = 0x1F;
const BMP390_REG_CMD = 0x7E;
const BMP390_REG_CALIB_DATA = 0x31;

const BMP390_CHIP_ID = 0x60;
const BMP388_CHIP_ID = 0x50;
const BMP390_CMD_SOFT_RESET = 0xB6;

// Configuration constants
const Config = Object.freeze({
	Oversampling: {
		NONE: 0x00,
		X1: 0x01,
		X2: 0x02,
		X4: 0x03,
		X8: 0x04,
		X16: 0x05,
		X32: 0x06
	},
	IIRFilter: {
		OFF: 0x00,
		X2: 0x01,
		X4: 0x02,
		X8: 0x03,
		X16: 0x04,
		X32: 0x05,
		X64: 0x06,
		X128: 0x07
	},
	ODR: {
		_0_15_HZ: 0x00,
		_0_3_HZ: 0x01,
		_0_6_HZ: 0x02,
		_1_25_HZ: 0x03,
		_2_5_HZ: 0x04,
		_5_HZ: 0x05,
		_10_HZ: 0x06,
		_20_HZ: 0x07,
		_40_HZ: 0x08,
		_75_HZ: 0x09,
		_100_HZ: 0x0A,
		_200_HZ: 0x0B,
		_400_HZ: 0x0C,
		_800_HZ: 0x0D
	}
});

class BMP390 {
	#bus;
	#address;
	#initialized = false;
	#chipId = 0;
	#osrT = 0x00; // temperature oversampling
	#osrP = 0x00; // pressure oversampling
	#odr = 0x05;   // output data rate
	#iir = 0x00;   // IIR filter
	#temperature = 0;
	#pressure = 0;
	#calib = {
		par_t1: 0, par_t2: 0, par_t3: 0,
		par_p1: 0, par_p2: 0, par_p3: 0, par_p4: 0,
		par_p5: 0, par_p6: 0, par_p7: 0, par_p8: 0,
		par_p9: 0, par_p10: 0, par_p11: 0
	};

	constructor(options) {
		const { sensor } = options;
		this.#bus = new sensor.io({
			...sensor,
			address: sensor.address ?? 0x77
		});
		this.#address = sensor.address ?? 0x77;
	}

	close() {
		this.#bus?.close();
		this.#bus = undefined;
	}

	// I2C helpers
	#read8(reg) {
		this.#bus.write(new Uint8Array([reg]));
		const data = new Uint8Array(1);
		this.#bus.read(data);
		return data[0];
	}

	#write8(reg, value) {
		this.#bus.write(new Uint8Array([reg, value]));
	}

	#readBuffer(reg, length) {
		this.#bus.write(new Uint8Array([reg]));
		const data = new Uint8Array(length);
		this.#bus.read(data);
		return data;
	}

	// Unpack 24-bit little-endian value
	#unpack24(data, offset) {
		return (data[offset + 2] << 16) | (data[offset + 1] << 8) | data[offset];
	}

	// Write OSR register
	#writeOSR() {
		this.#write8(BMP390_REG_OSR, ((this.#osrT & 0x07) << 3) | (this.#osrP & 0x07));
	}

	// Temperature compensation (Bosch BMP3 SensorAPI)
	#compensateTemp(rawTemp) {
		const c = this.#calib;
		
		const par_t1_q = c.par_t1 / 0.00390625;
		const par_t2_q = c.par_t2 / 1073741824.0;
		const par_t3_q = c.par_t3 / 281474976710656.0;
		
		const partial_data1 = rawTemp - par_t1_q;
		const partial_data2 = partial_data1 * par_t2_q;
		const t_lin = partial_data2 + (partial_data1 * partial_data1) * par_t3_q;
		
		return t_lin;
	}

	// Pressure compensation (Bosch BMP3 SensorAPI)
	#compensatePress(rawPress, t_lin) {
		const c = this.#calib;
		
		const par_p1_q = (c.par_p1 - 16384) / 1048576.0;
		const par_p2_q = (c.par_p2 - 16384) / 536870912.0;
		const par_p3_q = c.par_p3 / 4294967296.0;
		const par_p4_q = c.par_p4 / 137438953472.0;
		const par_p5_q = c.par_p5 * 8.0;
		const par_p6_q = c.par_p6 / 64.0;
		const par_p7_q = c.par_p7 / 256.0;
		const par_p8_q = c.par_p8 / 32768.0;
		const par_p9_q = c.par_p9 / 281474976710656.0;
		const par_p10_q = c.par_p10 / 281474976710656.0;
		const par_p11_q = c.par_p11 / 36893488147419103232.0;
		
		const p1 = par_p6_q * t_lin;
		const p2 = par_p7_q * Math.pow(t_lin, 2);
		const p3 = par_p8_q * Math.pow(t_lin, 3);
		const partial_out1 = par_p5_q + p1 + p2 + p3;
		
		const p4 = par_p2_q * t_lin;
		const p5 = par_p3_q * Math.pow(t_lin, 2);
		const p6 = par_p4_q * Math.pow(t_lin, 3);
		const partial_out2 = rawPress * (par_p1_q + p4 + p5 + p6);
		
		const p7 = Math.pow(rawPress, 2);
		const p8 = par_p9_q + par_p10_q * t_lin;
		const p9 = p7 * p8;
		const p10 = p9 + Math.pow(rawPress, 3) * par_p11_q;
		
		return partial_out1 + partial_out2 + p10;
	}

	// Initialize sensor
	begin() {
		// Soft reset
		this.#write8(BMP390_REG_CMD, BMP390_CMD_SOFT_RESET);
		Timer.delay(10);
		
		// Read chip ID
		this.#chipId = this.#read8(BMP390_REG_CHIP_ID);
		if (this.#chipId !== BMP390_CHIP_ID && this.#chipId !== BMP388_CHIP_ID) {
			return false;
		}
		
		// Read calibration data (21 bytes)
		const calibRaw = this.#readBuffer(BMP390_REG_CALIB_DATA, 21);
		
		// Parse calibration data (Bosch BMP3 SensorAPI NVM map)
		this.#calib.par_t1 = (calibRaw[1] << 8) | calibRaw[0];
		this.#calib.par_t2 = (calibRaw[3] << 8) | calibRaw[2];
		this.#calib.par_t3 = calibRaw[4] << 24 >> 24; // sign-extend
		this.#calib.par_p1 = (calibRaw[6] << 8) | calibRaw[5];
		this.#calib.par_p2 = (calibRaw[8] << 8) | calibRaw[7];
		this.#calib.par_p3 = calibRaw[9] << 24 >> 24;
		this.#calib.par_p4 = calibRaw[10] << 24 >> 24;
		this.#calib.par_p5 = (calibRaw[12] << 8) | calibRaw[11];
		this.#calib.par_p6 = (calibRaw[14] << 8) | calibRaw[13];
		this.#calib.par_p7 = calibRaw[15] << 24 >> 24;
		this.#calib.par_p8 = calibRaw[16] << 24 >> 24;
		this.#calib.par_p9 = (calibRaw[18] << 8) | calibRaw[17];
		this.#calib.par_p10 = calibRaw[19] << 24 >> 24;
		this.#calib.par_p11 = calibRaw[20] << 24 >> 24;
		
		// Apply configuration
		this.#writeOSR();
		this.#write8(BMP390_REG_ODR, this.#odr & 0x1F);
		this.#write8(BMP390_REG_CONFIG, (this.#iir & 0x07) << 1);
		this.#write8(BMP390_REG_PWR_CTRL, 0x33); // press_en | temp_en | mode=normal
		
		this.#initialized = true;
		return true;
	}

	reset() {
		this.#write8(BMP390_REG_CMD, BMP390_CMD_SOFT_RESET);
	}

	getChipID() {
		return this.#chipId;
	}

	// Perform reading
	performReading() {
		if (!this.#initialized) return false;
		
		const data = this.#readBuffer(BMP390_REG_DATA, 6);
		
		const rawPress = this.#unpack24(data, 0);
		const rawTemp = this.#unpack24(data, 3);
		
		const t_lin = this.#compensateTemp(rawTemp);
		this.#temperature = t_lin;
		this.#pressure = this.#compensatePress(rawPress, t_lin);
		
		return true;
	}

	readTemperature() {
		if (this.performReading()) {
			return this.#temperature;
		}
		return NaN;
	}

	readPressure() {
		if (this.performReading()) {
			return this.#pressure;
		}
		return NaN;
	}

	readAltitude(seaLevel = 101325) {
		const pressure = this.readPressure();
		if (isNaN(pressure)) return NaN;
		
		return 44330.0 * (1.0 - Math.pow(pressure / seaLevel, 0.1903));
	}

	setTemperatureOversampling(os) {
		this.#osrT = os & 0x07;
		this.#writeOSR();
	}

	setPressureOversampling(os) {
		this.#osrP = os & 0x07;
		this.#writeOSR();
	}

	setIIRFilterCoeff(fs) {
		this.#iir = fs & 0x07;
		this.#write8(BMP390_REG_CONFIG, (this.#iir & 0x07) << 1);
	}

	setOutputDataRate(odr) {
		this.#odr = odr & 0x1F;
		this.#write8(BMP390_REG_ODR, this.#odr);
	}

	sample() {
		if (this.performReading()) {
			return {
				barometer: { pressure: this.#pressure },
				thermometer: { temperature: this.#temperature }
			};
		}
		throw new Error("BMP390 reading failed");
	}
}

export { BMP390 as default, BMP390, Config };
