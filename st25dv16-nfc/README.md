# Adafruit ST25DV16K NFC Demo

Programs an **Adafruit ST25DV16K** I2C RFID/NFC EEPROM with a URI NDEF record and displays tag status on the Moddable Six screen.

## Features

- Detects the ST25DV16K over I2C
- Writes a `https://www.moddable.com` NDEF URI record into user memory
- Verifies the record by reading it back
- The tag remains readable by NFC-enabled phones **even when unpowered**

## Wiring

Connect the ST25DV16K breakout to the Moddable Six Qwiic/Stemma QT connector (JST-SH 4-pin):

| ST25DV16K | Moddable Six |
|-----------|-------------|
| VIN       | 3.3V        |
| GND       | GND         |
| SDA       | GPIO4       |
| SCL       | GPIO5       |

## Build & Run

```bash
mcconfig -d -m -p esp32/moddable_six
```

After the app writes the URL, tap the breakout board with an NFC-enabled phone. The phone should prompt to open the URL.

## Driver API

`st25dv.js` exposes a pure-JavaScript driver:

```js
import ST25DV16K from "./st25dv";

const tag = new ST25DV16K({ sensor: device.I2C.default });

if (tag.isPresent()) {
    const id = tag.readChipID();          // e.g. 0x24
    tag.writeNDEF_URI("https://example.com");
    const url = tag.readNDEFURI();        // read back
}
```

- `readMemory(address, length)` — raw user-EEPROM read
- `writeMemory(address, Uint8Array)` — raw user-EEPROM write
- `writeNDEF_URI(uri)` — writes a single Well-Known Type URI record
- `readNDEFURI()` — reads and parses a single URI record (or returns `null`)
