# Copilot AI Assistant Instructions

## Project Overview

This is a sensor and NFC hardware test project for the Moddable Six (ESP32-S3) board. It tests three Adafruit breakouts on the I2C bus:
- BMP390 (temperature + pressure sensor)
- ChronoDot 3.0 (MAX31328 RTC, DS3231-compatible)
- ST25DV16K (I2C RFID/NFC EEPROM)

## Architecture

The project uses a **mod-based architecture**:
- **Host** (`host/`) - Probes hardware, loads app mod in a Compartment
- **App Mod** (`app/`) - Piu UI that runs in a sandboxed compartment

The host passes hardware references as globals to the app mod. This allows the app to be updated without rebuilding the host.

## BMP390 Driver - CRITICAL REQUIREMENT

### Required Driver: Adafruit Bridge

**This project MUST use the Adafruit C++/C bridge driver for BMP390.** Pure JavaScript drivers are NOT acceptable for this project.

The Adafruit bridge driver is implemented in the Moddable SDK at:
```
moddable/modules/drivers/sensors/bmp390/
```

This bridge includes:
- Full Bosch BMP3 calibration and compensation algorithms (ported from Adafruit BMP3XX library)
- Native C++ implementation for performance
- Complete feature set (oversampling modes, IIR filter coefficients, ODR settings)

### Why Pure JS is Not Acceptable

Pure JavaScript drivers are limiting for complex sensors like the BMP390 because:

1. **Performance** - Complex calibration algorithms (e.g., Bosch BMP3 compensation) are slow in JavaScript
2. **Precision** - JavaScript floating-point may not match sensor datasheet requirements
3. **Maintenance** - Porting vendor libraries to JS is error-prone and time-consuming
4. **Features** - Simplified implementations often omit advanced sensor features

### Build System Requirement

**CRITICAL:** The host must be built WITHOUT the `XS_MODS: 1` flag to allow native C/C++ sources from included manifests to compile.

The host manifest MUST include:
```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
}
```

And must NOT include:
```json
{
  "defines": {
    "XS_MODS": 1  // This prevents native C/C++ compilation
  }
}
```

### When Working on BMP390

- **NEVER** suggest pure JS implementations for BMP390
- **ALWAYS** use the Adafruit bridge implementation at `moddable/modules/drivers/sensors/bmp390/`
- **ALWAYS** ensure the host manifest includes the BMP390 manifest
- **NEVER** add `XS_MODS: 1` to the host manifest
- **DO** verify native C/C++ sources are compiling during build

## Build Instructions

Always build the app mod first, then the host:

```sh
cd app
mcrun -d -m -p esp32/moddable_six

cd ../host
mcconfig -d -m -p esp32/moddable_six
```

## Hardware

- **Board:** Moddable Six (ESP32-S3)
- **I2C Bus:** GPIO4 (SDA), GPIO5 (SCL)
- **BMP390 Address:** 0x77 (default), 0x76 if SDO pulled low
- **RTC Address:** 0x68
- **ST25DV16K Addresses:** 0x53 (user), 0x57 (system)

## Debugging

In debug mode (`-d`), xsdebug may pause on I2C NACK errors. Type `c` to continue. The app handles missing devices gracefully with "Not Found" status.
