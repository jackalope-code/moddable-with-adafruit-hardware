# Sensor & NFC Hardware Test

Combined test app for three Adafruit breakouts on the Moddable Six Qwiic/Stemma QT bus.

## Prerequisites

- **ESP-IDF activated shell:** You must build this project from an ESP-IDF activated shell (ESP-IDF 6.0+ recommended, 6.0.1 tested and working). The Moddable build system requires ESP-IDF environment variables to be set. Do not use regular PowerShell or CMD.
- **Moddable SDK:** Installed and configured per Moddable documentation.

## Hardware

| Component | Details |
|-----------|---------|
| Board | Moddable Six (ESP32-S3) |
| Sensor | Adafruit BMP390 (temp + pressure) |
| RTC | Adafruit ChronoDot 3.0 (MAX31328, DS3231-compatible) |
| NFC | Adafruit ST25DV16K (I2C RFID/NFC EEPROM) |
| Bus | I2C via Qwiic / Stemma QT connector |

### Wiring

All three devices share the same I2C bus. Daisy-chain the Qwiic/Stemma QT connectors:

| Breakout | Moddable Six Qwiic (JST-SH 4-pin) |
|----------|-----------------------------------|
| VIN / 3.3V | 3.3V |
| GND | GND |
| SDA | GPIO4 |
| SCL | GPIO5 |

**ChronoDot 3.0 note:** It uses 0.1" headers (not Qwiic). Connect with jumper wires to the 16-pin external header (pins 1–4) and **add 4.7 kΩ pull-up resistors** (SDA→3.3V, SCL→3.3V) because the ChronoDot does not ship with pull-ups installed. See `chronodot-clock/README.md` for details.

### I2C Addresses

| Device | Address | Notes |
|--------|---------|-------|
| BMP390 | 0x77 (default) | Jumper to 0x76 if SDO pulled low |
| DS3231 / MAX31328 RTC | 0x68 | — |
| ST25DV16K user memory | 0x53 | — |
| ST25DV16K system memory | 0x57 | used for chip ID |

## Project Structure

```
sensor-nfc-test/
  host/
    main.js          — probes hardware, loads app mod in Compartment
    manifest.json    — host manifest (includes Piu, DS3231, fonts)
  app/
    app.js           — Piu UI with three hardware cards
    manifest.json    — app mod manifest
  README.md
  COPILOT.md        — Copilot AI assistant instructions for adding hardware
```

## BMP390 Driver Implementation

### Status: VERIFIED WORKING (Jun 22 2026)

**The Adafruit C++/C bridge driver for BMP390 is fully functional on real hardware.** The driver integrates with Moddable XS via a project-local manifest and uses native ESP32 I2C (modI2C) for sensor communication. Runtime trace confirms: chip id 0x60, begin OK (initialized), "BMP390 connected". Sensor readings are displayed on the UI with reasonable values (~24.6°C, ~807 hPa).

### Architecture

The BMP390 driver is implemented in three layers:

1. **C++ Bridge** (`bmp390_adafruit.cpp`) - Ported from Adafruit BMP3XX library
   - Implements Bosch BMP3 calibration and compensation algorithms
   - Provides register read/write helpers and sensor initialization
   - Uses native ESP32 I2C (modI2C) for all hardware communication

2. **C Binding** (`bmp390_adafruit_c.c`) - XS JavaScript integration
   - Implements native XS methods: `constructor`, `begin`, `readTemperature`, `readPressure`, `readAltitude`, `performReading`
   - Manages instance lifecycle

3. **JavaScript Module** (`bmp390_adafruit.js`) - High-level driver interface
   - Wraps native C binding with error handling
   - Provides `sample()`, `readTemperature()`, `readPressure()`, `readAltitude()` methods

### Build System Integration (Correct Method)

**Native code compiles via the driver manifest's `modules` map into the Moddable archive (project-local).** The host manifest includes the driver manifest:
```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
}
```

The driver manifest (`modules/drivers/sensors/bmp390/manifest.json`) declares the native sources:
```json
{
  "include": ["$(MODDABLE)/modules/pins/i2c/manifest.json"],
  "modules": {
    "embedded:sensor/Barometer-Temperature/BMP390/Adafruit": ".../bmp390_adafruit",
    "bmp390/binding": ".../bmp390_adafruit_c"
  }
}
```

**DO NOT** edit the global SDK template `build/devices/esp32/xsProj-<subclass>/main/CMakeLists.txt` to add app sources. That file is copied verbatim to every project of that subclass and would break other esp32s3 projects.

### modI2C Link Fix

The C++ bridge includes `modI2C.h` for native I2C. Since `modI2C.h` has no `extern "C"` guard, C++ name-mangling caused undefined references to the C symbols in `pins/i2c/esp32/modI2C.c`. **Fix:** wrap the include in `bmp390_adafruit.cpp`:
```cpp
extern "C" {
	#include "modI2C.h"
}
```

### Why Pure JS is Not Acceptable

Pure JavaScript drivers are limiting for complex sensors like the BMP390 because:

- **Computational overhead** - Complex calibration algorithms (e.g., Bosch BMP3 compensation) are slow in JavaScript
- **Limited precision** - JavaScript floating-point may not match sensor datasheet requirements
- **Maintenance burden** - Porting vendor libraries to JS is error-prone and time-consuming
- **Feature gaps** - Simplified implementations often omit advanced sensor features

## Build & Run

**Build the host first (with mod support), then the app mod.** The host owns the mod partition, so it must be flashed before installing a mod.

### 1. Build the host

```sh
cd host
mcconfig -d -m -p esp32/moddable_six
```

The host probes all three hardware devices at boot, then loads the app mod in a Compartment and injects the hardware references as globals. If no mod archive is present, a fallback screen is shown.

**Important:** The host manifest sets `"XS_MODS": 1` to enable mod support. This does NOT prevent native driver compilation — native code compiles into the host archive via the driver manifest regardless.

### 2. Build the app mod

```sh
cd app
mcrun -d -m -p esp32/moddable_six
```

This compiles `app.js` into an XS mod archive and installs it on the device over the debug link. The device restarts and runs the UI.

## Features

- **Modular hardware detection** — each sensor is wrapped in `try/catch` at host startup. Missing devices are passed as `null` to the app, which displays "Not Found" instead of crashing.
- **BMP390 live readings** — temperature (°C / °F) and pressure (hPa) update every 2 seconds.
- **ChronoDot 3.0 clock** — time updates every 500 ms with a blinking colon; date shown below.
- **ST25DV16K NFC programming** — tap the **"Write https://www.google.com"** button to write an NDEF URI record. The tag is readable by NFC phones even when unpowered.
- **Read-back verification** — the app reads the tag back after writing and displays the current URI.

## Screen Layout (Portrait 240×320)

- **Title bar** — "Sensor & NFC Test"
- **BMP390 card** — temp, pressure, status
- **RTC card** — HH:MM:SS with blinking colon, date, status
- **ST25DV16K card** — chip ID, current NDEF URI, write button
- Cards use the dark navy / slate theme borrowed from `iot-remote`.

## Troubleshooting

### xsdebug breaks on "writeRead failed" (I2C NACK)

In **debug mode (`-d`)**, the Moddable ESP32 I2C driver pauses xsdebug on every NACK before JavaScript `try/catch` can run. The zero-byte probe in `host/main.js` reduces the chance of a break, but it may still pause if the ESP-IDF driver reports the missing device as an error.

**Workarounds:**
- Type `c` (continue) in xsdebug to proceed. The app will show "Not Found" for that device.
- Build **without** the debug flag for a smooth run:
  ```sh
  mcconfig -m -p esp32/moddable_six   # no -d
  ```

### "No Wi-Fi SSID" or other unrelated traces

These come from a previous build (e.g. `iot-remote`) still resident on the device. Flash clean before building:
```sh
mcconfig -d -m -p esp32/moddable_six -t clean
```

### Mod install fails with "resultCode -8"

**Cause:** The host firmware still has `XS_MODS: 0` from a previous build. The `-8` code means "mods not supported".

**Fix:** Rebuild the host first to enable mod support:
```sh
cd host
mcconfig -d -m -p esp32/moddable_six
```
Then install the mod:
```sh
cd ../app
mcrun -d -m -p esp32/moddable_six
```

### BMP390 shows "Not Found"

- Verify wiring: SDA→GPIO4, SCL→GPIO5, 3.3V, GND
- Check I2C address: default 0x77 (jumper to 0x76 if SDO pulled low)
- Verify the driver manifest is included in the host manifest
- Trace output shows detailed probe results

### RTC shows "Not Found"

- The ChronoDot 3.0 **requires external 4.7 kΩ pull-up resistors** on SDA and SCL. See the wiring section above.
- Verify the battery is installed (+ side up).

### ST25DV16K shows "Not Found"

- The ST25DV16K has two I2C addresses: `0x53` (user memory) and `0x57` (system). Both must respond.
- Try power-cycling the breakout if it was previously in a busy state.

## Adding Future Hardware

For detailed instructions on integrating native C/C++ drivers, see **NATIVE_BRIDGE_ARCHITECTURE_GUIDE_WITH_MODDABLE_SDK.md**. This guide covers:

- When to use native C/C++ drivers vs. pure JavaScript
- Three-layer bridge architecture (JS wrapper → C binding → C++ bridge)
- Step-by-step setup guide with code examples
- Critical best practices (modI2C, extern "C", project-local manifests)
- Common pitfalls and solutions
- Complete BMP390 integration as a working example

See **COPILOT.md** for AI assistant-specific instructions and project context.
