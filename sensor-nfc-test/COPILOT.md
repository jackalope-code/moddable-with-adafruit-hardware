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

## Adding Native Hardware Drivers (CRITICAL)

### When to Use Native C/C++ Drivers

**Use native C/C++ drivers (not pure JavaScript) for:**
- Complex sensors with calibration algorithms (e.g., BMP390, BME680, ICM-20948)
- Drivers that require high performance or precision
- Drivers ported from vendor libraries (Adafruit, Bosch, etc.)

**Pure JavaScript is acceptable for:**
- Simple I2C/SPI devices with straightforward register reads/writes
- Devices where vendor libraries are unavailable
- Prototyping and testing

### BMP390 Driver - INTEGRATION IN PROGRESS (NOT YET FUNCTIONAL)

**This project is implementing the Adafruit C++/C bridge driver for BMP390.** The integration is currently incomplete and the driver is not yet functional.

The Adafruit bridge driver is being implemented in the Moddable SDK at:
```
moddable/modules/drivers/sensors/bmp390/
```

This bridge includes:
- Full Bosch BMP3 calibration and compensation algorithms (ported from Adafruit BMP3XX library)
- Native C++ implementation for performance
- Complete feature set (oversampling modes, IIR filter coefficients, ODR settings)

### Known Integration Challenges

#### 1. I2C Synchronous Callback Deadlock
**Problem:** Synchronous calls from native C++ callbacks into JavaScript I2C methods cause the host to hang or crash.

**Root Cause:** The Moddable XS engine is not thread-safe for synchronous JavaScript calls from native callbacks. The BMP390 C++ library calls I2C write/read callbacks, which then call JavaScript I2C methods, causing a deadlock.

**Attempted Solutions:**
- Wrapping callbacks with `xsTry`/`xsCatch` - did not prevent deadlock
- Retaining JavaScript I2C object references with `xsRemember` - did not prevent deadlock
- Creating a native ESP32 I2C driver to avoid JavaScript callbacks - caused host crash due to I2C bus initialization conflict

**Lesson Learned:** Do not create separate I2C bus handles in native code. Always use the JavaScript I2C object that's already initialized by the Moddable SDK.

**Current Status:** Driver is disabled pending resolution of the I2C callback issue.

#### 2. Build System Limitations
**Problem:** The Moddable build system does NOT automatically compile native C/C++ sources listed in manifest `sources` arrays, even when those manifests are included.

**Root Cause:** The build system processes JavaScript modules and generates XS bytecode, but doesn't add native sources from included manifests to the CMakeLists.txt.

**Workaround:** Inline native code directly into the C binding file (`bmp390_adafruit_c.c`) so it gets compiled as part of the main component.

**Lesson Learned:** For native drivers in the Moddable SDK, either:
- Inline all native code into the C binding file, OR
- Manually add native sources to the host manifest's `sources` array (if the build system supports it)

### Why Pure JS is Not Acceptable for BMP390

1. **Performance** - Complex calibration algorithms (e.g., Bosch BMP3 compensation) are slow in JavaScript
2. **Precision** - JavaScript floating-point may not match sensor datasheet requirements
3. **Maintenance** - Porting vendor libraries to JS is error-prone and time-consuming
4. **Features** - Simplified implementations often omit advanced sensor features

### Build System Integration for Native Drivers

**CRITICAL:** The host must be built WITHOUT the `XS_MODS: 1` flag to allow native C/C++ sources from included manifests to compile.

#### Host Manifest Configuration

The host manifest MUST include the native driver's manifest:
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

#### Inlining Native Code

Due to build system limitations, native code should be inlined directly into the C binding file rather than kept in separate files. This ensures the code is compiled as part of the main component.

**File:** `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c`

Include all native implementation code directly in this file. The C++ bridge (`bmp390_adafruit.cpp`) can remain separate since it's compiled by the build system.

### Macro Compatibility

When integrating native drivers, check for macro compatibility with the current Moddable SDK version:

**Example: `xsNewArray` macro**
- Old signature: `xsNewArray(the, length, constructor)`
- New signature: `xsNewArray(length)`

If compilation fails with macro errors, check the macro definition in `moddable/xs/includes/xs.h` and update the driver code accordingly.

## When Working on Hardware Drivers

### DO's
- **DO** use native drivers from the Moddable SDK when available
- **DO** ensure the host manifest includes the driver's manifest
- **DO** verify native C/C++ sources are compiling during build
- **DO** verify macro compatibility with the current SDK version
- **DO** inline native code directly into C binding files to ensure compilation
- **DO** use the JavaScript I2C object that's already initialized by Moddable SDK
- **DO** test with serial monitor to see crash details if host fails silently
- **DO** document integration challenges and lessons learned in README.md

### DON'Ts
- **NEVER** suggest pure JS implementations for complex sensors
- **NEVER** add `XS_MODS: 1` to the host manifest
- **NEVER** create separate I2C bus handles in native code
- **NEVER** make synchronous calls from native callbacks into JavaScript
- **NEVER** assume the Moddable build system will automatically compile native sources from included manifests

### Critical Lessons from BMP390 Integration
1. **Avoid synchronous JS callbacks from native code** - The XS engine is not thread-safe for this pattern. It causes deadlocks and crashes.
2. **Don't create separate hardware handles** - Always use the JavaScript objects that Moddable SDK has already initialized.
3. **Inline native code when needed** - The build system has limitations; inlining ensures compilation.
4. **Test early with serial output** - Silent crashes are hard to debug. Add trace statements and use a serial monitor.

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
