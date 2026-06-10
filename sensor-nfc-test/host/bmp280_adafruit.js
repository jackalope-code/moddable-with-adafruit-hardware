/*
 * BMP280 Adafruit Bridge Driver
 * Uses the C++/C Adafruit library bridge for BMP280
 *
 * I2C address: 0x77 (default) or 0x76 (SDO pulled low)
 *
 * This driver tests the Adafruit library integration with Moddable
 */

import BMP280Adafruit from "embedded:sensor/Barometer-Temperature/BMP280/Adafruit";

class BMP280AdafruitDriver {
	#sensor;
	#ready;

	constructor(options) {
		this.#ready = false;
		
		try {
			this.#sensor = new BMP280Adafruit({
				sensor: {
					io: options.sensor.io,
					address: options.address ?? 0x76,
					...options.sensor
				}
			});
			this.#ready = true;
			trace("BMP280 Adafruit bridge initialized\n");
		} catch (e) {
			trace(`BMP280 Adafruit bridge error: ${e.message}\n`);
			if (this.#sensor) {
				this.#sensor.close();
				this.#sensor = null;
			}
			throw e;
		}
	}

	get ready() { return this.#ready; }

	close() {
		this.#sensor?.close();
		this.#sensor = null;
		this.#ready = false;
	}

	sample() {
		if (!this.#ready) throw new Error("BMP280 not initialized");
		
		try {
			const reading = this.#sensor.sample();
			trace(`BMP280 Adafruit: temp=${reading.thermometer.temperature.toFixed(2)}°C pressure=${reading.barometer.pressure.toFixed(2)} Pa\n`);
			return reading;
		} catch (e) {
			trace(`BMP280 sample error: ${e.message}\n`);
			throw e;
		}
	}

	// Direct access to Adafruit methods for testing
	readTemperature() {
		if (!this.#ready) throw new Error("BMP280 not initialized");
		return this.#sensor.readTemperature();
	}

	readPressure() {
		if (!this.#ready) throw new Error("BMP280 not initialized");
		return this.#sensor.readPressure();
	}

	readAltitude(seaLevel = 1013.25) {
		if (!this.#ready) throw new Error("BMP280 not initialized");
		return this.#sensor.readAltitude(seaLevel);
	}
}

export { BMP280AdafruitDriver as default, BMP280AdafruitDriver };
