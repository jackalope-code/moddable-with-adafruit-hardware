/*
 * Adafruit ST25DV16K NFC Demo
 * Moddable Six (ESP32-S3) — hardware-demo
 *
 * Connects to an Adafruit ST25DV16K I2C RFID/NFC EEPROM breakout
 * via the Moddable Six Qwiic/Stemma QT connector (SDA=GPIO4, SCL=GPIO5).
 *
 * The ST25DV16K shows up as an ISO/IEC 15693 RFID tag readable by
 * phones even when unpowered. This demo writes a URI NDEF record
 * that a phone will open as a URL when tapped.
 *
 * Build:  mcconfig -d -m -p esp32/moddable_six
 */

import {} from "piu/MC";
import ST25DV16K from "./st25dv";

const DEMO_URL = "https://www.moddable.com";

let tag;
let tagOk = false;
let chipID = 0;
let currentURI = "";

try {
	tag = new ST25DV16K({ sensor: device.I2C.default });
	if (tag.isPresent()) {
		tagOk = true;
		chipID = tag.readChipID();
		trace(`ST25DV16K detected (ID=0x${chipID.toString(16).padStart(2, "0")})\n`);

		// Write demo NDEF URI
		tag.writeNDEF_URI(DEMO_URL);
		trace(`Wrote NDEF URI: ${DEMO_URL}\n`);

		// Verify read-back
		currentURI = tag.readNDEFURI();
		trace(`Read-back URI: ${currentURI}\n`);
	} else {
		trace("ST25DV16K not detected\n");
	}
} catch (e) {
	trace(`ST25DV16K error: ${e}\n`);
}

const bgSkin = new Skin({ fill: "#0f172a" });
const titleStyle = new Style({
	font: "semibold 20px Open Sans",
	color: "#38bdf8",
	horizontal: "center"
});
const headingStyle = new Style({
	font: "semibold 16px Open Sans",
	color: "#94a3b8",
	horizontal: "center"
});
const valueStyle = new Style({
	font: "normal normal normal 18px Open Sans",
	color: "#f1f5f9",
	horizontal: "center",
	left: 8, right: 8
});
const urlStyle = new Style({
	font: "normal normal normal 16px Open Sans",
	color: "#22c55e",
	horizontal: "center",
	left: 8, right: 8
});
const statusStyle = new Style({
	font: "semibold 16px Open Sans",
	color: tagOk ? "#22c55e" : "#ef4444",
	horizontal: "center"
});
const hintStyle = new Style({
	font: "normal normal normal 16px Open Sans",
	color: "#64748b",
	horizontal: "center",
	left: 8, right: 8
});

let NFCApplication = Application.template($ => ({
	skin: bgSkin,
	contents: [
		Label($, {
			top: 28, left: 0, right: 0, height: 28,
			style: titleStyle,
			string: "ST25DV16K NFC"
		}),
		Label($, {
			top: 70, left: 0, right: 0, height: 22,
			style: headingStyle,
			string: tagOk ? `Chip ID: 0x${chipID.toString(16).padStart(2, "0").toUpperCase()}` : "No Tag Detected"
		}),
		Label($, {
			top: 100, left: 0, right: 0, height: 22,
			style: headingStyle,
			string: tagOk ? "NDEF URI Record" : ""
		}),
		Label($, {
			top: 126, left: 8, right: 8, height: 48,
			style: urlStyle,
			string: tagOk ? currentURI : ""
		}),
		Label($, {
			top: 190, left: 8, right: 8, height: 22,
			style: hintStyle,
			string: tagOk ? "Tap with an NFC-enabled phone to open the URL" : ""
		}),
		Label($, {
			bottom: 24, left: 0, right: 0, height: 22,
			style: statusStyle,
			string: tagOk ? "\u25CF Tag Ready" : "\u25CF Tag Not Found"
		})
	]
}));

export default new NFCApplication({}, { pixels: 240 * 16 });
