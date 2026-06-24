/*
 * ST25DV16K Driver
 * Pure-JavaScript I2C driver for the Adafruit ST25DV16K NFC/RFID EEPROM.
 *
 * Supports:
 *   - Chip ID detection
 *   - User-memory read / write
 *   - Simple NDEF URI record write / read
 *
 * I2C addresses (7-bit):
 *   - User memory : 0x53
 *   - System memory: 0x57
 */

import Timer from "timer";

const ADDR_DATA = 0x53;
const ADDR_SYST = 0x57;

const REG_ICREF = 0x0017;

// Well-known ST25DV chip IDs
const ID_ST25DV04 = 0x24;
const ID_ST25DV64 = 0x26;
const ID_ST25DV04KC = 0x50;
const ID_ST25DV64KC = 0x52;

const NDEF_TLV_NDEF = 0x03;
const NDEF_TLV_TERM = 0xFE;
const NDEF_WKT_URI = 0x55; // 'U'

const URI_PREFIXES = Object.freeze([
	"", "http://www.", "https://www.", "http://", "https://",
	"tel:", "mailto:"
]);

class ST25DV16K {
	#dataBus;
	#sysBus;

	constructor(options) {
		const busOpts = {
			hz: 400_000,
			...options.sensor
		};
		this.#dataBus = new busOpts.io({
			...busOpts,
			address: ADDR_DATA
		});
		this.#sysBus = new busOpts.io({
			...busOpts,
			address: ADDR_SYST
		});
	}

	close() {
		this.#dataBus?.close();
		this.#sysBus?.close();
		this.#dataBus = undefined;
		this.#sysBus = undefined;
	}

	/* ---- system ---- */

	readChipID() {
		this.#writeAddress(this.#sysBus, REG_ICREF);
		const id = new Uint8Array(1);
		this.#sysBus.read(id);
		return id[0];
	}

	isPresent() {
		try {
			const id = this.readChipID();
			return [ID_ST25DV04, ID_ST25DV64, ID_ST25DV04KC, ID_ST25DV64KC].includes(id);
		} catch (e) {
			return false;
		}
	}

	/* ---- user memory ---- */

	readMemory(address, length) {
		if (address < 0 || length < 0 || address + length > 2048)
			throw new RangeError("ST25DV16K user memory bounds exceeded");
		this.#writeAddress(this.#dataBus, address);
		const data = new Uint8Array(length);
		this.#dataBus.read(data);
		return data;
	}

	writeMemory(address, data) {
		if (address < 0 || address + data.length > 2048)
			throw new RangeError("ST25DV16K user memory bounds exceeded");
		let offset = 0;
		while (offset < data.length) {
			const remain = data.length - offset;
			const PAGE_SIZE = 4;
			const pageEnd = (address + offset + PAGE_SIZE) & ~(PAGE_SIZE - 1);
			const chunkLen = Math.min(remain, pageEnd - (address + offset), PAGE_SIZE);
			const chunk = new Uint8Array(2 + chunkLen);
			const addr = address + offset;
			chunk[0] = (addr >> 8) & 0xFF;
			chunk[1] = addr & 0xFF;
			chunk.set(data.subarray(offset, offset + chunkLen), 2);
			this.#dataBus.write(chunk);
			Timer.delay(10); // EEPROM write cycle (datasheet max ~10ms)
			offset += chunkLen;
		}
	}

	/* ---- NDEF helpers ---- */

	writeNDEF_URI(uri) {
		// Build a single NDEF URI record wrapped in TLVs
		let prefixIdx = 0;
		let uriBody = uri;
		for (let i = 1; i < URI_PREFIXES.length; i++) {
			const p = URI_PREFIXES[i];
			if (uri.startsWith(p)) {
				prefixIdx = i;
				uriBody = uri.slice(p.length);
				break;
			}
		}

		const uriBytes = new Uint8Array(uriBody.length);
		for (let i = 0; i < uriBody.length; i++)
			uriBytes[i] = uriBody.charCodeAt(i);

		const payloadLen = 1 + uriBytes.length;
		const recordLen = 4 + payloadLen; // header + type_len + payload_len + type + payload
		const ndefLen = recordLen;

		let tlv;
		if (ndefLen < 255) {
			tlv = new Uint8Array(2 + ndefLen + 1);
			tlv[0] = NDEF_TLV_NDEF;
			tlv[1] = ndefLen;
			tlv.set(this.#buildNDEFRecord(prefixIdx, uriBytes), 2);
			tlv[tlv.length - 1] = NDEF_TLV_TERM;
		} else {
			// two-byte length
			tlv = new Uint8Array(4 + ndefLen + 1);
			tlv[0] = NDEF_TLV_NDEF;
			tlv[1] = 0xFF;
			tlv[2] = (ndefLen >> 8) & 0xFF;
			tlv[3] = ndefLen & 0xFF;
			tlv.set(this.#buildNDEFRecord(prefixIdx, uriBytes), 4);
			tlv[tlv.length - 1] = NDEF_TLV_TERM;
		}

		this.writeMemory(0x0000, tlv);
	}

	readNDEFURI() {
		// Read first bytes to detect NDEF TLV
		const header = this.readMemory(0x0000, 4);
		if (header[0] !== NDEF_TLV_NDEF)
			return null;

		let ndefLen, ndefOff;
		if (header[1] !== 0xFF) {
			ndefLen = header[1];
			ndefOff = 2;
		} else {
			ndefLen = (header[2] << 8) | header[3];
			ndefOff = 4;
		}

		const ndef = this.readMemory(ndefOff, ndefLen);
		// Parse single record (header, typeLen, payloadLen, type, payload...)
		const recHeader = ndef[0];
		const typeLen = ndef[1];
		const payloadLen = ndef[2];
		const type = ndef[3];
		if (type !== NDEF_WKT_URI)
			return null;

		const prefixIdx = ndef[4];
		const prefix = URI_PREFIXES[prefixIdx] ?? "";
		let body = "";
		for (let i = 5; i < 5 + payloadLen - 1; i++)
			body += String.fromCharCode(ndef[i]);

		return prefix + body;
	}

	/* ---- private ---- */

	#writeAddress(bus, address) {
		bus.write(new Uint8Array([(address >> 8) & 0xFF, address & 0xFF]));
	}

	#buildNDEFRecord(prefixIdx, uriBytes) {
		const payloadLen = 1 + uriBytes.length;
		const rec = new Uint8Array(4 + payloadLen);
		rec[0] = 0xD1; // MB=1, ME=1, SR=1, TNF=Well-Known Type
		rec[1] = 0x01; // Type Length
		rec[2] = payloadLen; // Payload Length (short record)
		rec[3] = NDEF_WKT_URI;
		rec[4] = prefixIdx;
		rec.set(uriBytes, 5);
		return rec;
	}
}

export { ST25DV16K as default, ST25DV16K };
