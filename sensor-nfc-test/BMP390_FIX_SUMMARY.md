# BMP390 Native Driver Integration - Fix Summary

## Current Status: IN PROGRESS (NOT YET FUNCTIONAL)

**Last Updated:** June 18, 2026

The BMP390 Adafruit native C/C++ bridge driver integration is incomplete. The build system issues have been resolved, but runtime issues prevent the driver from functioning. The driver is currently disabled pending resolution of I2C communication deadlock issues.

## Previous Issues Resolved

### Build System Issues (RESOLVED)

Build previously failed with linker errors when integrating the Adafruit BMP390 native C/C++ bridge driver:

```
undefined reference to `xs_bmp390_adafruit_destructor'
undefined reference to `xs_bmp390_adafruit_constructor'
undefined reference to `xs_bmp390_adafruit_begin'
... (and 13 more undefined references)
```

**Root Causes:**

1. **Manifest Processing Limitation** - The Moddable build system's manifest processing does not automatically compile native C/C++ sources listed in manifest `sources` arrays. The build system:
   - Processes JavaScript modules and generates XS bytecode
   - Generates a CMakeLists.txt for ESP-IDF
   - But does NOT add native sources from manifests to the CMakeLists.txt

2. **Missing CMakeLists.txt Configuration** - The main component's CMakeLists.txt did not explicitly list the BMP390 native sources, so they were never compiled.

3. **Linking Issue** - Even when native sources were compiled, the main component library wasn't being linked into the final executable because xsesp32 didn't depend on it.

## Current Runtime Issues (NOT RESOLVED)

### I2C Communication Deadlock

**Problem:** Host crashes silently during startup when BMP390 driver is enabled.

**Root Cause:** Synchronous calls from native C++ callbacks into JavaScript I2C methods cause the XS engine to deadlock or crash. The BMP390 C++ library calls I2C write/read callbacks, which then call JavaScript I2C methods, which is not thread-safe.

**Attempted Solutions:**
- Wrapping callbacks with `xsTry`/`xsCatch` - did not prevent deadlock
- Retaining JavaScript I2C object references with `xsRemember` - did not prevent deadlock
- Creating native ESP32 I2C driver to avoid JS callbacks - caused host crash due to I2C bus initialization conflict

**Current Status:** Driver is disabled in `host/main.js` (lines 55-68) pending resolution of the I2C callback issue.

### Native I2C Driver Conflict

**Problem:** Attempted to create a native ESP32 I2C driver (`esp32_i2c_native.c`) to avoid JavaScript callbacks. This caused the host to crash during startup with no output.

**Root Cause:** Likely due to I2C bus initialization conflict. The Moddable I2C module may already be managing the I2C bus, and creating a separate native I2C bus handle caused a conflict.

**Lesson Learned:** Do not create separate I2C bus handles in native code. Always use the JavaScript I2C object that's already initialized by the Moddable SDK.

## Build System Fixes (COMPLETED)

These fixes resolved the linker errors and allow the code to build successfully.

### Fix 1: Macro Compatibility (bmp390_adafruit_c.c)

**File:** `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c`

**Issue:** `xsNewArray` macro signature changed in the SDK.

**Old Code (Lines 28-29, 48-49):**
```c
xsVar(0) = xsNewArray(the, length, xsGlobal(the, xsID_Uint8Array));
```

**New Code:**
```c
xsVar(0) = xsNewArray(length);
```

**Reason:** The current Moddable SDK's `xsNewArray` macro takes only one argument (length), not three.

### Fix 2: CMakeLists.txt Configuration

**File:** `moddable/build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt`

**Changes:**

1. **Added native sources to idf_component_register():**
   ```cmake
   idf_component_register(
       SRCS "main.c"
           "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
           "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp"
       INCLUDE_DIRS "." ${ENV_MODDABLE}/xs/platforms/esp ...
   )
   ```

2. **Set C language property for C source file:**
   ```cmake
   set_source_files_properties(
       "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
       PROPERTIES LANGUAGE C
   )
   ```
   **Reason:** Without this, the C file might be compiled as C++, causing compilation errors.

3. **Added main component to xsesp32 dependencies:**
   ```cmake
   add_prebuilt_library(xsesp32 ${CMAKE_BINARY_DIR}/xs_${ESP32_SUBCLASS}.a
       REQUIRES ${ESP_COMPONENTS} main
   )
   ```
   **Reason:** This ensures the main component library (containing compiled BMP390 code) is linked into the final executable.

## Runtime Fixes (IN PROGRESS)

### Approach: JavaScript I2C Callbacks

**Current Implementation:** Reverted to using JavaScript I2C callbacks instead of native I2C driver.

**Files Modified:**
- `bmp390_adafruit.cpp` - Uses `g_i2c_write` and `g_i2c_read` callbacks
- `bmp390_adafruit_c.c` - Implements I2C callbacks that call JavaScript I2C methods

**Status:** Code compiles and flashes successfully, but driver is disabled pending testing. The I2C callback mechanism may still cause deadlock issues.

### Next Steps to Resolve

1. **Enable driver and test with serial monitor** - Uncomment lines 55-68 in `host/main.js`
2. **Capture crash details** - Use serial monitor to see if driver initializes or crashes
3. **Consider async pattern** - May need to redesign I2C communication to avoid synchronous callbacks
4. **Alternative approaches:**
   - Use a task queue to defer I2C operations
   - Implement non-blocking I2C reads/writes
   - Use Moddable's timer mechanism for I2C polling

## Build Verification

### Before Fix
```
[4/10] Building C object ... bmp390_adafruit_c.c.obj
[5/10] Linking C static library ... libmain.a
[7/10] Linking CXX executable xs_esp32.elf
FAILED: xs_esp32.elf
... undefined reference to `xs_bmp390_adafruit_*' ...
```

The C file was compiled, but the symbols weren't linked into the final executable.

### After Fix
```
[4/10] Building C object ... bmp390_adafruit_c.c.obj
[5/10] Linking C static library ... libmain.a
[6/10] Generating binary image from built executable
[7/10] Generating binary image from built executable
[8/10] C:\Windows\system32\cmd.exe /C "cd /D ... esptool ...
... Successfully created ESP32-S3 image ...
[9/10] Flashing ...
... Wrote 1601360 bytes ...
Done
```

Build succeeded and firmware flashed successfully.

## Key Learnings

1. **Manifest sources don't auto-compile** - Native C/C++ sources in manifest `sources` arrays are not automatically compiled. They must be explicitly added to CMakeLists.txt.

2. **Path formatting matters** - Use forward slashes `/` in CMakeLists.txt paths, even on Windows. Use `${ENV_MODDABLE}` for SDK paths.

3. **Language specification is critical** - Mark C files with `PROPERTIES LANGUAGE C` to ensure they're compiled with the C compiler, not C++.

4. **Linking requires explicit dependencies** - Add the main component to xsesp32's `REQUIRES` list to ensure it's linked into the final executable.

5. **Macro compatibility changes** - Check `moddable/xs/includes/xs.h` for current macro signatures when integrating drivers from different SDK versions.

## Files Modified

1. `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c` - Fixed `xsNewArray` macro calls
2. `moddable/build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt` - Added native sources and linking configuration

## Testing Status

### Build & Flash
- ✅ Host builds successfully (no linker errors)
- ✅ Firmware flashes to ESP32-S3
- ✅ Device boots and runs app (with BMP390 driver disabled)

### Runtime Testing
- ❌ BMP390 driver causes host crash when enabled
- ❌ I2C callback mechanism needs debugging
- ⏳ Pending: Enable driver and test with serial monitor to capture crash details

## Future Reference

When adding new native drivers:
1. Check for existing SDK implementation
2. Include driver's manifest in host manifest
3. Add native sources to CMakeLists.txt
4. Set language properties for C files
5. Add main to xsesp32's REQUIRES list
6. Verify macro compatibility
7. Clear CMake cache and rebuild

See **NATIVE_DRIVER_INTEGRATION.md** and **HARDWARE_INTEGRATION_CHECKLIST.md** for detailed guidance.
