/*
 * ChronoDot 3.0 Clock
 * Moddable Six (ESP32-S3) — hardware-demo
 *
 * Connects to a ChronoDot 3.0 RTC (MAX31328, DS3231-compatible) via I2C
 * on the Moddable Six Qwiic/Stemma QT connector (SDA=GPIO4, SCL=GPIO5)
 * and displays the time using the Piu UI framework.
 *
 * Build:  mcconfig -d -m -p esp32/moddable_six
 */

import {} from "piu/MC";
import RTC from "embedded:RTC/DS3231";

/*
 * Attempt to connect to ChronoDot 3.0.
 * The MAX31328 on the ChronoDot 3.0 is register-compatible with the DS3231,
 * sharing I2C address 0x68 and identical register layout.
 */
let rtc;
let rtcOk = false;

try {
	rtc = new RTC({
		clock: {
			...device.I2C.default,
			io: device.io.SMBus
		}
	});
	rtcOk = true;
	trace("ChronoDot 3.0 (MAX31328/DS3231) connected\n");

	if (rtc.time === undefined) {
		/*
		 * The RTC oscillator was stopped (e.g. first power-on, or
		 * battery drained).  Initialize to a known date so it starts
		 * ticking.  Replace with the actual current time as needed.
		 */
		rtc.time = Date.UTC(2025, 0, 1, 0, 0, 0);
		trace("RTC oscillator was stopped — initialized to 2025-01-01 00:00:00 UTC\n");
	} else {
		trace(`RTC time: ${new Date(rtc.time).toUTCString()}\n`);
	}
} catch (e) {
	trace(`ChronoDot 3.0 not found: ${e}\n`);
}

const MONTHS = Object.freeze([
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]);
const DAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

const bgSkin = new Skin({ fill: "#0f172a" });

const titleStyle = new Style({
	font: "semibold 20px Open Sans",
	color: "#38bdf8",
	horizontal: "center"
});
const timeStyle = new Style({
	font: "normal normal normal 52px Open Sans",
	color: "#f1f5f9",
	horizontal: "center"
});
const dateStyle = new Style({
	font: "normal normal normal 24px Open Sans",
	color: "#94a3b8",
	horizontal: "center"
});
const statusStyle = new Style({
	font: "semibold 20px Open Sans",
	color: rtcOk ? "#22c55e" : "#ef4444",
	horizontal: "center"
});

class ClockBehavior extends Behavior {
	onCreate(app, $) {
		this.$ = $;
		this.colon = true;
		this.ms = rtc ? rtc.time : undefined;
		this.render();
		app.interval = 500;
		app.start();
	}
	onTimeChanged(app) {
		this.colon = !this.colon;
		if (this.colon && rtc) {
			this.ms = rtc.time;
		}
		this.render();
	}
	render() {
		const ms = this.ms;
		if (ms === undefined) {
			this.$.TIME_LABEL.string = "--:--:--";
			this.$.DATE_LABEL.string = rtcOk ? "Reading RTC..." : "No RTC signal";
			return;
		}
		const d = new Date(ms);
		const h = d.getUTCHours().toString().padStart(2, "0");
		const m = d.getUTCMinutes().toString().padStart(2, "0");
		const s = d.getUTCSeconds().toString().padStart(2, "0");
		const sep = this.colon ? ":" : " ";
		this.$.TIME_LABEL.string = `${h}${sep}${m}${sep}${s}`;
		this.$.DATE_LABEL.string = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
	}
}

let ClockApplication = Application.template($ => ({
	Behavior: ClockBehavior,
	skin: bgSkin,
	contents: [
		Label($, {
			top: 28, left: 0, right: 0, height: 28,
			style: titleStyle,
			string: "ChronoDot 3.0"
		}),
		Label($, {
			anchor: "TIME_LABEL",
			top: 100, left: 8, right: 8, height: 68,
			style: timeStyle,
			string: "--:--:--"
		}),
		Label($, {
			anchor: "DATE_LABEL",
			top: 182, left: 8, right: 8, height: 32,
			style: dateStyle,
			string: "---"
		}),
		Label($, {
			bottom: 24, left: 0, right: 0, height: 28,
			style: statusStyle,
			string: rtcOk ? "\u25CF RTC Connected" : "\u25CF RTC Not Found"
		})
	]
}));

export default new ClockApplication({}, { pixels: 240 * 16 });
