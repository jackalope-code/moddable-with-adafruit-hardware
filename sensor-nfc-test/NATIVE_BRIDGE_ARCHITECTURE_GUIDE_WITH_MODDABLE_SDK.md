# Native C++/C Bridge Architecture Guide for Moddable SDK

This guide explains how to integrate native C/C++ drivers into Moddable XS applications using a three-layer bridge pattern. This approach is essential for complex sensors with calibration algorithms, high-performance requirements, or vendor libraries that are impractical to port to pure JavaScript.

## Architecture Overview

The native bridge pattern consists of three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     JavaScript Application                      │
│  (app.js, main.js) - High-level logic, UI, business rules      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ XS native method calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  JavaScript Wrapper Module                      │
│  (bmp390_adafruit.js) - Error handling, type conversion, API   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ XS native method bindings (@ "xs_...")
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        C Binding Layer                          │
│  (bmp390_adafruit_c.c) - XS API integration, instance mgmt      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Direct C function calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      C++ Bridge Layer                           │
│  (bmp390_adafruit.cpp) - Vendor library, algorithms, hardware   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Native hardware APIs (modI2C, modSPI, etc.)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Moddable Native APIs                          │
│  (modI2C.c, modSPI.c, etc.) - Hardware abstraction layer       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ESP-IDF / Platform drivers
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Hardware Sensors                           │
│  (BMP390, BME680, ICM-20948, etc.)                              │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. JavaScript Application Layer
- **Location:** `app.js`, `main.js` in your project
- **Responsibilities:**
  - UI rendering and user interaction
  - Business logic and data processing
  - Error handling and user feedback
  - Creating driver instances and calling high-level methods
- **Example:**
  ```javascript
  const bmp390 = new BMP390Adafruit({
    sensor: device.I2C.default
  });
  const reading = bmp390.sample();
  ```

### 2. JavaScript Wrapper Module
- **Location:** `moddable/modules/drivers/sensors/<sensor>/<sensor>.js`
- **Responsibilities:**
  - Expose a clean JavaScript API
  - Handle errors and edge cases
  - Convert between JavaScript and native types
  - Call native methods via XS bindings
- **Key Pattern:**
  ```javascript
  class BMP390Adafruit extends BMP390AdafruitHost {
    constructor(dictionary) {
      super(dictionary);
      // Apply default configuration
    }
    
    sample() {
      if (this.performReading()) {
        const temperature = this.readTemperature();
        const pressure = this.readPressure();
        return { temperature, pressure };
      }
      throw new Error("Reading failed");
    }
  }
  ```

### 3. C Binding Layer
- **Location:** `moddable/modules/drivers/sensors/<sensor>/<sensor>_c.c`
- **Responsibilities:**
  - Implement XS native methods using the XS API
  - Manage native instance lifecycle (allocation, cleanup)
  - Convert between XS types and C types
  - Call C++ bridge functions
- **Key Patterns:**
  - **Constructor:** Allocate native handle, store with `xsmcSetHostData`
  - **Destructor:** Free native handle in `xs_destructor`
  - **Methods:** Retrieve handle with `xsmcGetHostData`, call C++ function, return result
- **Example:**
  ```c
  void xs_bmp390_adafruit_constructor(xsMachine *the) {
    xsVars(1);
    xsVar(0) = xsArg(0);
    
    // Read configuration from JS object
    int address = 0x77;
    if (xsmcHas(xsVar(0), xsID_address))
      address = xsmcToInteger(xsGet(xsVar(0), xsID_address));
    
    // Create native handle
    bmp390_handle_t handle = bmp390_create(address, sda, scl, hz);
    
    // Store in XS object
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcSetHostData(xsThis, NULL, sizeof(bmp390_instance));
    instance->handle = handle;
  }
  
  void xs_bmp390_adafruit_readTemperature(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
      return;
    
    float temp = bmp390_read_temperature(instance->handle);
    xsResult = xsNumber(temp);
  }
  ```

### 4. C++ Bridge Layer
- **Location:** `moddable/modules/drivers/sensors/<sensor>/<sensor>.cpp`
- **Responsibilities:**
  - Implement vendor library algorithms (calibration, compensation)
  - Handle register-level hardware communication
  - Use Moddable native APIs (modI2C, modSPI) for hardware access
  - Provide a C-compatible API for the C binding layer
- **Critical Pattern: Use Moddable Native APIs**
  - **DO:** Use `modI2CWrite`, `modI2CRead`, `modSPIWrite`, `modSPIRead`
  - **DON'T:** Create separate hardware handles that conflict with SDK management
  - **DON'T:** Make synchronous calls from native callbacks into JavaScript
- **Example:**
  ```cpp
  extern "C" {
    #include "modI2C.h"
  }
  
  bmp390_handle_t bmp390_create(uint8_t address, int sda, int scl, uint32_t hz) {
    bmp390_handle_t handle = new bmp390_instance();
    handle->address = address;
    handle->sda = sda;
    handle->scl = scl;
    handle->hz = hz;
    return handle;
  }
  
  float bmp390_read_temperature(bmp390_handle_t handle) {
    // Read raw data via modI2C
    uint8_t data[6];
    modI2CWrite(handle->i2c, handle->address, 0x04, 1);
    modI2CRead(handle->i2c, handle->address, data, 6);
    
    // Apply Bosch calibration
    float temp = compensate_temperature(data, handle->calib);
    return temp;
  }
  ```

## Step-by-Step Setup Guide

### Step 1: Create Directory Structure

```
moddable/modules/drivers/sensors/<sensor-name>/
  ├── <sensor-name>.cpp          # C++ bridge (vendor library)
  ├── <sensor-name>.h            # C++ header
  ├── <sensor-name>_c.c          # C binding (XS integration)
  ├── <sensor-name>.js           # JavaScript wrapper
  └── manifest.json              # Driver manifest
```

### Step 2: Write the C++ Bridge Layer

1. **Include Moddable native headers with `extern "C"` guards:**
   ```cpp
   extern "C" {
     #include "modI2C.h"  // or modSPI.h, modGPIO.h, etc.
     #include "xsHost.h"
   }
   ```

2. **Implement the vendor library algorithms:**
   - Port from Arduino/Adafruit libraries
   - Keep calibration algorithms in C++ for performance
   - Use Moddable native APIs for hardware access

3. **Provide a C-compatible API:**
   ```cpp
   extern "C" {
     sensor_handle_t sensor_create(config);
     void sensor_destroy(sensor_handle_t handle);
     bool sensor_begin(sensor_handle_t handle);
     float sensor_read_temperature(sensor_handle_t handle);
     // ... other methods
   }
   ```

### Step 3: Write the C Binding Layer

1. **Include XS headers:**
   ```c
   #include "xsPlatform.h"
   #include "xsHost.h"
   #include "xsHeap.h"
   ```

2. **Define instance structure:**
   ```c
   typedef struct sensor_instance {
     sensor_handle_t handle;
     // other per-instance data
   } sensor_instance, *sensor_instance_ptr;
   ```

3. **Implement XS native methods:**
   - **Constructor:** `xs_<module>_constructor`
   - **Destructor:** `xs_<module>_destructor`
   - **Methods:** `xs_<module>_<methodName>`

4. **Use XS API for type conversion:**
   - `xsmcToInteger`, `xsmcToNumber`, `xsmcToString`
   - `xsInteger`, `xsNumber`, `xsString`
   - `xsmcSetHostData`, `xsmcGetHostData`

### Step 4: Write the JavaScript Wrapper

1. **Define the host class with native method bindings:**
   ```javascript
   class BMP390AdafruitHost {
     @ "xs_bmp390_adafruit_constructor"
     constructor(dictionary) {}
     
     @ "xs_bmp390_adafruit_begin"
     begin() {}
     
     @ "xs_bmp390_adafruit_readTemperature"
     readTemperature() {}
     
     @ "xs_bmp390_adafruit_readPressure"
     readPressure() {}
   }
   ```

2. **Extend with a user-facing class:**
   ```javascript
   class BMP390Adafruit extends BMP390AdafruitHost {
     constructor(dictionary) {
       super(dictionary);
       // Apply defaults, validate config
     }
     
     sample() {
       // High-level API combining multiple native calls
     }
   }
   ```

### Step 5: Create the Driver Manifest

```json
{
  "include": [
    "$(MODDABLE)/modules/pins/i2c/manifest.json"  // Include native API manifests
  ],
  "modules": {
    "embedded:sensor/Barometer-Temperature/BMP390/Adafruit": "./bmp390_adafruit",
    "bmp390/binding": "./bmp390_adafruit_c"
  }
}
```

**Key Points:**
- Include the native API manifests (e.g., `pins/i2c/manifest.json`)
- Use the `modules` map to declare native sources
- The build system compiles these into the prebuilt archive (`xs_<subclass>.a`)

### Step 6: Include in Project Manifest

```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
}
```

### Step 7: Build and Test

```sh
# Build host
cd host
mcconfig -d -m -p esp32/moddable_six

# Build/install app mod (if using mod architecture)
cd ../app
mcrun -d -m -p esp32/moddable_six
```

## Critical Best Practices

### 1. Use Moddable Native APIs, Not Direct Hardware Access

**DO:**
```cpp
extern "C" {
  #include "modI2C.h"
}
modI2CWrite(i2c, address, data, length);
```

**DON'T:**
```cpp
#include "driver/i2c.h"
i2c_master_write_to_device(...)  // Conflicts with SDK management
```

### 2. Wrap Moddable C Headers in `extern "C"` for C++

**DO:**
```cpp
extern "C" {
  #include "modI2C.h"
  #include "xsHost.h"
}
```

**DON'T:**
```cpp
#include "modI2C.h"  // Causes C++ name-mangling, linker errors
```

### 3. Never Make Synchronous JS Calls from Native Callbacks

**DO:**
```cpp
// Use native modI2C for synchronous I2C operations
modI2CWrite(i2c, address, data, length);
modI2CRead(i2c, address, buffer, length);
```

**DON'T:**
```cpp
// Deadlocks the XS engine
xsmcCall(jsCallback, ...);  // From native callback
```

### 4. Use Project-Local Manifests, Not Global SDK Edits

**DO:**
```json
// In driver manifest
{
  "modules": {
    "sensor/binding": "./sensor_c"
  }
}
```

**DON'T:**
```cmake
# In build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt
# This is a global template - editing it breaks other projects
idf_component_register(SRCS "sensor_c.c" ...)
```

### 5. Manage Native Instance Lifecycle Properly

**DO:**
```c
void xs_sensor_constructor(xsMachine *the) {
  sensor_instance_ptr instance = (sensor_instance_ptr)xsmcSetHostData(xsThis, NULL, sizeof(sensor_instance));
  instance->handle = sensor_create();
}

void xs_sensor_destructor(void *data) {
  sensor_instance_ptr instance = (sensor_instance_ptr)data;
  if (instance && instance->handle)
    sensor_destroy(instance->handle);
}
```

**DON'T:**
```c
// Forgetting to free memory causes leaks
void xs_sensor_constructor(xsMachine *the) {
  sensor_handle_t handle = sensor_create();
  // Never stored or freed
}
```

## Common Pitfalls and Solutions

### Pitfall 1: Linker Errors for Undefined References

**Symptom:** `undefined reference to modI2CWrite` or similar

**Cause:** C++ name-mangling of C functions

**Solution:** Wrap includes in `extern "C"`:
```cpp
extern "C" {
  #include "modI2C.h"
}
```

### Pitfall 2: Build System Doesn't Compile Native Sources

**Symptom:** Native code changes don't affect build

**Cause:** Adding sources to `manifest.json` `sources` array doesn't work

**Solution:** Use the `modules` map in the driver manifest:
```json
{
  "modules": {
    "sensor/binding": "./sensor_c"
  }
}
```

### Pitfall 3: Host Crashes on Startup

**Symptom:** Device reboots immediately, no xsdebug output

**Cause:** Creating separate hardware handles that conflict with SDK

**Solution:** Use Moddable native APIs (modI2C, modSPI) instead of direct ESP-IDF drivers

### Pitfall 4: Mod Install Fails with resultCode -8

**Symptom:** `mcrun` fails with "mods not supported"

**Cause:** Host firmware built with `XS_MODS: 0`

**Solution:** Rebuild host with `XS_MODS: 1` in manifest:
```json
{
  "defines": {
    "XS_MODS": 1
  }
}
```

### Pitfall 5: Sensor Readings Are Stale or Zero

**Symptom:** Temperature/pressure always return 0 or same value

**Cause:** Not calling `performReading()` before reading individual values

**Solution:** Call `performReading()` first to trigger a new measurement:
```javascript
bmp390.performReading();
const temp = bmp390.readTemperature();
const press = bmp390.readPressure();
```

## Concrete Example: BMP390 Driver Integration

The BMP390 driver at `moddable/modules/drivers/sensors/bmp390/` is a complete, working example of the native bridge pattern. It was successfully integrated into the `hardware-demo/sensor-nfc-test/` project and verified on real hardware (Moddable Six / ESP32-S3).

### File Structure

```
moddable/modules/drivers/sensors/bmp390/
  ├── bmp390_adafruit.cpp          # C++ bridge (Bosch algorithms, modI2C)
  ├── bmp390_adafruit.h            # C++ header
  ├── bmp390_adafruit_c.c          # C binding (XS integration)
  ├── bmp390_adafruit.js           # JavaScript wrapper
  └── manifest.json                # Driver manifest
```

### 1. C++ Bridge Layer (bmp390_adafruit.cpp)

**Key implementation details:**

```cpp
extern "C" {
  #include "modI2C.h"  // Critical: prevents C++ name-mangling
  #include "xsHost.h"
}

// Bosch BMP3 calibration data structure (21 coefficients)
typedef struct {
  uint16_t par_t1;
  int16_t par_t2;
  int16_t par_t3;
  // ... 18 more calibration coefficients
} bmp390_calib_data_t;

// Native handle structure
typedef struct bmp390_instance {
  uint8_t address;
  int sda, scl;
  uint32_t hz;
  bmp390_calib_data_t calib;
} bmp390_instance_t, *bmp390_handle_t;

// C-compatible API for C binding layer
extern "C" {
  bmp390_handle_t bmp390_create(uint8_t address, int sda, int scl, uint32_t hz);
  void bmp390_destroy(bmp390_handle_t handle);
  bool bmp390_begin(bmp390_handle_t handle);
  float bmp390_read_temperature(bmp390_handle_t handle);
  float bmp390_read_pressure(bmp390_handle_t handle);
}

// Example: modI2C usage for I2C communication
float bmp390_read_temperature(bmp390_handle_t handle) {
  uint8_t data[3];
  modI2CWrite(handle->i2c, handle->address, 0x04, 1);  // Write register address
  modI2CRead(handle->i2c, handle->address, data, 3);   // Read temperature data
  
  // Apply Bosch compensation algorithm
  uint32_t raw_temp = (data[2] << 16) | (data[1] << 8) | data[0];
  float temp = compensate_temperature(raw_temp, handle->calib);
  return temp;
}
```

**Why modI2C instead of JavaScript I2C callbacks?**
- Initial implementation used synchronous JS callbacks from native C++, which deadlocked the XS engine
- modI2C provides synchronous C I2C operations without JS reentrancy issues
- Coordinates with Moddable's I2C module via the weak `i2cActivate` symbol

### 2. C Binding Layer (bmp390_adafruit_c.c)

**Key implementation details:**

```c
#include "xsPlatform.h"
#include "xsHost.h"
#include "xsHeap.h"
#include "bmp390_adafruit.h"

// Instance structure stored in XS object
typedef struct bmp390_xs_instance {
  bmp390_handle_t handle;
} bmp390_xs_instance_t, *bmp390_xs_instance_ptr;

// Constructor: reads config from JS, creates native handle
void xs_bmp390_adafruit_constructor(xsMachine *the) {
  xsVars(1);
  xsVar(0) = xsArg(0);
  
  // Read configuration from JS object
  int address = 0x77;
  int sda = -1, scl = -1;
  uint32_t hz = 400000;
  
  if (xsmcHas(xsVar(0), xsID_address))
    address = xsmcToInteger(xsGet(xsVar(0), xsID_address));
  if (xsmcHas(xsVar(0), xsID_data))
    sda = xsmcToInteger(xsGet(xsVar(0), xsID_data));
  if (xsmcHas(xsVar(0), xsID_clock))
    scl = xsmcToInteger(xsGet(xsVar(0), xsID_clock));
  if (xsmcHas(xsVar(0), xsID_hz))
    hz = xsmcToInteger(xsGet(xsVar(0), xsID_hz));
  
  // Create native handle
  bmp390_handle_t handle = bmp390_create(address, sda, scl, hz);
  
  // Store in XS object
  bmp390_xs_instance_ptr instance = (bmp390_xs_instance_ptr)xsmcSetHostData(xsThis, NULL, sizeof(bmp390_xs_instance_t));
  instance->handle = handle;
}

// Destructor: frees native handle
void xs_bmp390_adafruit_destructor(void *data) {
  bmp390_xs_instance_ptr instance = (bmp390_xs_instance_ptr)data;
  if (instance && instance->handle)
    bmp390_destroy(instance->handle);
}

// Method: read temperature
void xs_bmp390_adafruit_readTemperature(xsMachine *the) {
  bmp390_xs_instance_ptr instance = (bmp390_xs_instance_ptr)xsmcGetHostData(xsThis);
  if (NULL == instance || NULL == instance->handle)
    return;
  
  float temp = bmp390_read_temperature(instance->handle);
  xsResult = xsNumber(temp);
}
```

### 3. JavaScript Wrapper (bmp390_adafruit.js)

**Key implementation details:**

```javascript
class BMP390AdafruitHost {
  @ "xs_bmp390_adafruit_constructor"
  constructor(dictionary) {}
  
  @ "xs_bmp390_adafruit_destructor"
  close() {}
  
  @ "xs_bmp390_adafruit_begin"
  begin() {}
  
  @ "xs_bmp390_adafruit_performReading"
  performReading() {}
  
  @ "xs_bmp390_adafruit_readTemperature"
  readTemperature() {}
  
  @ "xs_bmp390_adafruit_readPressure"
  readPressure() {}
  
  @ "xs_bmp390_adafruit_readAltitude"
  readAltitude() {}
}

class BMP390Adafruit extends BMP390AdafruitHost {
  constructor(dictionary) {
    super(dictionary);
    // Apply default configuration
    this.setTemperatureOversampling(Config.Oversampling.X2);
    this.setPressureOversampling(Config.Oversampling.X16);
    this.setIIRFilterCoeff(Config.IIRFilter.X4);
    this.setOutputDataRate(Config.ODR.HZ_5);
  }
  
  sample() {
    if (this.performReading()) {
      const temperature = this.readTemperature();
      const pressure = this.readPressure();
      return { 
        barometer: { pressure }, 
        thermometer: { temperature } 
      };
    }
    throw new Error("BMP390 reading failed");
  }
}
```

### 4. Driver Manifest (manifest.json)

```json
{
  "include": [
    "$(MODDABLE)/modules/pins/i2c/manifest.json"
  ],
  "modules": {
    "embedded:sensor/Barometer-Temperature/BMP390/Adafruit": "./bmp390_adafruit",
    "bmp390/binding": "./bmp390_adafruit_c"
  }
}
```

**Key points:**
- Includes `pins/i2c/manifest.json` to pull in modI2C.c and modI2C.h
- Uses `modules` map to declare native sources (not `sources` array)
- Build system compiles these into the prebuilt archive (`xs_esp32s3.a`)

### 5. Project Integration

**Host manifest (`host/manifest.json`):**
```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ],
  "defines": {
    "XS_MODS": 1  // Enables mod loading; does NOT prevent native compilation
  }
}
```

**Host main (`host/main.js`):**
```javascript
import BMP390Adafruit from "embedded:sensor/Barometer-Temperature/BMP390/Adafruit";

let hardwareBmp390 = null;
try {
  hardwareBmp390 = new BMP390Adafruit({
    sensor: device.I2C.default
  });
  if (hardwareBmp390.begin()) {
    trace("BMP390 connected\n");
  } else {
    hardwareBmp390 = null;
  }
} catch (e) {
  trace(`BMP390 error: ${e}\n`);
}
```

**App mod (`app/app.js`):**
```javascript
updateBMP390() {
  if (!this.bmp390 || !this.bmp390Ok) return;
  try {
    const s = this.bmp390.sample();
    this.tempC = s.thermometer.temperature;
    this.pressure = s.barometer.pressure;
    // Update UI labels...
  } catch (e) {
    trace(`BMP390 read error: ${e}\n`);
  }
}
```

### Verification Results

**Runtime trace output:**
```
BMP390[JS]: constructing (data=4, clock=5, hz=400000)
BMP390[C]: constructor - creating native handle
BMP390: create address 0x77 sda 4 scl 5 hz 400000
BMP390[C]: constructor done
BMP390[JS]: calling begin()...
BMP390[C]: begin()
BMP390: begin - soft reset
BMP390: chip id 0x60
BMP390: calibration read
BMP390: begin OK (initialized)
BMP390 connected
BMP390 sampling...
BMP390: reading raw_t 8631232 raw_p 9063688 -> temp(mC) 24548 press(Pa) 80697
```

**Display readings:** ~24.6°C, ~807 hPa (reasonable values)

### Lessons Learned from BMP390 Integration

1. **Use modI2C instead of JS callbacks** - Synchronous JS calls from native callbacks deadlock the XS engine
2. **Wrap modI2C.h in extern "C"** - Prevents C++ name-mangling and linker errors
3. **Use manifest modules map** - Declares native sources for project-local compilation; don't edit global SDK templates
4. **XS_MODS enables mods, not disables native code** - Native compilation works regardless of XS_MODS setting
5. **Build order matters** - Flash host first (owns mod partition), then install app mod

## Build System Details

### How Native Compilation Works

1. **Driver manifest's `modules` map** declares native sources
2. **Moddable build system** compiles these into the prebuilt archive (`xs_<subclass>.a`)
3. **Archive is linked** into the host firmware during `mcconfig`
4. **No global SDK edits** needed - this is project-local

### XS_MODS and Native Compilation

**Common Misconception:** `XS_MODS: 1` prevents native compilation

**Reality:** `XS_MODS: 1` enables mod loading. Native driver compilation is unaffected - it compiles into the host archive via the driver manifest regardless of `XS_MODS` setting.

## Additional Resources

- **Moddable SDK Documentation:** https://github.com/Moddable-OpenSource/moddable
- **XS API Reference:** `moddable/xs/includes/xs.h`
- **Native API Headers:** `moddable/modules/pins/` (i2c, spi, gpio, etc.)
- **Working Example:** `hardware-demo/sensor-nfc-test/` (BMP390, RTC, NFC)
