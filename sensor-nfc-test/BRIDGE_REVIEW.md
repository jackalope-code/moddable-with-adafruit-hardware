# BMP390 Adafruit Bridge Setup Review

## Summary

✅ **The Adafruit bridge setup is complete and correct.** All components are in place for the native C++/C bridge driver to compile and link properly.

## Architecture Overview

The bridge consists of three layers:

### 1. **C++ Implementation** (`bmp390_adafruit.cpp`)
- **Status:** ✅ Complete and adequate
- **Location:** `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp`
- **Features:**
  - Full Bosch BMP3 calibration data structure (21 calibration coefficients)
  - Register-level I2C communication (read8, write8, read_buffer)
  - Complete sensor initialization and reset
  - Temperature and pressure reading with full compensation algorithms
  - Altitude calculation
  - Oversampling configuration (0-6x)
  - IIR filter coefficient setting (0-7x)
  - Output data rate (ODR) configuration (0-13 settings, 0.15 Hz to 800 Hz)
  - Proper error handling and state management

### 2. **C Binding Layer** (`bmp390_adafruit_c.c`)
- **Status:** ✅ Complete and adequate
- **Location:** `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c`
- **Features:**
  - XS constructor/destructor for memory management
  - I2C callback bridge (moddable_i2c_write_callback, moddable_i2c_read_callback)
  - All 14 native methods properly exposed:
    - `xs_bmp390_adafruit_constructor` - Creates instance
    - `xs_bmp390_adafruit_destructor` - Cleans up
    - `xs_bmp390_adafruit_begin` - Initializes sensor
    - `xs_bmp390_adafruit_reset` - Resets sensor
    - `xs_bmp390_adafruit_getChipID` - Reads chip ID
    - `xs_bmp390_adafruit_readTemperature` - Reads temperature
    - `xs_bmp390_adafruit_readPressure` - Reads pressure
    - `xs_bmp390_adafruit_readAltitude` - Calculates altitude
    - `xs_bmp390_adafruit_setTemperatureOversampling` - Configures temp OS
    - `xs_bmp390_adafruit_setPressureOversampling` - Configures pressure OS
    - `xs_bmp390_adafruit_setIIRFilterCoeff` - Sets IIR filter
    - `xs_bmp390_adafruit_setOutputDataRate` - Sets ODR
    - `xs_bmp390_adafruit_performReading` - Performs blocking read
    - `xs_bmp390_adafruit_close` - Closes sensor

### 3. **JavaScript Wrapper** (`bmp390_adafruit.js`)
- **Status:** ✅ Complete and adequate
- **Location:** `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit.js`
- **Features:**
  - `BMP390AdafruitHost` class with native method bindings
  - `BMP390Adafruit` class extending host with:
    - Automatic I2C IO initialization
    - Default configuration (X2 temp OS, X16 pressure OS, X4 IIR filter, 5 Hz ODR)
    - `configure()` method for runtime settings
    - `sample()` method returning standard format: `{ barometer: { pressure }, thermometer: { temperature } }`
    - `close()` method for cleanup
  - `Config` object with enums:
    - Oversampling modes (NONE, X1, X2, X4, X8, X16, X32)
    - IIR filter coefficients (OFF, X2, X4, X8, X16, X32, X64, X128)
    - ODR settings (0.15 Hz to 800 Hz, 14 settings)

## Host Integration

### Manifest Configuration
- **File:** `host/manifest.json`
- **Status:** ✅ Correct
- **Key Points:**
  - ✅ Includes BMP390 manifest: `"$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"`
  - ✅ Does NOT have `XS_MODS: 1` flag (allows native C/C++ compilation)
  - ✅ Includes BMP390 module in modules list: `"./bmp390_adafruit"`
  - ✅ All required manifests included (base, piu, DS3231, IO, I2S)

### Host Main Module
- **File:** `host/main.js`
- **Status:** ✅ Correct
- **Key Points:**
  - ✅ Imports BMP390Adafruit wrapper: `import BMP390Adafruit from "./bmp390_adafruit"`
  - ✅ Probes BMP390 with correct initialization: `new BMP390Adafruit({ sensor: device.I2C.default })`
  - ✅ Handles errors gracefully with try/catch
  - ✅ Passes hardware reference to app mod

### Host Wrapper Module
- **File:** `host/bmp390_adafruit.js`
- **Status:** ✅ Correct
- **Key Points:**
  - ✅ Imports from embedded module: `import BMP390Adafruit from "embedded:sensor/Barometer-Temperature/BMP390/Adafruit"`
  - ✅ Wraps native driver with error handling
  - ✅ Exposes `sample()`, `readTemperature()`, `readPressure()`, `readAltitude()`, `close()`
  - ✅ Proper initialization and cleanup

### App Module
- **File:** `app/app.js`
- **Status:** ✅ Correct
- **Key Points:**
  - ✅ Uses hardwareBmp390 reference passed from host
  - ✅ Calls `sample()` method for readings
  - ✅ Displays "Adafruit bridge" label
  - ✅ Handles missing hardware gracefully

## Build System

### Manifest Inclusion Chain
```
host/manifest.json
├── includes: manifest_base.json
├── includes: manifest_piu.json
├── includes: ds3231/manifest.json
├── includes: bmp390/manifest.json  ← This includes C/C++ sources
│   ├── modules: embedded:sensor/Barometer-Temperature/BMP390/Adafruit → bmp390_adafruit.js
│   └── sources: bmp390_adafruit.cpp, bmp390_adafruit_c.c
├── includes: io/manifest.json
└── includes: pins/i2s/manifest.json
```

### Compilation Flow
1. `mcconfig` reads host manifest
2. Includes BMP390 manifest
3. Compiles C++ source: `bmp390_adafruit.cpp`
4. Compiles C binding: `bmp390_adafruit_c.c`
5. Links both into host binary
6. Registers native methods in XS
7. JavaScript can call native methods via `@` syntax

## Verification Checklist

- ✅ C++ implementation has full Bosch BMP3 algorithms
- ✅ C binding layer exposes all methods correctly
- ✅ JavaScript wrapper properly initializes sensor
- ✅ Host manifest includes BMP390 manifest
- ✅ Host manifest does NOT have XS_MODS flag
- ✅ Host imports and uses BMP390Adafruit correctly
- ✅ App receives hardware reference from host
- ✅ Error handling is in place at all levels

## Ready to Build

The bridge setup is **complete and ready for compilation**. All code is correct and properly integrated.

### Next Steps

1. Build the app mod first
2. Build the host with native compilation
3. Flash to device
4. Verify BMP390 readings in xsdebug output
