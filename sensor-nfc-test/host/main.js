/*
 * Sensor & NFC Test — Host
 * Moddable Six (ESP32-S3) — hardware-demo
 *
 * Probes three Adafruit breakouts on the I2C bus:
 *   - BMP390 (temp + pressure)
 *   - ChronoDot 3.0 / MAX31328 RTC (via DS3231 driver)
 *   - ST25DV16K (NFC/RFID EEPROM)
 *
 * Missing hardware is handled gracefully — null references are passed
 * to the app mod, which shows "Not Found" status.
 *
 * IMPORTANT: In debug mode (-d) the xsdebug debugger pauses on every
 * I2C NACK (missing device) before the JS try/catch can handle it.
 * When xsdebug breaks with "writeRead failed", type 'c' (continue) to
 * let the exception propagate into the catch block. The app will then
 * show "Not Found" for that device and keep running.
 *
 * Build:  mcconfig -d -m -p esp32/moddable_six
 */

import {} from "piu/MC";
import Timer from "timer";
import RTC from "embedded:RTC/DS3231";
import BMP390Adafruit from "embedded:sensor/Barometer-Temperature/BMP390/Adafruit";
import ST25DV16K from "./st25dv";
import AudioOut from "pins/audioout";

/* ---- helper: probe I2C address safely (zero-byte write, no throw on NACK) ---- */
function i2cProbe(address) {
	let result = 1, bus;
	try {
		bus = new device.I2C.default.io({
			...device.I2C.default,
			address,
			hz: 100_000
		});
		result = bus.write(new ArrayBuffer);
	}
	catch {
	}
	bus?.close();
	return undefined === result;
}

/* ---- hardware probes (modular — missing = null) ---- */
let hardwareBmp390 = null;
let hardwareBmp390Ok = false;
let hardwareRtc = null;
let hardwareRtcOk = false;
let hardwareSt25dv = null;
let hardwareSt25dvOk = false;
let hardwareSt25dvID = 0;

/* probe BMP390 Adafruit bridge */
trace("Probing BMP390 Adafruit bridge...\n");
try {
	// Constructor initializes the sensor (begin) and throws if not found.
	hardwareBmp390 = new BMP390Adafruit({
		sensor: device.I2C.default
	});
	hardwareBmp390Ok = true;
	trace("BMP390 connected\n");
} catch (e) {
	trace(`BMP390 error: ${e.message}\n`);
	if (hardwareBmp390) { hardwareBmp390.close?.(); hardwareBmp390 = null; }
}

Timer.delay(100);

/* probe RTC */
if (i2cProbe(0x68)) {
	try {
		hardwareRtc = new RTC({
			clock: {
				...device.I2C.default,
				io: device.io.SMBus
			}
		});
		hardwareRtcOk = true;
		trace("RTC connected\n");
		if (hardwareRtc.time === undefined) {
			hardwareRtc.time = Date.UTC(2025, 0, 1, 0, 0, 0);
			trace("RTC initialized to 2025-01-01 00:00:00 UTC\n");
		}
	} catch (e) {
		trace(`RTC error: ${e.message}\n`);
		if (hardwareRtc) { hardwareRtc.close?.(); hardwareRtc = null; }
	}
} else {
	trace("RTC not found (no ACK at 0x68)\n");
}

Timer.delay(100);

/* probe ST25DV16K */
try {
	hardwareSt25dv = new ST25DV16K({ sensor: device.I2C.default });
	if (hardwareSt25dv.isPresent()) {
		hardwareSt25dvOk = true;
		hardwareSt25dvID = hardwareSt25dv.readChipID();
		trace(`ST25DV16K connected (id=0x${hardwareSt25dvID.toString(16)})\n`);
	} else {
		trace("ST25DV16K not detected (chip ID mismatch)\n");
		hardwareSt25dv.close();
		hardwareSt25dv = null;
	}
} catch (e) {
	trace(`ST25DV16K error: ${e.message}\n`);
	if (hardwareSt25dv) { hardwareSt25dv.close(); hardwareSt25dv = null; }
}

/* ---- fallback when no mod archive is present ---- */
const NoModApplication = Application.template($ => ({
	skin: { fill: "#0f172a" },
	contents: [
		Label($, {
			top: 0, bottom: 0, left: 0, right: 0,
			style: { font: "20px Open Sans", color: "#f1f5f9", horizontal: "center" },
			string: $,
		})
	]
}));

export default function () {
	const archive = globalThis.archive;
	trace(`archive present: ${archive ? "YES" : "NO"}\n`);

	if (archive) {
		const globals = {
			Application, Behavior, Container, Column, Label, Row, Skin, Style,
			Timer, AudioOut,
			hardwareBmp390, hardwareBmp390Ok,
			hardwareRtc, hardwareRtcOk,
			hardwareSt25dv, hardwareSt25dvOk, hardwareSt25dvID,
		};
		try {
			const compartment = new Compartment({
				globals,
				modules: {
					app: { archive, path: "app" }
				},
				resolveHook(specifier) { return specifier; },
				loadNowHook(module, specifier) { return ""; }
			});
			const app = compartment.importNow("app");
			trace(`app module imported: ${app ? "YES" : "NO"}\n`);
			const mod = app.default;
			trace(`app.default: ${typeof mod}\n`);
			if (typeof mod === "function") {
				return mod();
			}
		} catch (e) {
			trace(`Compartment error: ${e}\n`);
		}
	}

	trace("Showing no-mod fallback\n");
	return new NoModApplication("No app mod", { pixels: 240 * 16 });
}
