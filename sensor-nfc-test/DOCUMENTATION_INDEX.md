# Documentation Index

This directory contains comprehensive documentation for the Sensor & NFC Hardware Test project and lessons learned for integrating native hardware drivers into Moddable projects.

## Quick Start

**New to this project?** Start here:
1. Read **README.md** - Project overview, wiring, and features
2. Read **COPILOT.md** - AI assistant instructions for working on this project

**Adding new hardware?** Follow this path:
1. Read **HARDWARE_INTEGRATION_CHECKLIST.md** - Quick reference checklist
2. Read **NATIVE_DRIVER_INTEGRATION.md** - Detailed integration guide
3. Reference **BMP390_FIX_SUMMARY.md** - Real-world example of the integration process

## Documentation Files

### Project Documentation

- **README.md** - Project overview, hardware setup, wiring diagram, build instructions, features, and troubleshooting
  - What: Complete project documentation
  - Who: Anyone working on or using this project
  - When: First time setup and ongoing reference

- **COPILOT.md** - AI assistant instructions for this project
  - What: Guidelines for working with AI copilots on this project
  - Who: Developers using AI assistance
  - When: When asking AI for help with this project

### Hardware Integration Guides

- **HARDWARE_INTEGRATION_CHECKLIST.md** - Quick reference checklist for adding new hardware
  - What: Step-by-step checklist with common pitfalls
  - Who: Developers adding new hardware drivers
  - When: Before starting hardware integration work

- **NATIVE_DRIVER_INTEGRATION.md** - Detailed guide to integrating native C/C++ drivers
  - What: Comprehensive explanation of the native driver integration process
  - Who: Developers working with native drivers
  - When: When integrating complex sensors or vendor libraries

- **BMP390_FIX_SUMMARY.md** - Real-world example of BMP390 native driver integration
  - What: Specific fixes applied to integrate the BMP390 driver
  - Who: Developers learning from a concrete example
  - When: When troubleshooting similar integration issues

## Key Concepts

### Native vs. Pure JavaScript Drivers

**Use Native C/C++ for:**
- Complex sensors with calibration algorithms (BMP390, BME680, ICM-20948)
- Drivers ported from vendor libraries (Adafruit, Bosch, etc.)
- High-performance or precision-critical applications

**Use Pure JavaScript for:**
- Simple I2C/SPI devices with straightforward register reads/writes
- Prototyping and testing
- Devices where vendor libraries are unavailable

### Build System Limitations

The Moddable build system does NOT automatically compile native C/C++ sources from manifest `sources` arrays. You must:
1. Include the driver's manifest in your host manifest
2. Explicitly add native sources to CMakeLists.txt
3. Configure language properties for C files
4. Ensure proper linking by adding main to xsesp32's REQUIRES list

### Critical Configuration Points

1. **Host Manifest** - Must include driver manifest, must NOT have `XS_MODS: 1`
2. **CMakeLists.txt** - Must list native sources, set language properties, configure linking
3. **Macro Compatibility** - Check SDK version for macro signature changes
4. **Path Formatting** - Use forward slashes and `${ENV_MODDABLE}` variable

## File Organization

```
sensor-nfc-test/
├── README.md                           # Project overview & setup
├── COPILOT.md                          # AI assistant instructions
├── DOCUMENTATION_INDEX.md              # This file
├── HARDWARE_INTEGRATION_CHECKLIST.md   # Quick reference checklist
├── NATIVE_DRIVER_INTEGRATION.md        # Detailed integration guide
├── BMP390_FIX_SUMMARY.md               # Real-world example
├── BRIDGE_REVIEW.md                    # (existing) Bridge implementation notes
├── host/
│   ├── main.js                         # Host entry point
│   └── manifest.json                   # Host manifest
├── app/
│   ├── app.js                          # App UI
│   └── manifest.json                   # App manifest
└── Adafruit_BMP3XX.*                   # (reference) Adafruit library headers
```

## Common Tasks

### Building the Project
See **README.md** → "Build & Run" section

### Troubleshooting Hardware Issues
See **README.md** → "Troubleshooting" section

### Adding New Hardware
1. Check **HARDWARE_INTEGRATION_CHECKLIST.md** for quick reference
2. Follow detailed steps in **NATIVE_DRIVER_INTEGRATION.md**
3. Reference **BMP390_FIX_SUMMARY.md** for concrete examples

### Understanding the BMP390 Fix
1. Read **BMP390_FIX_SUMMARY.md** for overview
2. Read **NATIVE_DRIVER_INTEGRATION.md** for detailed explanation
3. Check **HARDWARE_INTEGRATION_CHECKLIST.md** for checklist

### Updating Documentation
- Project changes → Update **README.md**
- AI instructions → Update **COPILOT.md**
- New hardware → Add to **HARDWARE_INTEGRATION_CHECKLIST.md**
- New integration patterns → Update **NATIVE_DRIVER_INTEGRATION.md**

## Key Files in the Moddable SDK

When working with native drivers, you'll need to reference:

- `moddable/modules/drivers/` - SDK driver implementations
- `moddable/xs/includes/xs.h` - XS macro definitions
- `moddable/build/devices/esp32/xsProj-esp32s3/main/CMakeLists.txt` - Main component build configuration
- `moddable/build/devices/esp32/xs_idf_deps.txt` - ESP-IDF dependencies

## Lessons Learned

### The Big Picture
The Moddable build system is designed for JavaScript-first development. Native drivers require explicit integration because:
1. Manifests are processed for JavaScript modules, not native sources
2. ESP-IDF CMake integration requires explicit source listing
3. Linking must be configured to pull in native symbols

### Specific to BMP390
1. The Adafruit bridge provides full sensor calibration (not available in pure JS)
2. Macro signatures change between SDK versions (check xs.h)
3. C files must be explicitly marked as C language in CMake
4. The main component must be a dependency of xsesp32 for linking

### Debugging Tips
1. Check build output for native compilation steps
2. Verify CMakeLists.txt paths use forward slashes
3. Clear CMake cache after CMakeLists.txt changes
4. Check for macro signature mismatches in xs.h
5. Ensure main is in xsesp32's REQUIRES list

## Related Projects

- `chronodot-clock/` - ChronoDot 3.0 RTC integration example
- `iot-remote/` - Complex multi-hardware project example
- `moddable/modules/drivers/` - SDK driver implementations

## Questions?

1. **How do I add new hardware?** → See HARDWARE_INTEGRATION_CHECKLIST.md
2. **Why is my native driver not compiling?** → See NATIVE_DRIVER_INTEGRATION.md
3. **What went wrong with BMP390?** → See BMP390_FIX_SUMMARY.md
4. **How do I configure my AI assistant?** → See COPILOT.md
5. **How do I build and run this project?** → See README.md

## Version History

- **v1.0** (June 2026) - Initial documentation after successful BMP390 native driver integration
  - Added HARDWARE_INTEGRATION_CHECKLIST.md
  - Added NATIVE_DRIVER_INTEGRATION.md
  - Added BMP390_FIX_SUMMARY.md
  - Updated COPILOT.md with native driver guidelines
  - Updated README.md with build system requirements
