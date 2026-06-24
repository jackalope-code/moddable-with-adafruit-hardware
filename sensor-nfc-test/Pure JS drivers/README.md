# Pure JavaScript Drivers

This folder contains pure JavaScript implementations of drivers for demonstration and comparison with native bridge implementations.

## Drivers

### time.js
Arduino Time library ported to Moddable SDK. Provides Arduino-compatible time functions using JavaScript's Date object as the underlying time source.

**Note:** This driver is currently not integrated into the sensor-nfc-test app. The app uses Moddable SDK's built-in `embedded:RTC/DS3231` driver instead.

**To integrate the Time library:**
1. Import the Time library functions in `app/app.js`
2. Replace `hardwareRtc.time` usage with `now()` from the Time library
3. Use `setTime()` to set the time from the ChronoDot or user input
4. Optionally implement a sync provider using `setSyncProvider()` to periodically sync with the ChronoDot
5. Replace Date object usage with Time library functions (`hour()`, `minute()`, etc.)

**Features:**
- Arduino-compatible API (`hour()`, `minute()`, `second()`, `day()`, `month()`, `year()`, `weekday()`)
- Time sync provider pattern (`setSyncProvider()`, `setSyncInterval()`)
- Date string functions (`monthStr()`, `dayStr()`, etc.)
- `breakTime()` / `makeTime()` for converting between time_t and struct tm

**Usage:**
```javascript
import { now, setTime, hour, minute, breakTime, makeTime } from "./time.js";

// Get current time
const t = now();
trace(`Current hour: ${hour(t)}\n`);

// Set time
setTime(2025, 1, 1, 12, 0, 0); // Jan 1, 2025, 12:00:00

// Convert to/from struct
const tm = breakTime(now());
const time = makeTime(tm);
```

### bmp390.js
Pure JavaScript implementation of the BMP390 temperature/pressure sensor driver.

**Note:** This implementation is slower than the native bridge version due to the complex floating-point calibration algorithms. For production use, prefer the native bridge driver at `moddable/modules/drivers/sensors/bmp390/`.

**Features:**
- I2C communication using Moddable's ECMA-419 I2C API
- Bosch BMP3 calibration algorithms in JavaScript
- Arduino-compatible API (matches native bridge)

**Usage:**
```javascript
import BMP390, { Config } from "./bmp390.js";

const sensor = new BMP390({ sensor: device.I2C.default });
if (sensor.begin()) {
    const temp = sensor.readTemperature();
    const pressure = sensor.readPressure();
    trace(`Temp: ${temp}°C, Pressure: ${pressure} Pa\n`);
}
```

### st25dv.js
Pure JavaScript driver for the ST25DV16K NFC/RFID EEPROM.

**Features:**
- Chip ID detection
- User-memory read/write
- NDEF URI record write/read
- I2C communication using Moddable's ECMA-419 I2C API

**Usage:**
```javascript
import ST25DV16K from "./st25dv.js";

const tag = new ST25DV16K({ sensor: device.I2C.default });
if (tag.isPresent()) {
    tag.writeNDEF_URI("https://example.com");
    const url = tag.readNDEFURI();
    trace(`Tag URL: ${url}\n`);
}
```

## Native Bridge vs Pure JavaScript

### When to Use Native Bridge

Native bridge drivers (C/C++ → C binding → JavaScript wrapper) are preferred when:

1. **Complex algorithms** - Sensors with heavy calibration math (e.g., BMP390, BME680)
2. **Performance-critical** - High-frequency sampling or real-time processing
3. **Vendor libraries** - Porting existing C/C++ vendor libraries
4. **Low-level hardware access** - Direct register manipulation or timing-sensitive operations

**Example:** The BMP390 native driver uses C++ for Bosch calibration algorithms, which would be slow in JavaScript.

### When to Use Pure JavaScript

Pure JavaScript drivers are suitable when:

1. **Simple protocols** - Basic I2C/SPI register reads/writes
2. **Low data rates** - Infrequent polling or event-driven updates
3. **Rapid prototyping** - Quick testing without native compilation
4. **Learning** - Understanding hardware communication patterns

**Example:** The ST25DV16K driver works well in pure JavaScript because it's simple EEPROM operations.

## Native Bridge Architecture

For detailed information on implementing native bridge drivers, see:
- `../NATIVE_BRIDGE_ARCHITECTURE_GUIDE_WITH_MODDABLE_SDK.md`

The guide covers:
- Three-layer bridge architecture (JS wrapper → C binding → C++ bridge)
- Step-by-step setup guide with code examples
- Critical best practices (modI2C, extern "C", project-local manifests)
- Common pitfalls and solutions
- Complete BMP390 integration as a working example

## Performance Comparison

| Driver | Native Bridge | Pure JS | Notes |
|--------|--------------|---------|-------|
| BMP390 | ~1ms reading | ~5-10ms reading | Calibration math is heavy in JS |
| ST25DV16K | ~2ms write | ~2ms write | Simple operations, similar performance |
| Time | N/A | ~0.1ms | Uses JS Date natively |

## Related Documentation

- **Moddable SDK JS and UI Usage:** `../../MODDABLE_SDK_JS_AND_UI_USAGE.md`
- **Native Bridge Architecture Guide:** `../NATIVE_BRIDGE_ARCHITECTURE_GUIDE_WITH_MODDABLE_SDK.md`
- **BMP390 Native Driver:** `moddable/modules/drivers/sensors/bmp390/`
