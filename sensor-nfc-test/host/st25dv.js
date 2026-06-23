/*
 * ST25DV16K Driver
 * Native C++/C bridge driver using STM32duino-style API
 */

import ST25DVSTM32duino from "embedded:nfc/ST25DV/STM32duino";

class ST25DV16K {
	#sensor;
	#ready;

	constructor(options) {
		this.#ready = false;
		
		try {
			this.#sensor = new ST25DVSTM32duino({
				sensor: options.sensor
			});
			this.#ready = true;
			trace("ST25DV STM32duino bridge initialized\n");
		} catch (e) {
			trace(`ST25DV STM32duino bridge error: ${e.message}\n`);
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

	readChipID() {
		if (!this.#ready) throw new Error("ST25DV not initialized");
		return this.#sensor.getChipID();
	}

	isPresent() {
		try {
			const id = this.readChipID();
			return [0x24, 0x26, 0x50, 0x52].includes(id);
		} catch (e) {
			return false;
		}
	}

	writeNDEFURI(uri) {
		if (!this.#ready) throw new Error("ST25DV not initialized");
		return this.#sensor.writeURI(uri);
	}

	readNDEFURI() {
		if (!this.#ready) throw new Error("ST25DV not initialized");
		return this.#sensor.readURI();
	}
}

export { ST25DV16K as default, ST25DV16K };
