/*
 * Sensor & NFC Test — App Mod
 *
 * Runs inside a Compartment created by the host.
 * All Piu constructors and hardware objects are globals injected by the host.
 */

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CtoF = c => (c * 1.8) + 32;
const PaTohPa = pa => pa / 100.0;

const bgSkin = new Skin({ fill: "#0f172a" });
const cardSkin = new Skin({ fill: "#1e293b" });
const titleStyle = new Style({
	font: "semibold 18px Open Sans",
	color: "#38bdf8",
	horizontal: "center"
});
const headingStyle = new Style({
	font: "semibold 12px Open Sans",
	color: "#94a3b8",
	horizontal: "left"
});
const valueStyle = new Style({
	font: "normal 12px Open Sans",
	color: "#f1f5f9",
	horizontal: "left"
});
const timeStyle = new Style({
	font: "semibold 20px Open Sans",
	color: "#f1f5f9",
	horizontal: "left"
});
const okStyle = new Style({
	font: "semibold 10px Open Sans",
	color: "#22c55e",
	horizontal: "left"
});
const errStyle = new Style({
	font: "semibold 10px Open Sans",
	color: "#ef4444",
	horizontal: "left"
});
const hintStyle = new Style({
	font: "normal 10px Open Sans",
	color: "#64748b",
	horizontal: "left"
});
const buttonSkin = new Skin({
	fill: ["#334155", "#475569"],
	stroke: "#64748b",
	borders: { left: 1, right: 1, top: 1, bottom: 1 }
});
const buttonStyle = new Style({
	font: "semibold 12px Open Sans",
	color: "#f1f5f9",
	horizontal: "center"
});

function playTap() {
	try {
		const out = new AudioOut({ streams: 1, sampleRate: 24000, numChannels: 1 });
		out.enqueue(0, AudioOut.Tone, 1200, 30);
		out.start();
		Timer.delay(40);
		out.stop();
		out.close();
	} catch (e) {
		trace(`tap sound error: ${e}\n`);
	}
}

class MainBehavior extends Behavior {
	onCreate(app, $) {
		this.$ = $;
		this.colon = true;
		this.tick = 0;
		this.tempC = null;
		this.pressure = null;
		this.uri = "";
		app.interval = 500;
		app.start();

		// Use BMP390 Adafruit bridge driver
		this.bmp390 = hardwareBmp390;
		this.bmp390Ok = hardwareBmp390Ok;

		// Set BMP390 driver label
		this.$.BMP_TITLE.string = "BMP390";
		this.$.BMP_HINT.string = "Adafruit bridge";

		// Update status
		this.$.BMP_STATUS.string = this.bmp390Ok ? "\u25CF OK" : "\u25CF Not Found";
		this.$.BMP_STATUS.style = this.bmp390Ok ? okStyle : errStyle;
	}
	onDisplaying(app) {
		if (this.bmp390 && this.bmp390Ok) this.updateBMP390();
		if (hardwareRtc && hardwareRtcOk) this.updateRTC();
		if (hardwareSt25dv && hardwareSt25dvOk) this.updateST25DV();
	}
	onTimeChanged(app) {
		this.colon = !this.colon;
		this.tick++;
		if (hardwareRtc && hardwareRtcOk) this.updateRTC();
		if (this.tick % 4 === 0 && this.bmp390 && this.bmp390Ok) this.updateBMP390();
	}
	updateBMP390() {
		if (!this.bmp390 || !this.bmp390Ok) return;
		try {
			trace("BMP390 sampling...\n");
			const s = this.bmp390.sample();
			if (!s || !s.thermometer || !s.barometer) { trace("BMP390 sample missing fields\n"); return; }
			this.tempC = s.thermometer.temperature;
			this.pressure = s.barometer.pressure;
			if (this.$.BMP_TEMP) {
				const str = `${this.tempC.toFixed(1)}\u00B0C / ${CtoF(this.tempC).toFixed(1)}\u00B0F`;
				this.$.BMP_TEMP.string = str;
			}
			if (this.$.BMP_PRESS) {
				const str = `${PaTohPa(this.pressure).toFixed(1)} hPa`;
				this.$.BMP_PRESS.string = str;
			}
			if (this.$.BMP_STATUS) { this.$.BMP_STATUS.string = "\u25CF OK"; this.$.BMP_STATUS.style = okStyle; }
		} catch (e) {
			trace(`BMP390 read error: ${e}\n`);
			if (this.$.BMP_STATUS) { this.$.BMP_STATUS.string = "\u25CF Error"; this.$.BMP_STATUS.style = errStyle; }
		}
	}
	updateRTC() {
		if (!hardwareRtc || !hardwareRtcOk) return;
		try {
			const ms = hardwareRtc.time;
			const d = new Date(ms);
			const hh = String(d.getUTCHours()).padStart(2, "0");
			const mm = String(d.getUTCMinutes()).padStart(2, "0");
			const ss = String(d.getUTCSeconds()).padStart(2, "0");
			const colon = this.colon ? ":" : " ";
			if (this.$.RTC_TIME) this.$.RTC_TIME.string = `${hh}${colon}${mm}${colon}${ss}`;
			if (this.$.RTC_DATE) this.$.RTC_DATE.string = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
			if (this.$.RTC_STATUS) { this.$.RTC_STATUS.string = "\u25CF OK"; this.$.RTC_STATUS.style = okStyle; }
		} catch (e) {
			trace(`RTC read error: ${e}\n`);
			if (this.$.RTC_STATUS) { this.$.RTC_STATUS.string = "\u25CF Error"; this.$.RTC_STATUS.style = errStyle; }
		}
	}
	updateST25DV() {
		if (!hardwareSt25dv || !hardwareSt25dvOk) return;
		try {
			trace("ST25DV reading URI...\n");
			this.uri = hardwareSt25dv.readNDEFURI() ?? "";
			trace(`ST25DV URI: ${this.uri}\n`);
			if (this.$.NFC_URI) this.$.NFC_URI.string = this.uri || "(empty)";
		} catch (e) {
			trace(`ST25DV read error: ${e}\n`);
		}
	}
}

// Global scrolling state
let isScrolling = false;

// Custom scroll behavior for Scroller
class SimpleScrollBehavior extends Behavior {
	onCreate(scroller) {
		this.dx = 0;
		this.dy = 0;
	}
	onTouchBegan(scroller, id, x, y) {
		this.startX = x;
		this.startY = y;
		isScrolling = false;
	}
	onTouchMoved(scroller, id, x, y) {
		this.dx = this.startX - x;
		this.dy = this.startY - y;
		if (Math.abs(this.dy) > 5) {
			isScrolling = true;
		}
		scroller.scrollBy(this.dx, this.dy);
		this.startX = x;
		this.startY = y;
	}
	onTouchEnded(scroller, id, x, y) {
		isScrolling = false;
	}
}

// Base button behavior - checks scrolling state
class BaseButtonBehavior extends Behavior {
	onTouchBegan(l, id, x, y, ticks) {
		if (isScrolling) return;
		trace("button touch began\n");
		l.state = 1;
		playTap();
	}
	onTouchEnded(l, id, x, y, ticks) {
		if (isScrolling) return;
		trace("button touch ended\n");
		l.state = 0;
	}
}

class WriteButtonBehavior extends BaseButtonBehavior {
	onTouchEnded(l, id, x, y, ticks) {
		if (isScrolling) return;
		trace("button touch ended\n");
		l.state = 0;
		if (!hardwareSt25dvOk) {
			trace("Write button pressed but ST25DV16K not present\n");
			return;
		}
		try {
			trace("ST25DV writing URI...\n");
			hardwareSt25dv.writeNDEFURI("https://www.google.com/search?q=adafruit+st25dv");
			trace("ST25DV write complete\n");
			const app = l.application;
			if (app?.$?.NFC_URI) app.$.NFC_URI.string = "https://www.google.com/search?q=adafruit+st25dv";
		} catch (e) {
			trace(`ST25DV write error: ${e}\n`);
		}
	}
}

let SensorApplication = Application.template($ => ({
	skin: bgSkin,
	Behavior: MainBehavior,
	commandListLength: 4096,
	displayListLength: 8192,
	touchCount: 1,
	contents: [
		Label($, {
			top: 6, left: 0, right: 0, height: 24,
			style: titleStyle,
			string: "Sensor & NFC Test"
		}),

		Scroller($, {
			top: 32, left: 0, right: 0, bottom: 16,
			active: true,
			clip: true,
			backgroundTouch: true,
			Behavior: SimpleScrollBehavior,
			contents: [
				Column($, {
					left: 6, right: 6, top: 0,
					contents: [
						/* BMP390 Card */
						Container($, {
							anchor: "BMP_CARD",
							top: 0, left: 0, right: 0, height: 82,
							skin: cardSkin,
							contents: [
								Label($, { anchor: "BMP_TITLE", top: 4, left: 8, height: 14, style: headingStyle, string: "BMP390" }),
								Label($, { anchor: "BMP_STATUS", top: 4, right: 8, height: 14, style: hardwareBmp390Ok ? okStyle : errStyle, string: hardwareBmp390Ok ? "\u25CF OK" : "\u25CF Not Found" }),
								Label($, { anchor: "BMP_TEMP", top: 22, left: 8, right: 8, height: 16, style: valueStyle, string: hardwareBmp390Ok ? "Reading..." : "--" }),
								Label($, { anchor: "BMP_PRESS", top: 40, left: 8, right: 8, height: 16, style: valueStyle, string: hardwareBmp390Ok ? "Reading..." : "--" }),
								Label($, { anchor: "BMP_HINT", top: 60, left: 8, right: 8, height: 14, style: hintStyle, string: hardwareBmp390Ok ? "Loading..." : "Check wiring & address 0x77" })
							]
						}),

						/* RTC Card */
						Container($, {
							anchor: "RTC_CARD",
							top: 10, left: 0, right: 0, height: 78,
							skin: cardSkin,
							contents: [
								Label($, { top: 4, left: 8, height: 14, style: headingStyle, string: "ChronoDot 3.0" }),
								Label($, { anchor: "RTC_STATUS", top: 4, right: 8, height: 14, style: hardwareRtcOk ? okStyle : errStyle, string: hardwareRtcOk ? "\u25CF OK" : "\u25CF Not Found" }),
								Label($, { anchor: "RTC_TIME", top: 22, left: 8, right: 8, height: 24, style: timeStyle, string: hardwareRtcOk ? "--:--:--" : "--" }),
								Label($, { anchor: "RTC_DATE", top: 48, left: 8, right: 8, height: 16, style: valueStyle, string: hardwareRtcOk ? "Reading..." : "Check wiring & address 0x68" })
							]
						}),

						/* ST25DV16K Card */
						Container($, {
							anchor: "NFC_CARD",
							top: 10, left: 0, right: 0, height: 104,
							skin: cardSkin,
							contents: [
								Label($, { top: 4, left: 8, width: 110, height: 14, style: headingStyle, string: "Adafruit ST25DV16K" }),
								Label($, {
									top: 3, left: 120, width: 56, height: 16,
									style: new Style({ font: "semibold 10px Open Sans", color: "#f1f5f9", horizontal: "center", vertical: "middle" }),
									skin: buttonSkin,
									active: hardwareSt25dvOk,
									string: "Test Write",
									Behavior: WriteButtonBehavior
								}),
								Label($, { anchor: "NFC_STATUS", top: 4, right: 8, width: 60, height: 14, style: hardwareSt25dvOk ? okStyle : errStyle, string: hardwareSt25dvOk ? "\u25CF OK" : "\u25CF Not Found" }),
								Label($, { top: 22, left: 8, right: 8, height: 12, style: hintStyle, string: hardwareSt25dvOk ? `Chip ID: 0x${hardwareSt25dvID.toString(16).toUpperCase().padStart(2,"0")}` : "Check wiring & addresses 0x53/0x57" }),
								Label($, { anchor: "NFC_URI", top: 36, left: 8, right: 8, height: 14, style: valueStyle, string: "(empty)" }),
								Label($, {
									bottom: 4, left: 8, right: 8, height: 12,
									style: hintStyle,
									horizontal: "center",
									string: "Tap Test Write to program NFC tag"
								})
							]
						}),
					]
				})
			]
		}),

		/* Footer */
		Label($, {
			bottom: 4, left: 6, right: 6, height: 12,
			style: hintStyle,
			horizontal: "center",
			string: ""
		})
	]
}));

export default function () {
	return new SensorApplication({}, { pixels: 240 * 16 });
}
