# Native Driver Integration Guide

This document captures the lessons learned from integrating the Adafruit BMP390 native C/C++ bridge driver into the Moddable ESP32 build system.

**Status:** Build system integration COMPLETE. Runtime integration IN PROGRESS (not yet functional).

## Problem Statement

When adding the BMP390 Adafruit bridge driver (which includes native C and C++ sources), the build failed with linker errors for undefined symbols like `xs_bmp390_adafruit_constructor`, `xs_bmp390_adafruit_readTemperature`, etc.

**Root Cause:** The Moddable build system does not automatically compile native C/C++ sources listed in manifest `sources` arrays. The build system processes JavaScript modules and generates XS bytecode, but the native sources are never compiled or linked.

## Current Status

### Build System (RESOLVED ✅)
- Native sources now compile successfully
- Linker errors resolved
- Firmware builds and flashes without errors

### Runtime (IN PROGRESS ⏳)
- Driver causes host crash when enabled
- I2C callback mechanism causes deadlock/crash
- Driver currently disabled in `host/main.js` (lines 55-68)
- Needs debugging with serial monitor to determine exact failure point

## Solution

### 1. Host Manifest Configuration

Ensure the host manifest includes the native driver's manifest:

```json
{
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
}
```

**Critical:** Do NOT add `XS_MODS: 1` to the host manifest, as this prevents native C/C++ compilation.

### 2. CMakeLists.txt Integration (ESP32)

The main component's CMakeLists.txt must explicitly list the native sources:

**File:** `moddable/build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt`

```cmake
idf_component_register(
    SRCS "main.c"
        "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
        "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp"
    INCLUDE_DIRS "." ${ENV_MODDABLE}/xs/platforms/esp ${ENV_MODDABLE}/xs/platforms/mc ${ENV_MODDABLE}/xs/includes ${ENV_MODDABLE}/modules/base/instrumentation ${ENV_MODDABLE}/modules/io ${ENV_MODDABLE}/modules/base/timer ${C_TMP_DIR} ${ENV_MODDABLE}/modules/drivers/sensors/bmp390
)

# Mark C files as C language (not C++)
set_source_files_properties(
    "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
    PROPERTIES LANGUAGE C
)

# Ensure main component is linked into final executable
add_prebuilt_library(xsesp32 ${CMAKE_BINARY_DIR}/xs_${ESP32_SUBCLASS}.a
    REQUIRES ${ESP_COMPONENTS} main
)

target_link_libraries(${COMPONENT_LIB} PRIVATE xsesp32)
```

### 3. Key CMake Configuration Points

#### Path Formatting
- Use `${ENV_MODDABLE}` environment variable for SDK paths
- Use **forward slashes** `/` in paths, even on Windows
- Do NOT use backslashes or Windows path separators

#### Language Specification
- Mark `.c` files with `set_source_files_properties(...PROPERTIES LANGUAGE C)`
- This ensures C files are compiled with the C compiler, not C++
- Without this, C files may be treated as C++ and fail to compile

#### Linking
- Add `main` to the `REQUIRES` list of the xsesp32 library
- This ensures the main component library (containing compiled native code) is linked into the final executable
- Without this, the linker can't find the native function symbols

### 4. Macro Compatibility

When integrating native drivers, verify macro compatibility with the current Moddable SDK version.

**Example: `xsNewArray` macro**

The signature changed between SDK versions:
- **Old:** `xsNewArray(the, length, constructor)` - 3 arguments
- **New:** `xsNewArray(length)` - 1 argument

If you see compilation errors like:
```
error: macro "xsNewArray" requires 1 argument, but 3 given
```

Update the driver code to use the new signature. Check `moddable/xs/includes/xs.h` for the current macro definition.

## Verification

### Build Output

During a successful build, you should see native compilation steps:

```
[4/10] Building C object esp-idf/main/CMakeFiles/__idf_main.dir/C_/Users/.../bmp390_adafruit_c.c.obj
[5/10] Linking C static library esp-idf\main\libmain.a
```

If you don't see these lines, the native sources are not being compiled. Check:
1. CMakeLists.txt includes the source files in `SRCS`
2. Paths are correct and use forward slashes
3. CMake cache is cleared (run `mcconfig` again)

### Linker Success

The final link should complete without undefined reference errors:

```
[7/10] Linking CXX executable xs_esp32.elf
[8/10] Generating binary image from built executable
```

If you see linker errors for `xs_bmp390_adafruit_*` symbols, the native sources were compiled but not linked. Check:
1. `main` is in the xsesp32 library's `REQUIRES` list
2. The main component library is being created (`libmain.a`)

## Adding New Native Drivers

When adding a new native driver to a Moddable project:

1. **Check for SDK implementation** - Look in `moddable/modules/drivers/` for existing native drivers
2. **Include the manifest** - Add the driver's manifest to your host manifest's `include` array
3. **Update CMakeLists.txt** - Add the driver's C/C++ sources to `idf_component_register(SRCS ...)`
4. **Set language properties** - Mark `.c` files with `PROPERTIES LANGUAGE C`
5. **Update linking** - Ensure `main` is in xsesp32's `REQUIRES` list
6. **Verify compilation** - Check build output for native compilation steps
7. **Check macros** - Verify macro compatibility with the current SDK version

## Common Issues

### "Failed to resolve component '__idf_main'"

This error occurs when trying to reference the main component before it's fully defined. Solution: Use `main` as a string in the `REQUIRES` list, not `${COMPONENT_TARGET}`.

### "undefined reference to `xs_*` functions"

The native sources compiled but weren't linked. Ensure:
- `main` is in xsesp32's `REQUIRES` list
- CMake cache is cleared (delete build directory)
- Rebuild with `mcconfig`

### "macro requires N arguments, but M given"

Macro signature mismatch. Check the macro definition in `moddable/xs/includes/xs.h` and update the driver code accordingly.

### Native sources not compiling

Check:
- Paths use forward slashes `/`
- Paths are absolute or use `${ENV_MODDABLE}`
- CMake cache is cleared
- `idf_component_register()` includes the sources in `SRCS`

## Runtime Integration Challenges

### I2C Synchronous Callback Deadlock

**Problem:** When the BMP390 driver is enabled, the host crashes silently during startup.

**Root Cause:** The BMP390 C++ library uses I2C callbacks to communicate with the sensor. These callbacks call JavaScript I2C methods synchronously, which is not thread-safe in the XS engine.

**Attempted Solutions:**
1. Wrapping callbacks with `xsTry`/`xsCatch` - did not prevent deadlock
2. Retaining JavaScript I2C object references with `xsRemember` - did not prevent deadlock
3. Creating a native ESP32 I2C driver to avoid JS callbacks - caused host crash due to I2C bus initialization conflict

**Current Approach:** Reverted to JavaScript I2C callbacks but driver is disabled pending resolution.

**Lesson Learned:** Do NOT make synchronous JavaScript calls from native callbacks. The XS engine is not thread-safe for this pattern.

### Native I2C Driver Conflict

**Problem:** Attempted to create a native ESP32 I2C driver to avoid JavaScript callbacks. This caused the host to crash during startup with no output.

**Root Cause:** Moddable SDK already manages the I2C bus. Creating a separate native I2C bus handle causes a conflict.

**Lesson Learned:** Always use the JavaScript I2C object that's already initialized by the Moddable SDK. Do not create separate hardware handles in native code.

### Recommended Next Steps

1. **Debug with serial monitor** - Enable driver and capture serial output to see where crash occurs
2. **Consider async pattern** - Redesign I2C communication to avoid synchronous callbacks
3. **Alternative approaches:**
   - Use a task queue to defer I2C operations
   - Implement non-blocking I2C reads/writes
   - Use Moddable's timer mechanism for I2C polling
4. **Consult Moddable documentation** - Check if there are examples of native drivers that safely call JavaScript

## References

- **Moddable SDK:** https://github.com/Moddable-OpenSource/moddable
- **BMP390 Driver:** `moddable/modules/drivers/sensors/bmp390/`
- **ESP-IDF CMake:** https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/build-system.html
- **See also:** BMP390_FIX_SUMMARY.md, HARDWARE_INTEGRATION_CHECKLIST.md
