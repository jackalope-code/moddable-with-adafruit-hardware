/*
 * Adafruit BMP280 Sensor Demo
 * Moddable Six (ESP32-S3) — hardware-demo
 *
 * Connects to an Adafruit BMP280 (temperature + barometric pressure)
 * via I2C on the Moddable Six Qwiic/Stemma QT connector
 * (SDA=GPIO4, SCL=GPIO5) and displays readings using Piu.
 *
 * Build:  mcconfig -d -m -p esp32/moddable_six
 */

import {} from "piu/MC";
import BMP280, { Config } from "embedded:sensor/Barometer-Temperature/BMP280";
import Timer from "timer";

const CtoF = c => (c * 1.8) + 32;
const PaTohPa = pa => pa / 100.0;
const PaToInHg = pa => pa * 0.0002953;

let sensor;
let sensorOk = false;

try {
	sensor = new BMP280({ sensor: device.I2C.default });
	sensorOk = true;
	trace("BMP280 connected\n");
} catch (e) {
	trace(`BMP280 not found: ${e}\n`);
}

const bgSkin = new Skin({ fill: "#0f172a" });
const titleStyle = new Style({
	font: "semibold 20px Open Sans",
	color: "#38bdf8",
	horizontal: "center"
});
const valueStyle = new Style({
	font: "normal normal normal 52px Open Sans",
	color: "#f1f5f9",
	horizontal: "center"
});
const labelStyle = new Style({
	font: "normal normal normal 18px Open Sans",
	color: "#94a3b8",
	horizontal: "center"
});
const statusStyle = new Style({
	font: "semibold 16px Open Sans",
	color: sensorOk ? "#22c55e" : "#ef4444",
	horizontal: "center"
});

class WeatherBehavior extends Behavior {
	onCreate(app, $) {
		this.$ = $;
		this.tempC = null;
		this.pressure = null;
		if (sensorOk) this.update();
		app.interval = 2000;
		app.start();
	}
	onTimeChanged(app) {
		if (sensorOk) this.update();
	}
	update() {
		try {
			const sample = sensor.sample();
			this.tempC = sample.thermometer.temperature;
			this.pressure = sample.barometer.pressure;
			this.render();
		} catch (e) {
			trace(`BMP280 read error: ${e}\n`);
		}
	}
	render() {
		const t = this.tempC;
		const p = this.pressure;
		if (t !== null) {
			this.$.TEMP_LABEL.string = `${t.toFixed(1)}°C / ${CtoF(t).toFixed(1)}°F`;
		}
		if (p !== null) {
			this.$.PRESS_LABEL.string = `${PaTohPa(p).toFixed(1)} hPa`;
			this.$.INHG_LABEL.string = `${PaToInHg(p).toFixed(3)} inHg`;
		}
	}
}

let WeatherApplication = Application.template($ => ({
	Behavior: WeatherBehavior,
	skin: bgSkin,
	contents: [
		Label($, {
			top: 28, left: 0, right: 0, height: 28,
			style: titleStyle,
			string: "Adafruit BMP280"
		}),
		Label($, {
			anchor: "TEMP_LABEL",
			top: 80, left: 8, right: 8, height: 52,
			style: valueStyle,
			string: "--"
		}),
		Label($, {
			top: 134, left: 0, right: 0, height: 22,
			style: labelStyle,
			string: "Temperature"
		}),
		Label($, {
			anchor: "PRESS_LABEL",
			top: 172, left: 8, right: 8, height: 52,
			style: valueStyle,
			string: "--"
		}),
		Label($, {
			anchor: "INHG_LABEL",
			top: 224, left: 8, right: 8, height: 28,
			style: labelStyle,
			string: ""
		}),
		Label($, {
			bottom: 24, left: 0, right: 0, height: 22,
			style: statusStyle,
			string: sensorOk ? "\u25CF Sensor Connected" : "\u25CF Sensor Not Found"
		})
	]
}));

export default new WeatherApplication({}, { pixels: 240 * 16 });
