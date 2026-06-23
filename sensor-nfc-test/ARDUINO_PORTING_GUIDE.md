# Arduino to Moddable Porting Guide

This guide explains how to port Arduino libraries to the Moddable SDK using the native C++/C bridge pattern. It covers common challenges, required changes, and best practices, with the ST25DV NFC library as a case study.

## Overview

Arduino libraries use C++ with Arduino-specific APIs (Wire.h, Arduino.h, String, Stream, etc.). Moddable uses the XS JavaScript engine with native C/C++ extensions. To bridge this gap, we use a three-layer architecture:

```
JavaScript Application
    ↓ XS native method calls
JavaScript Wrapper Module
    ↓ XS native method bindings
C Binding Layer
    ↓ Direct C function calls
C++ Bridge Layer
    ↓ Moddable native APIs
Moddable Native APIs (modI2C, modSPI, etc.)
    ↓ Platform drivers
Hardware
```

## Key Arduino-to-Moddable Replacements

### 1. Arduino Headers

| Arduino | Moddable |
|---------|----------|
| `#include "Arduino.h"` | `#include "xsHost.h"` (C binding) or remove (C++) |
| `#include <Wire.h>` | `#include "modI2C.h"` (wrap in `extern "C"`) |
| `#include <Stream.h>` | Remove or stub (not needed in Moddable) |
| `#include <SPI.h>` | `#include "modSPI.h"` (wrap in `extern "C"`) |

### 2. I2C Communication

**Arduino (Wire.h):**
```cpp
Wire.begin();
Wire.beginTransmission(address);
Wire.write(register);
Wire.endTransmission();
Wire.requestFrom(address, length);
byte data = Wire.read();
```

**Moddable (modI2C):**
```cpp
extern "C" {
    #include "modI2C.h"
}

modI2CConfigurationRecord config;
config.sda = 4;
config.scl = 5;
config.hz = 400000;
void *i2c = modI2CInit(&config);

uint8_t addr_buf[2] = { reg_high, reg_low };
modI2CWrite(i2c, address, addr_buf, 2);
uint8_t data[16];
modI2CRead(i2c, address, data, 16);
```

**Critical:** Wrap `modI2C.h` in `extern "C"` in C++ files to prevent name-mangling linker errors.

### 3. String Handling

**Arduino (String class):**
```cpp
String uri = "https://www.google.com";
int len = uri.length();
char c = uri.charAt(i);
```

**Moddable (C strings):**
```cpp
const char *uri = "https://www.google.com";
uint16_t len = strlen(uri);
char c = uri[i];
```

**Moddable (XS strings in C binding):**
```c
char buffer[512];
xsToString(xsArg(0), buffer, sizeof(buffer));
xsResult = xsString(buffer);
```

### 4. Timing/Delays

**Arduino:**
```cpp
delay(100);  // milliseconds
delayMicroseconds(10);
```

**Moddable:**
```cpp
modDelayMilliseconds(100);
modDelayMicroseconds(10);
```

### 5. GPIO/Pin Control

**Arduino:**
```cpp
pinMode(LED_BUILTIN, OUTPUT);
digitalWrite(LED_BUILTIN, HIGH);
```

**Moddable:**
```cpp
#include "modGPIO.h"
modGPIOConfigure(LED_BUILTIN, modGPIOOutput);
modGPIOWrite(LED_BUILTIN, 1);
```

## Three-Layer Bridge Pattern

### Layer 1: C++ Bridge Layer

**Purpose:** Port Arduino library logic, use Moddable native APIs

**File:** `moddable/modules/drivers/<category>/<sensor>/<sensor>.cpp`

**Example (ST25DV):**
```cpp
extern "C" {
    #include "modI2C.h"
    #include "xsHost.h"
    #include "xsPlatform.h"
}

typedef struct st25dv_instance {
    uint8_t address_data;
    uint8_t address_syst;
    int sda, scl;
    uint32_t hz;
    void *i2c;
} st25dv_instance_t, *st25dv_handle_t;

extern "C" {
    st25dv_handle_t st25dv_create(uint8_t addr_data, uint8_t addr_syst, int sda, int scl, uint32_t hz);
    void st25dv_destroy(st25dv_handle_t handle);
    bool st25dv_begin(st25dv_handle_t handle);
    bool st25dv_write_ndef_uri(st25dv_handle_t handle, const char *uri);
    char* st25dv_read_ndef_uri(st25dv_handle_t handle);
}
```

**Key Points:**
- Wrap Moddable C headers in `extern "C"`
- Provide C-compatible API with `extern "C"` block
- Use modI2C/modSPI instead of Wire/SPI
- Use C strings instead of Arduino String
- Use modDelayMilliseconds instead of delay()

### Layer 2: C Binding Layer

**Purpose:** XS JavaScript integration, instance management

**File:** `moddable/modules/drivers/<category>/<sensor>/<sensor>_c.c`

**Example (ST25DV):**
```c
#include "xsPlatform.h"
#include "xsHost.h"
#include "xsHeap.h"
#include "st25dv_stm32duino.h"

typedef struct st25dv_xs_instance {
    st25dv_handle_t handle;
} st25dv_xs_instance_t, *st25dv_xs_instance_ptr;

void xs_st25dv_constructor(xsMachine *the) {
    xsVars(1);
    xsVar(0) = xsArg(0);
    
    // Read config from JS
    uint8_t address_data = 0x53;
    if (xsmcHas(xsVar(0), xsID_address_data))
        address_data = xsmcToInteger(xsGet(xsVar(0), xsID_address_data));
    
    // Create native handle
    st25dv_handle_t handle = st25dv_create(address_data, ...);
    
    // Store in XS object
    st25dv_xs_instance_ptr instance = (st25dv_xs_instance_ptr)xsmcSetHostData(xsThis, NULL, sizeof(st25dv_xs_instance_t));
    instance->handle = handle;
}

void xs_st25dv_destructor(void *data) {
    st25dv_xs_instance_ptr instance = (st25dv_xs_instance_ptr)data;
    if (instance && instance->handle)
        st25dv_destroy(instance->handle);
}

void xs_st25dv_writeNDEFURI(xsMachine *the) {
    st25dv_xs_instance_ptr instance = (st25dv_xs_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle) return;
    
    char uri[512];
    xsToString(xsArg(0), uri, sizeof(uri));
    
    bool result = st25dv_write_ndef_uri(instance->handle, uri);
    xsResult = xsBoolean(result);
}
```

**Key Points:**
- Include XS headers for API access
- Define instance structure for XS object
- Constructor: read JS config, create native handle, store with `xsmcSetHostData`
- Destructor: free native handle
- Methods: retrieve handle with `xsmcGetHostData`, call C++ function, return result
- Use XS API for type conversion: `xsmcToInteger`, `xsmcToString`, `xsInteger`, `xsString`, `xsBoolean`

### Layer 3: JavaScript Wrapper

**Purpose:** Clean JS API, error handling, high-level methods

**File:** `moddable/modules/drivers/<category>/<sensor>/<sensor>.js`

**Example (ST25DV):**
```javascript
class ST25DVSTM32duinoHost {
    @ "xs_st25dv_constructor"
    constructor(dictionary) {}
    
    @ "xs_st25dv_destructor"
    close() {}
    
    @ "xs_st25dv_begin"
    begin() {}
    
    @ "xs_st25dv_writeNDEFURI"
    writeNDEFURI(uri) {}
    
    @ "xs_st25dv_readNDEFURI"
    readNDEFURI() {}
}

class ST25DVSTM32duino extends ST25DVSTM32duinoHost {
    constructor(options) {
        super({
            address_data: 0x53,
            address_syst: 0x57,
            data: -1,
            clock: -1,
            hz: 400000,
            ...options
        });
    }
    
    writeURI(uri) {
        return this.writeNDEFURI(uri);
    }
    
    readURI() {
        return this.readNDEFURI();
    }
}

export { ST25DVSTM32duino as default, ST25DVSTM32duino };
```

**Key Points:**
- Host class with native method bindings using `@ "xs_function_name"` syntax
- User-facing class extends host with defaults and convenience methods
- Apply default configuration in constructor
- Provide high-level methods that combine native calls

## Driver Manifest

**File:** `moddable/modules/drivers/<category>/<sensor>/manifest.json`

```json
{
  "include": [
    "$(MODDABLE)/modules/pins/i2c/manifest.json"
  ],
  "modules": {
    "embedded:<category>/<sensor>/STM32duino": "./st25dv_stm32duino",
    "st25dv/binding": "./st25dv_stm32duino_c"
  }
}
```

**Key Points:**
- Include native API manifests (e.g., `pins/i2c/manifest.json`)
- Use `modules` map to declare native sources
- Build system compiles these into prebuilt archive (`xs_<subclass>.a`)
- DO NOT use `sources` array - it doesn't trigger native compilation

## Project Integration

**Host manifest (`host/manifest.json`):**
```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/nfc/st25dv/manifest.json"
  ]
}
```

**Host wrapper (`host/st25dv.js`):**
```javascript
import ST25DVSTM32duino from "embedded:nfc/ST25DV/STM32duino";

class ST25DV16K {
    #sensor;
    #ready;
    
    constructor(options) {
        this.#sensor = new ST25DVSTM32duino({
            sensor: options.sensor
        });
        this.#ready = true;
    }
    
    writeNDEFURI(uri) {
        return this.#sensor.writeURI(uri);
    }
    
    readNDEFURI() {
        return this.#sensor.readURI();
    }
}

export { ST25DV16K as default, ST25DV16K };
```

## Common Pitfalls

### Pitfall 1: C++ Name-Mangling of C Functions

**Symptom:** Linker errors for undefined references to modI2C functions

**Cause:** Including `modI2C.h` in C++ without `extern "C"` guard

**Solution:**
```cpp
extern "C" {
    #include "modI2C.h"
}
```

### Pitfall 2: Synchronous JS Calls from Native

**Symptom:** Host hangs or crashes when native code calls JS

**Cause:** XS engine is not thread-safe for synchronous reentrant calls

**Solution:** Use Moddable native APIs (modI2C, modSPI) instead of calling back to JavaScript

### Pitfall 3: Arduino String Class

**Symptom:** Compilation errors for String class

**Cause:** Moddable doesn't have Arduino String class

**Solution:** Use C strings (`const char*`) or XS strings (`xsToString`, `xsString`)

### Pitfall 4: Stream Dependency

**Symptom:** Missing Stream.h or related functions

**Cause:** Arduino libraries often use Stream for debug output

**Solution:** Remove Stream dependency or replace with `trace()` for debug output

### Pitfall 5: Build System Doesn't Compile Native Sources

**Symptom:** Native code changes don't affect build

**Cause:** Adding sources to manifest `sources` array doesn't work

**Solution:** Use the `modules` map in driver manifest to declare native sources

## Case Study: ST25DV NFC Library

### Original Arduino Library Structure

```
ST25DV/
  src/
    ST25DVSensor.cpp
    ST25DVSensor.h
    ST25DV_IO/
      st25dv_io.cpp
      st25dv_io.h
    libNDEF/
      NDEF_class.h
      lib_NDEF.cpp
      lib_NDEF.h
      ... (30+ files)
```

### Challenges

1. **30+ files with complex dependencies** - Full port would be massive
2. **Arduino String class** - Used throughout for URI/text handling
3. **Wire.h I2C** - Arduino I2C API
4. **Stream.h** - Debug output dependency
5. **Complex NDEF library** - Multiple record types (URI, Text, SMS, WiFi, etc.)

### Pragmatic Approach

Instead of porting all 30+ files, I created a focused C++ bridge that:

1. **Implements only needed functionality** - NDEF URI read/write for this project
2. **Uses modI2C directly** - No Wire.h dependency
3. **Uses C strings** - No Arduino String class
4. **Removes Stream dependency** - Uses `trace()` for debug
5. **Preserves STM32duino API style** - `writeURI()`, `readURI()` methods

### Files Created

```
moddable/modules/drivers/nfc/st25dv/
  st25dv_stm32duino.cpp      # C++ bridge (modI2C, NDEF logic)
  st25dv_stm32duino.h        # C++ header
  st25dv_stm32duino_c.c      # C binding (XS integration)
  st25dv_stm32duino.js       # JS wrapper
  manifest.json              # Driver manifest
  stm32duino/                # Cloned STM32duino library (reference)
```

### Key Implementation Details

**modI2C Integration:**
```cpp
modI2CConfigurationRecord config;
config.sda = sda;
config.scl = scl;
config.hz = hz;
handle->i2c = modI2CInit(&config);
```

**NDEF URI Writing:**
- Parse URI prefix (http://, https://, etc.)
- Build NDEF record with TLV format
- Write to EEPROM with page alignment (4-byte pages)
- Add delays between page writes

**NDEF URI Reading:**
- Read TLV header to get NDEF length
- Read NDEF record
- Parse URI prefix and body
- Return as C string (caller must free with `xFree`)

## Best Practices

1. **Start small** - Port only the functionality you need, not the entire library
2. **Use Moddable native APIs** - modI2C, modSPI, modGPIO instead of Arduino APIs
3. **Wrap C headers in extern "C"** - Prevents C++ name-mangling
4. **Use C strings** - Simpler than porting Arduino String class
5. **Follow three-layer pattern** - JS wrapper → C binding → C++ bridge
6. **Use project-local manifests** - Don't edit global SDK templates
7. **Test incrementally** - Verify each layer before moving to the next
8. **Remove unused dependencies** - Stream, complex NDEF types, etc.

## References

- **NATIVE_BRIDGE_ARCHITECTURE_GUIDE_WITH_MODDABLE_SDK.md** - Detailed bridge architecture
- **Moddable SDK Documentation:** https://github.com/Moddable-OpenSource/moddable
- **XS API Reference:** `moddable/xs/includes/xs.h`
- **Native API Headers:** `moddable/modules/pins/` (i2c, spi, gpio, etc.)
- **Working Example:** `moddable/modules/drivers/nfc/st25dv/` (ST25DV bridge)
