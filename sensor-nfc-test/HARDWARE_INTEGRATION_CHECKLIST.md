# Hardware Integration Checklist

Quick reference for adding new hardware to Moddable projects.

**Note on BMP390 Integration:** This checklist was created during the BMP390 driver integration. The build system steps (manifest, CMakeLists.txt, macro compatibility) are COMPLETE and working. However, the runtime integration (I2C communication) is still IN PROGRESS and not yet functional. See BMP390_FIX_SUMMARY.md and NATIVE_DRIVER_INTEGRATION.md for current status and challenges.

## Pre-Integration

- [ ] Identify if a native driver exists in `moddable/modules/drivers/`
- [ ] If using a native driver, verify it's compatible with your SDK version
- [ ] Check the driver's manifest for dependencies and configuration
- [ ] Review the driver's JavaScript API documentation

## Host Manifest Configuration

- [ ] Add the driver's manifest to the `include` array:
  ```json
  "include": [
    "$(MODDABLE)/modules/drivers/sensors/bmp390/manifest.json"
  ]
  ```
- [ ] Verify `XS_MODS: 1` is NOT in the host manifest (prevents native compilation)
- [ ] Add any required `defines` or `preload` modules

## CMakeLists.txt Integration (ESP32 Only)

**File:** `moddable/build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt`

### Source Files
- [ ] Add all native C/C++ sources to `idf_component_register(SRCS ...)`
- [ ] Use `${ENV_MODDABLE}` for SDK paths
- [ ] Use forward slashes `/` in paths (even on Windows)

### Language Configuration
- [ ] Mark `.c` files with `set_source_files_properties(...PROPERTIES LANGUAGE C)`
- [ ] Verify `.cpp` files are not explicitly marked (default is C++)

### Include Directories
- [ ] Add driver's include directory to `INCLUDE_DIRS`
- [ ] Include SDK platform directories: `${ENV_MODDABLE}/xs/platforms/esp`, `${ENV_MODDABLE}/xs/platforms/mc`, `${ENV_MODDABLE}/xs/includes`

### Linking Configuration
- [ ] Ensure `main` is in xsesp32's `REQUIRES` list:
  ```cmake
  add_prebuilt_library(xsesp32 ${CMAKE_BINARY_DIR}/xs_${ESP32_SUBCLASS}.a
      REQUIRES ${ESP_COMPONENTS} main
  )
  ```

## Macro Compatibility

- [ ] Check `moddable/xs/includes/xs.h` for current macro signatures
- [ ] Search driver code for macro usage (e.g., `xsNewArray`, `xsGet`, `xsSet`)
- [ ] Update macro calls to match current SDK signatures
- [ ] Compile and fix any "macro requires N arguments, but M given" errors

## Build & Verification

### Initial Build
- [ ] Clear build cache: `mcconfig -d -m -p esp32/moddable_six -t clean`
- [ ] Run full build: `mcconfig -d -m -p esp32/moddable_six`

### Verify Native Compilation
- [ ] Check build output for native compilation steps:
  ```
  [N] Building C object ... driver_name.c.obj
  [N] Linking C static library ... libmain.a
  ```
- [ ] If missing, check CMakeLists.txt configuration

### Verify Linking
- [ ] Check final link step completes without errors:
  ```
  [N] Linking CXX executable xs_esp32.elf
  ```
- [ ] If linker errors for `xs_*` symbols, check xsesp32 `REQUIRES` list

### Verify Flashing
- [ ] Firmware flashes successfully to device
- [ ] Device boots and runs app

## Runtime Testing

- [ ] Test basic hardware detection (device responds to I2C probe)
- [ ] Test reading sensor values
- [ ] Test writing configuration (if applicable)
- [ ] Test error handling (graceful failure if device missing)

## Documentation

- [ ] Update host `manifest.json` with driver configuration
- [ ] Document I2C address(es) in README
- [ ] Document any hardware-specific setup (pull-ups, jumpers, etc.)
- [ ] Add troubleshooting section for common issues
- [ ] Update COPILOT.md with driver-specific notes

## Common Pitfalls to Avoid

- [ ] ❌ Using backslashes in CMakeLists.txt paths (use forward slashes)
- [ ] ❌ Adding `XS_MODS: 1` to host manifest (prevents native compilation)
- [ ] ❌ Forgetting to add `main` to xsesp32's `REQUIRES` list (linker errors)
- [ ] ❌ Not marking `.c` files with `PROPERTIES LANGUAGE C` (compilation errors)
- [ ] ❌ Using old macro signatures (e.g., `xsNewArray(the, len, ctor)` instead of `xsNewArray(len)`)
- [ ] ❌ Not clearing CMake cache after CMakeLists.txt changes
- [ ] ❌ Assuming manifest `sources` array automatically compiles native code (it doesn't)

## Quick Reference: CMakeLists.txt Template

```cmake
idf_component_register(
    SRCS "main.c"
        "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
        "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp"
    INCLUDE_DIRS "." ${ENV_MODDABLE}/xs/platforms/esp ${ENV_MODDABLE}/xs/platforms/mc ${ENV_MODDABLE}/xs/includes ${ENV_MODDABLE}/modules/drivers/sensors/bmp390
)

set_source_files_properties(
    "${ENV_MODDABLE}/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
    PROPERTIES LANGUAGE C
)

add_prebuilt_library(xsesp32 ${CMAKE_BINARY_DIR}/xs_${ESP32_SUBCLASS}.a
    REQUIRES ${ESP_COMPONENTS} main
)

target_link_libraries(${COMPONENT_LIB} PRIVATE xsesp32)
```

## References

- **NATIVE_DRIVER_INTEGRATION.md** - Detailed explanation of the BMP390 integration
- **COPILOT.md** - AI assistant instructions for hardware integration
- **README.md** - Project overview and troubleshooting
