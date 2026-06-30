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
	fill: ["#334155", "#1e293b"],  // normal, darker pressed
	stroke: "#64748b",
	borders: { left: 1, right: 1, top: 1, bottom: 1 }
});
const buttonStyle = new Style({
	font: "semibold 12px Open Sans",
	color: "#f1f5f9",
	horizontal: "center"
});

const blueButtonStyle = new Style({
	font: "semibold 12px Open Sans",
	color: "#38bdf8",
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
		trace("tap sound error: " + e + "\n");
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
				const str = this.tempC.toFixed(1) + "\u00B0C / " + CtoF(this.tempC).toFixed(1) + "\u00B0F";
				this.$.BMP_TEMP.string = str;
			}
			if (this.$.BMP_PRESS) {
				const str = PaTohPa(this.pressure).toFixed(1) + " hPa";
				this.$.BMP_PRESS.string = str;
			}
			if (this.$.BMP_STATUS) { this.$.BMP_STATUS.string = "\u25CF OK"; this.$.BMP_STATUS.style = okStyle; }
		} catch (e) {
			trace("BMP390 read error: " + e + "\n");
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
			if (this.$.RTC_TIME) this.$.RTC_TIME.string = hh + colon + mm + colon + ss;
			if (this.$.RTC_DATE) this.$.RTC_DATE.string = DAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + " " + d.getUTCFullYear();
			if (this.$.RTC_STATUS) { this.$.RTC_STATUS.string = "\u25CF OK"; this.$.RTC_STATUS.style = okStyle; }
		} catch (e) {
			trace("RTC read error: " + e + "\n");
			if (this.$.RTC_STATUS) { this.$.RTC_STATUS.string = "\u25CF Error"; this.$.RTC_STATUS.style = errStyle; }
		}
	}
	updateST25DV() {
		if (!hardwareSt25dv || !hardwareSt25dvOk) return;
		try {
			trace("ST25DV reading URI...\n");
			this.uri = hardwareSt25dv.readNDEFURI() ?? "";
			trace("ST25DV URI: " + this.uri + "\n");
			if (this.$.NFC_URI) this.$.NFC_URI.string = this.uri || "(empty)";
		} catch (e) {
			trace("ST25DV read error: " + e + "\n");
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
			trace("ST25DV write error: " + e + "\n");
		}
	}
}

class SetDateTimeButtonBehavior extends BaseButtonBehavior {
	onTouchEnded(l, id, x, y, ticks) {
		if (isScrolling) return;
		trace("Set Date/Time button pressed\n");
		l.state = 0;
		if (!hardwareRtcOk) {
			trace("RTC not available\n");
			return;
		}
		const app = l.application;
		app.distribute("onNavigateToSetDate");
	}
}

// Named button behaviors for navigation
class BackButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const appBehavior = app.behavior;
		if (appBehavior && appBehavior.onNavigateToMain) {
			appBehavior.onNavigateToMain(app);
		}
	}
}

class BackToSetDateButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const appBehavior = app.behavior;
		if (appBehavior && appBehavior.onNavigateToSetDate) {
			appBehavior.onNavigateToSetDate(app);
		}
	}
}

class NextButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const sb = app.first?.behavior;
		const appBeh = app.behavior;
		if (sb && appBeh) {
			appBeh.dateValues = { month: sb.month, day: sb.day, year: sb.year };
			appBeh.onNavigateToSetTime(app);
		}
	}
}

class SaveButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const sb = app.first?.behavior;
		const appBeh = app.behavior;
		if (sb && appBeh) {
			appBeh.timeValues = { hour: sb.hour, minute: sb.minute, second: sb.second, isPM: sb.isPM };
			appBeh.onSaveDateTime(app);
		}
	}
}

// Named increment/decrement button behaviors for date fields
class MonthIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.month !== undefined) {
			sb.month++;
			if (sb.month > 12) sb.month = 1;
			if (sb.data?.MONTH_FIELD) {
				sb.data.MONTH_FIELD.behavior.string = String(sb.month).padStart(2, "0");
				sb.data.MONTH_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class MonthDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.month !== undefined) {
			sb.month--;
			if (sb.month < 1) sb.month = 12;
			if (sb.data?.MONTH_FIELD) {
				sb.data.MONTH_FIELD.behavior.string = String(sb.month).padStart(2, "0");
				sb.data.MONTH_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class DayIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.day !== undefined) {
			sb.day++;
			if (sb.day > 31) sb.day = 1;
			if (sb.data?.DAY_FIELD) {
				sb.data.DAY_FIELD.behavior.string = String(sb.day).padStart(2, "0");
				sb.data.DAY_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class DayDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.day !== undefined) {
			sb.day--;
			if (sb.day < 1) sb.day = 31;
			if (sb.data?.DAY_FIELD) {
				sb.data.DAY_FIELD.behavior.string = String(sb.day).padStart(2, "0");
				sb.data.DAY_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class YearIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.year !== undefined) {
			sb.year++;
			if (sb.year > 2099) sb.year = 2000;
			if (sb.data?.YEAR_FIELD) {
				sb.data.YEAR_FIELD.behavior.string = String(sb.year).padStart(4, "0");
				sb.data.YEAR_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class YearDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.year !== undefined) {
			sb.year--;
			if (sb.year < 2000) sb.year = 2099;
			if (sb.data?.YEAR_FIELD) {
				sb.data.YEAR_FIELD.behavior.string = String(sb.year).padStart(4, "0");
				sb.data.YEAR_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

// Named increment/decrement button behaviors for time fields
class HourIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.hour !== undefined) {
			sb.hour++;
			if (sb.hour > 12) sb.hour = 1;
			if (sb.data?.HOUR_FIELD) {
				sb.data.HOUR_FIELD.behavior.string = String(sb.hour).padStart(2, "0");
				sb.data.HOUR_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class HourDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.hour !== undefined) {
			sb.hour--;
			if (sb.hour < 1) sb.hour = 12;
			if (sb.data?.HOUR_FIELD) {
				sb.data.HOUR_FIELD.behavior.string = String(sb.hour).padStart(2, "0");
				sb.data.HOUR_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class MinuteIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.minute !== undefined) {
			sb.minute++;
			if (sb.minute > 59) sb.minute = 0;
			if (sb.data?.MINUTE_FIELD) {
				sb.data.MINUTE_FIELD.behavior.string = String(sb.minute).padStart(2, "0");
				sb.data.MINUTE_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class MinuteDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.minute !== undefined) {
			sb.minute--;
			if (sb.minute < 0) sb.minute = 59;
			if (sb.data?.MINUTE_FIELD) {
				sb.data.MINUTE_FIELD.behavior.string = String(sb.minute).padStart(2, "0");
				sb.data.MINUTE_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class SecondIncButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.second !== undefined) {
			sb.second++;
			if (sb.second > 59) sb.second = 0;
			if (sb.data?.SECOND_FIELD) {
				sb.data.SECOND_FIELD.behavior.string = String(sb.second).padStart(2, "0");
				sb.data.SECOND_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class SecondDecButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const app = label.application;
		const screen = app.first;
		const screenBehavior = screen?.behavior;
		const sb = screenBehavior;
		if (sb && sb.second !== undefined) {
			sb.second--;
			if (sb.second < 0) sb.second = 59;
			if (sb.data?.SECOND_FIELD) {
				sb.data.SECOND_FIELD.behavior.string = String(sb.second).padStart(2, "0");
				sb.data.SECOND_FIELD.delegate("onKeyUp", "");
			}
		}
	}
}

class AMPMToggleButtonBehavior extends Behavior {
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		const sb = label.application.first?.behavior;
		if (sb && sb.isPM !== undefined) {
			sb.isPM = !sb.isPM;
			const str = sb.isPM ? "PM" : "AM";
			label.string = str;
			if (sb.data?.AMPM_LABEL) sb.data.AMPM_LABEL.string = str;
		}
	}
}

// KeyboardField cursor (last child) blinks via its own timer; manage it per-field
const FIELD_ANCHORS = ["MONTH_FIELD", "DAY_FIELD", "YEAR_FIELD", "HOUR_FIELD", "MINUTE_FIELD", "SECOND_FIELD"];
function hideFieldCursor(field) {
	if (field && field.last) { field.last.stop(); field.last.visible = false; }
}
function showFieldCursor(field) {
	if (field && field.last) { field.last.visible = true; field.last.start(); }
}
function hideAllCursors(data) {
	for (let a of FIELD_ANCHORS) hideFieldCursor(data[a]);
}

// HorizontalExpandingKeyboard toggle modes: 0=lowercase, 1=SHIFT, 2=ALT (digits + symbols)
const KEYBOARD_NUMERIC_MODE = 2;

// Transparent overlay above the keyboard; tapping it dismisses the keyboard
class KeyboardScrimBehavior extends Behavior {
	onTouchEnded(scrim) {
		const sb = scrim.application.first?.behavior;
		if (sb) dismissKeyboard(sb);
	}
}

function dismissKeyboard(sb) {
	if (sb.data.KEYBOARD) sb.data.KEYBOARD.empty();
	if (sb.scrim) {
		if (sb.scrim.container) sb.scrim.container.remove(sb.scrim);
		sb.scrim = null;
	}
	hideAllCursors(sb.data);
	sb.activeField = null;
}

// Field tap behavior (on the white wrapper container) to show keyboard targeting the contained field
class FieldTapBehavior extends Behavior {
	onTouchBegan(wrapper) {}
	onTouchEnded(wrapper) {
		const field = wrapper.first;
		const screen = wrapper.application.first;
		const sb = screen?.behavior;
		if (!sb || !field) return;
		sb.activeField = field;
		hideAllCursors(sb.data);
		showFieldCursor(field);
		if (sb.data.KEYBOARD) {
			sb.data.KEYBOARD.empty();
			const kbd = HorizontalExpandingKeyboard(sb.data, {
				style: fieldStyle,
				target: field,
				doTransition: true,
			});
			// Rows read keyboard.toggleMode on display, so set numeric mode before adding
			kbd.behavior.toggleMode = KEYBOARD_NUMERIC_MODE;
			sb.data.KEYBOARD.add(kbd);
		}
		// Add a transparent scrim above the keyboard so tapping outside dismisses it
		if (sb.scrim && sb.scrim.container) sb.scrim.container.remove(sb.scrim);
		sb.scrim = new Container(null, { top: 0, left: 0, right: 0, bottom: 160, active: true, Behavior: KeyboardScrimBehavior });
		screen.add(sb.scrim);
	}
}

// Application-level behavior for screen navigation
class ApplicationBehavior extends Behavior {
	onCreate(application) {
		this.currentScreen = "main";
		this.dateValues = { month: 1, day: 1, year: 2025 };
		this.timeValues = { hour: 12, minute: 0, second: 0, isPM: false };
	}

	onNavigateToSetDate(application) {
		trace("Navigating to Set Date screen\n");
		if (hardwareRtc && hardwareRtcOk) {
			try {
				const ms = hardwareRtc.time;
				const d = new Date(ms);
				const yr = d.getUTCFullYear();
				const hr = d.getUTCHours();
				this.dateValues = { month: d.getUTCMonth() + 1, day: d.getUTCDate(), year: yr < 2000 ? 2025 : yr };
				const isPM = hr >= 12;
				this.timeValues = { hour: (hr % 12) || 12, minute: d.getUTCMinutes(), second: d.getUTCSeconds(), isPM };
			} catch (e) { trace("RTC read error on navigate: " + e + "\n"); }
		}
		this.currentScreen = "setDate";
		this.switchScreen(application);
	}

	onNavigateToSetTime(application) {
		trace("Navigating to Set Time screen\n");
		this.currentScreen = "setTime";
		this.switchScreen(application);
	}

	onNavigateToMain(application) {
		trace("Navigating to main screen\n");
		this.currentScreen = "main";
		this.switchScreen(application);
	}

	onSaveDateTime(application) {
		trace("Saving date/time to ChronoDot\n");
		try {
			const { month, day, year } = this.dateValues;
			const { hour, minute, second, isPM } = this.timeValues;
			
			// Convert 12-hour to 24-hour
			let hour24 = hour;
			if (isPM && hour !== 12) hour24 += 12;
			if (!isPM && hour === 12) hour24 = 0;
			
			// Create Date object (UTC)
			const date = new Date(Date.UTC(year, month - 1, day, hour24, minute, second));
			
			if (hardwareRtc && hardwareRtcOk) {
				hardwareRtc.time = date.getTime();
				trace("Date/time saved to ChronoDot\n");
			} else {
				trace("RTC not available\n");
			}
			
			this.currentScreen = "main";
			this.switchScreen(application);
		} catch (e) {
			trace("Error saving date/time: " + e + "\n");
		}
	}

	switchScreen(application) {
		trace("Switching to screen: " + this.currentScreen + "\n");
		application.empty();
		if (this.currentScreen === "main") {
			application.add(new MainScreen({}));
		} else if (this.currentScreen === "setDate") {
			this.dateData = { dateValues: this.dateValues };
			application.add(new SetDateScreen(this.dateData));
		} else if (this.currentScreen === "setTime") {
			this.timeData = { timeValues: this.timeValues };
			application.add(new SetTimeScreen(this.timeData));
		}
	}
}

const fieldStyle = new Style({
	font: "semibold 16px Open Sans",
	color: "black",
	horizontal: "left",
	vertical: "middle",
});

const whiteSkin = new Skin({ fill: "white" });

// Set Date screen behavior
class SetDateScreenBehavior extends Behavior {
	onCreate(container, data) {
		this.data = data;
		this.dateValues = data.dateValues || { month: 1, day: 1, year: 2025 };
		this.month = this.dateValues.month;
		this.day = this.dateValues.day;
		this.year = this.dateValues.year;
		this.activeField = null;
	}
	onDisplaying(container) {
		if (this.data.MONTH_FIELD) {
			this.data.MONTH_FIELD.behavior.string = String(this.month).padStart(2, "0");
			this.data.MONTH_FIELD.delegate("onKeyUp", "");
		}
		if (this.data.DAY_FIELD) {
			this.data.DAY_FIELD.behavior.string = String(this.day).padStart(2, "0");
			this.data.DAY_FIELD.delegate("onKeyUp", "");
		}
		if (this.data.YEAR_FIELD) {
			this.data.YEAR_FIELD.behavior.string = String(this.year).padStart(4, "0");
			this.data.YEAR_FIELD.delegate("onKeyUp", "");
		}
		hideAllCursors(this.data);
	}
	onKeyboardOK(container, string) {
		if (this.activeField) {
			const value = parseInt(string, 10);
			if (!isNaN(value)) {
				const f = this.activeField;
				if (f === this.data.MONTH_FIELD) {
					this.month = Math.max(1, Math.min(12, value));
					f.behavior.string = String(this.month).padStart(2, "0");
					f.delegate("onKeyUp", "");
				} else if (f === this.data.DAY_FIELD) {
					this.day = Math.max(1, Math.min(31, value));
					f.behavior.string = String(this.day).padStart(2, "0");
					f.delegate("onKeyUp", "");
				} else if (f === this.data.YEAR_FIELD) {
					this.year = Math.max(2000, Math.min(2099, value));
					f.behavior.string = String(this.year).padStart(4, "0");
					f.delegate("onKeyUp", "");
				}
			}
		}
		dismissKeyboard(this);
	}
	onKeyboardTransitionFinished(container, out) {
		if (out && this.data.KEYBOARD) this.data.KEYBOARD.empty();
	}
}

// Set Time screen behavior
class SetTimeScreenBehavior extends Behavior {
	onCreate(container, data) {
		this.data = data;
		this.timeValues = data.timeValues || { hour: 12, minute: 0, second: 0, isPM: false };
		this.hour = this.timeValues.hour;
		this.minute = this.timeValues.minute;
		this.second = this.timeValues.second;
		this.isPM = this.timeValues.isPM;
		this.activeField = null;
	}
	onDisplaying(container) {
		if (this.data.HOUR_FIELD) {
			this.data.HOUR_FIELD.behavior.string = String(this.hour).padStart(2, "0");
			this.data.HOUR_FIELD.delegate("onKeyUp", "");
		}
		if (this.data.MINUTE_FIELD) {
			this.data.MINUTE_FIELD.behavior.string = String(this.minute).padStart(2, "0");
			this.data.MINUTE_FIELD.delegate("onKeyUp", "");
		}
		if (this.data.SECOND_FIELD) {
			this.data.SECOND_FIELD.behavior.string = String(this.second).padStart(2, "0");
			this.data.SECOND_FIELD.delegate("onKeyUp", "");
		}
		if (this.data.AMPM_LABEL) this.data.AMPM_LABEL.string = this.isPM ? "PM" : "AM";
		hideAllCursors(this.data);
	}
	onKeyboardOK(container, string) {
		if (this.activeField) {
			const value = parseInt(string, 10);
			if (!isNaN(value)) {
				const f = this.activeField;
				if (f === this.data.HOUR_FIELD) {
					this.hour = Math.max(1, Math.min(12, value));
					f.behavior.string = String(this.hour).padStart(2, "0");
					f.delegate("onKeyUp", "");
				} else if (f === this.data.MINUTE_FIELD) {
					this.minute = Math.max(0, Math.min(59, value));
					f.behavior.string = String(this.minute).padStart(2, "0");
					f.delegate("onKeyUp", "");
				} else if (f === this.data.SECOND_FIELD) {
					this.second = Math.max(0, Math.min(59, value));
					f.behavior.string = String(this.second).padStart(2, "0");
					f.delegate("onKeyUp", "");
				}
			}
		}
		dismissKeyboard(this);
	}
	onKeyboardTransitionFinished(container, out) {
		if (out && this.data.KEYBOARD) this.data.KEYBOARD.empty();
	}
}

let MainScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0,
	skin: bgSkin,
	Behavior: MainBehavior,
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
							top: 10, left: 0, right: 0, height: 94,
							skin: cardSkin,
							contents: [
								Label($, { top: 4, left: 8, height: 14, style: headingStyle, string: "ChronoDot 3.0" }),
								Label($, { anchor: "RTC_STATUS", top: 4, right: 8, height: 14, style: hardwareRtcOk ? okStyle : errStyle, string: hardwareRtcOk ? "\u25CF OK" : "\u25CF Not Found" }),
								Label($, { anchor: "RTC_TIME", top: 22, left: 8, right: 8, height: 24, style: timeStyle, string: hardwareRtcOk ? "--:--:--" : "--" }),
								Label($, { anchor: "RTC_DATE", top: 48, left: 8, right: 8, height: 16, style: valueStyle, string: hardwareRtcOk ? "Reading..." : "Check wiring & address 0x68" }),
								Label($, {
									top: 66, left: 8, width: 80, height: 16,
									style: blueButtonStyle,
									skin: buttonSkin,
									active: hardwareRtcOk,
									string: "Set Date/Time",
									Behavior: SetDateTimeButtonBehavior
								})
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
								Label($, { top: 22, left: 8, right: 8, height: 12, style: hintStyle, string: hardwareSt25dvOk ? "Chip ID: 0x" + hardwareSt25dvID.toString(16).toUpperCase().padStart(2,"0") : "Check wiring & addresses 0x53/0x57" }),
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

// Navigation button behavior
class NavButtonBehavior extends Behavior {
	onCreate(label, data) {
		this.eventName = data.eventName;
	}
	onTouchBegan(label) {
		label.state = 1;
		playTap();
	}
	onTouchEnded(label) {
		label.state = 0;
		if (this.eventName) {
			label.application.distribute(this.eventName);
		}
	}
}

// Set Date screen
let SetDateScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0,
	skin: bgSkin,
	Behavior: SetDateScreenBehavior,
	contents: [
		Row($, {
			top: 0, left: 0, right: 0, height: 40,
			contents: [
				Label($, {
					left: 0, top: 0, bottom: 0, width: 80,
					style: buttonStyle,
					skin: buttonSkin,
					active: true,
					string: "< Back",
					Behavior: BackButtonBehavior
				}),
				Label($, {
					left: 80, right: 0, top: 0, bottom: 0,
					style: titleStyle,
					string: "Set date",
					horizontal: "center"
				})
			]
		}),
		Container($, {
			top: 50, bottom: 0, left: 0, right: 0,
			contents: [
				Column($, {
					left: 20, right: 20, top: 0,
					contents: [
						// Month field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "MM:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "MONTH_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "01" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: MonthIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: MonthDecButtonBehavior })
							]
						}),
						// Day field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "DD:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "DAY_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "01" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: DayIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: DayDecButtonBehavior })
							]
						}),
						// Year field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "YYYY:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "YEAR_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "2025" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: YearIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: YearDecButtonBehavior })
							]
						}),
						// Next button
						Label($, {
							top: 20, height: 36, left: 0, right: 0,
							style: buttonStyle,
							skin: buttonSkin,
							active: true,
							string: "Next >",
							Behavior: NextButtonBehavior
						})
					]
				})
			]
		}),
		Container($, {
			anchor: "KEYBOARD",
			left: 0, right: 0, bottom: 0, height: 160,
		})
	]
}));

// Set Time screen
let SetTimeScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0,
	skin: bgSkin,
	Behavior: SetTimeScreenBehavior,
	contents: [
		Row($, {
			top: 0, left: 0, right: 0, height: 40,
			contents: [
				Label($, {
					left: 0, top: 0, bottom: 0, width: 80,
					style: buttonStyle,
					skin: buttonSkin,
					active: true,
					string: "< Back",
					Behavior: BackToSetDateButtonBehavior
				}),
				Label($, {
					left: 80, right: 0, top: 0, bottom: 0,
					style: titleStyle,
					string: "Set time",
					horizontal: "center"
				})
			]
		}),
		Container($, {
			top: 50, bottom: 0, left: 0, right: 0,
			contents: [
				Column($, {
					left: 20, right: 20, top: 0,
					contents: [
						// Hour field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "HH:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "HOUR_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "12" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: HourIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: HourDecButtonBehavior })
							]
						}),
						// Minute field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "MM:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "MINUTE_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "00" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: MinuteIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: MinuteDecButtonBehavior })
							]
						}),
						// Second field
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "SS:" }),
								Container($, { left: 40, width: 50, height: 28, skin: whiteSkin, active: true, Behavior: FieldTapBehavior, contents: [
									KeyboardField($, { anchor: "SECOND_FIELD", left: 4, right: 4, top: 0, bottom: 0, style: fieldStyle, string: "00" })
								]}),
								Label($, { left: 95, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "+", Behavior: SecondIncButtonBehavior }),
								Label($, { left: 130, top: 0, bottom: 0, width: 30, style: buttonStyle, skin: buttonSkin, active: true, string: "-", Behavior: SecondDecButtonBehavior })
							]
						}),
						// AM/PM toggle
						Container($, {
							top: 10, height: 28, left: 0, right: 0,
							contents: [
								Label($, { left: 0, top: 0, bottom: 0, width: 40, style: valueStyle, string: "" }),
								Label($, { anchor: "AMPM_LABEL", left: 40, width: 50, height: 28, style: buttonStyle, skin: buttonSkin, active: true, string: "AM", Behavior: AMPMToggleButtonBehavior })
							]
						}),
						// Save button
						Label($, {
							top: 20, height: 36, left: 0, right: 0,
							style: buttonStyle,
							skin: buttonSkin,
							active: true,
							string: "Save",
							Behavior: SaveButtonBehavior
						})
					]
				})
			]
		}),
		Container($, {
			anchor: "KEYBOARD",
			left: 0, right: 0, bottom: 0, height: 160,
		})
	]
}));

let SensorApplication = Application.template($ => ({
	skin: bgSkin,
	Behavior: ApplicationBehavior,
	commandListLength: 4096,
	displayListLength: 8192,
	touchCount: 1,
	contents: [
		new MainScreen({})
	]
}));

export default function () {
	return new SensorApplication({}, { pixels: 240 * 16 });
}
