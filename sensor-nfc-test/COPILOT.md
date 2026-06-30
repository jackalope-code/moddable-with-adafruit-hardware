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

### BMP390 Driver - VERIFIED WORKING (Jun 22 2026)

**The Adafruit C++/C bridge driver for BMP390 is fully functional on real hardware.** The driver integrates with Moddable XS via a project-local manifest and uses native ESP32 I2C (modI2C) for sensor communication. Runtime trace confirms: chip id 0x60, begin OK (initialized), "BMP390 connected". Sensor readings are displayed on the UI with reasonable values (~24.6°C, ~807 hPa).

The Adafruit bridge driver is implemented in the Moddable SDK at:
```
moddable/modules/drivers/sensors/bmp390/
```

This bridge includes:
- Full Bosch BMP3 calibration and compensation algorithms (ported from Adafruit BMP3XX library)
- Native C++ implementation for performance
- Complete feature set (oversampling modes, IIR filter coefficients, ODR settings)
- Native ESP32 I2C (modI2C) integration for reliable hardware communication

### Key Integration Lessons

#### 1. Use Moddable's Native I2C API (modI2C)
**Correct approach:** The BMP390 driver uses Moddable's C I2C API (`modI2C.c`, `modI2C.h`) for all hardware communication. This avoids synchronous native-to-JS callbacks that can deadlock the XS engine.

**Implementation:**
- C++ bridge includes `modI2C.h` wrapped in `extern "C"` to prevent C++ name-mangling
- `modI2CInit`, `modI2CWrite`, `modI2CRead` are synchronous C functions that use the ESP32's `esp_driver_i2c`
- The driver does NOT create separate I2C bus handles; it coordinates with Moddable's I2C module via the weak `i2cActivate` symbol

**Lesson:** Always use Moddable's native C APIs (e.g., modI2C) from native code. Do not create separate hardware handles that conflict with the SDK's management.

#### 2. Project-Local Manifest-Driven Native Compilation
**Correct approach:** Native sources are declared in the driver manifest's `modules` map. Moddable compiles them into the prebuilt archive (`xs_<subclass>.a`) with the full Moddable include path. This is project-local and does not affect other projects.

**Driver manifest example:**
```json
{
  "include": ["$(MODDABLE)/modules/pins/i2c/manifest.json"],
  "modules": {
    "embedded:sensor/Barometer-Temperature/BMP390/Adafruit": ".../bmp390_adafruit",
    "bmp390/binding": ".../bmp390_adafruit_c"
  }
}
```

**Lesson:** DO NOT edit the global SDK template `build/devices/esp32/xsProj-<subclass>/main/CMakeLists.txt` to add app sources. That file is copied verbatim to every project of that subclass and would break other esp32s3 projects.

#### 3. extern "C" Guards for C++/C Interop
**Problem:** C++ code including Moddable C headers (e.g., `modI2C.h`) without `extern "C"` causes name-mangling, leading to undefined references to C symbols.

**Fix:** Wrap the include in the C++ file:
```cpp
extern "C" {
	#include "modI2C.h"
}
```

**Lesson:** Always wrap Moddable C header includes in `extern "C"` when compiling C++ code that calls C functions.

### Why Pure JS is Not Acceptable for BMP390

1. **Performance** - Complex calibration algorithms (e.g., Bosch BMP3 compensation) are slow in JavaScript
2. **Precision** - JavaScript floating-point may not match sensor datasheet requirements
3. **Maintenance** - Porting vendor libraries to JS is error-prone and time-consuming
4. **Features** - Simplified implementations often omit advanced sensor features

### Build System Integration for Native Drivers

**Correct approach:** The host manifest includes the driver manifest and sets `XS_MODS: 1` to enable mod loading. Native driver compilation is unaffected by `XS_MODS` — it compiles into the host archive via the driver manifest's `modules` map.

#### Host Manifest Configuration

The host manifest MUST include the native driver's manifest:
```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
}
```

For mod-based applications (host + app mod), the host manifest MUST set:
```json
{
  "defines": {
    "XS_MODS": 1  // Enables mod loading; does NOT prevent native compilation
  }
}
```

#### Build Order

1. Build the host first (with `XS_MODS: 1`): `mcconfig -d -m -p esp32/moddable_six`
2. Build/install the app mod: `mcrun -d -m -p esp32/moddable_six`

The host owns the mod partition, so it must be flashed before installing a mod.

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
- **NEVER** edit the global SDK template `build/devices/esp32/xsProj-<subclass>/main/CMakeLists.txt` to add app sources
- **NEVER** create separate I2C bus handles in native code
- **NEVER** make synchronous calls from native callbacks into JavaScript
- **NEVER** include Moddable C headers in C++ without `extern "C"` guards
- **NEVER** assume `XS_MODS: 1` prevents native compilation (it does not)

### Critical Lessons from BMP390 Integration
1. **Use Moddable's native C APIs** - The modI2C API provides synchronous C I2C without JS reentrancy issues.
2. **Project-local manifest-driven compilation** - Declare native sources in the driver manifest's `modules` map; do not touch global SDK templates.
3. **extern "C" for C++/C interop** - Wrap Moddable C header includes in `extern "C"` to prevent name-mangling.
4. **Build order matters** - Flash the host first (it owns the mod partition), then install the app mod.
5. **XS_MODS enables mods, not disables native code** - Native code compiles into the host archive regardless of `XS_MODS`.

## Build Instructions

Build the host first (with mod support), then the app mod:

```sh
cd host
mcconfig -d -m -p esp32/moddable_six

cd ../app
mcrun -d -m -p esp32/moddable_six
```

If mod install fails with `resultCode -8`, the host still has `XS_MODS: 0` from a previous build. Rebuild the host first.

## Hardware

- **Board:** Moddable Six (ESP32-S3)
- **I2C Bus:** GPIO4 (SDA), GPIO5 (SCL)
- **BMP390 Address:** 0x77 (default), 0x76 if SDO pulled low
- **RTC Address:** 0x68
- **ST25DV16K Addresses:** 0x53 (user), 0x57 (system)

## Debugging

In debug mode (`-d`), xsdebug may pause on I2C NACK errors. Type `c` to continue. The app handles missing devices gracefully with "Not Found" status.

## ChronoDot UI: Piu Framework Lessons Learned

When working with Piu UIs (especially interactive forms with keyboard input), follow these critical patterns:

### Piu Behavior Instance Access: `.behavior` vs `Behavior`

**CRITICAL:** In Piu, the behavior instance attached to a content object is accessed via **lowercase `.behavior`**. Uppercase `Behavior` is only the template dictionary key. Using `screen.Behavior` (uppercase) returns `undefined`, causing all interactive handlers to silently no-op.

**Correct:**
```javascript
const sb = screen.behavior;  // or screen?.behavior
```

**Incorrect:**
```javascript
const sb = screen.Behavior;  // undefined
```

This bug affected all interactive elements (+/- buttons, Next, Save, AM/PM toggle, field tap) because they all fetched the screen behavior via uppercase `Behavior`.

### KeyboardField Behavior Override Pitfall

The `KeyboardField` template (from `expanding-keyboard/common/keyboard.js`) ships with a **built-in `Behavior: KeyboardFieldBehavior`** that handles text rendering, cursor blinking, and `onKeyUp` event handling. Overriding this behavior with a custom behavior on the field itself destroys all of that functionality.

**Incorrect (destroys built-in behavior):**
```javascript
KeyboardField($, { anchor: "MONTH_FIELD", Behavior: FieldTapBehavior, ... })
```

**Correct (preserve built-in behavior, move custom behavior to wrapper):**
```javascript
Container($, { active: true, Behavior: FieldTapBehavior, contents: [
    KeyboardField($, { anchor: "MONTH_FIELD", ... })
]})
```

The wrapper container's `first` child is the `KeyboardField`, so the custom behavior can still access it.

### Piu Event Delegation: `delegate()` vs Direct Method Call

Piu's event system uses `delegate()` to route events through the behavior chain. Calling a behavior method directly (e.g., `behavior.onKeyUp(field, "")`) bypasses this routing and may not work as expected. Use `delegate()` instead.

**Correct:**
```javascript
field.delegate("onKeyUp", "");
```

**Incorrect:**
```javascript
field.behavior.onKeyUp(field, "");
```

### RTC Century Bit Handling

The DS3231/ChronoDot RTC uses a century bit in the month register to distinguish years 1900–1999 from 2000–2099. The driver correctly sets this bit when saving dates ≥ 2000, but if the RTC was never initialized with a valid date, the century bit may be unset, causing years like 26 to be read as 1926.

**Fix:** Pre-read the RTC time when navigating to the date screen and initialize the date values appropriately. The driver's `_setDate` method handles the century bit correctly on save.

### Avoid `distribute()` Name Collisions

Using `app.distribute("methodName")` with a method name that also exists on another behavior in the distribute chain can cause re-entrancy issues or double-calls. Instead, call the target behavior's method directly after saving any necessary state.

**Incorrect (collision risk):**
```javascript
app.distribute("onNavigateToSetTime");
```

**Correct (direct call):**
```javascript
const appBeh = app.behavior;
appBeh.dateValues = { month: sb.month, day: sb.day, year: sb.year };
appBeh.onNavigateToSetTime(app);
```

### Keyboard Numeric Mode and Dismissal

The `HorizontalExpandingKeyboard` supports multiple modes via `toggleMode` (0=lowercase, 1=SHIFT, 2=ALT for digits+symbols). To open in numeric mode, set `kbd.behavior.toggleMode = 2` before adding the keyboard to the container (key rows read this value on display).

To dismiss the keyboard by tapping outside its area, add a transparent scrim overlay above the keyboard with a behavior that calls a dismiss helper on tap. The scrim should cover the area above the keyboard (e.g., `bottom: 160` when the keyboard is 160px tall at the bottom).

**Example:**
```javascript
// Open keyboard in numeric mode
const kbd = HorizontalExpandingKeyboard(sb.data, { style, target, doTransition });
kbd.behavior.toggleMode = 2;  // ALT mode (digits + symbols)
sb.data.KEYBOARD.add(kbd);

// Add scrim for tap-outside-to-dismiss
sb.scrim = new Container(null, { top: 0, left: 0, right: 0, bottom: 160, active: true, Behavior: KeyboardScrimBehavior });
screen.add(sb.scrim);
```

### Cursor Management for KeyboardField

Each `KeyboardField` has a cursor (its last child) that blinks via its own timer. By default, all fields show cursors, which is confusing. Manage cursors by:

- Hiding all cursors initially in `onDisplaying`
- Showing only the active field's cursor on tap
- Hiding all cursors when the keyboard closes (on OK or dismiss)

**Helper functions:**
```javascript
function hideFieldCursor(field) {
    if (field && field.last) { field.last.stop(); field.last.visible = false; }
}
function showFieldCursor(field) {
    if (field && field.last) { field.last.visible = true; field.last.start(); }
}
```
