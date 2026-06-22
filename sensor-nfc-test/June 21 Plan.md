# June 21 Plan — BMP390 native driver troubleshooting

Continuation notes so we can resume without losing context. Project: `hardware-demo/sensor-nfc-test` on Moddable Six (ESP32-S3). Driver lives in `moddable/modules/drivers/sensors/bmp390/`.

## Current status

- The BMP390 driver was rewritten to do I2C **natively via Moddable's `modI2C` C API** (no more native->JS callbacks). That work is done in the source files.
- **The last build FAILED to compile** with:
  ```
  bmp390_adafruit.cpp:9:10: fatal error: modI2C.h: No such file or directory
  ```
  The serial trace the user saw (old `set_i2c_callbacks` / `i2c write cb` messages) was the **previously-flashed firmware** running, because this build never linked.

## Root cause of the build failure (KEY LEARNING)

ESP32 builds split C/C++ compilation into two places:

1. **`"sources"` manifest entries** → compiled in the **esp-idf `main` component** (`idf_component_register` in the generated `.../xsProj-esp32s3/main/CMakeLists.txt`). This component has a **fixed/curated `INCLUDE_DIRS`** list: `xs/platforms/esp`, `mc`, `xs/includes`, `base/instrumentation`, `io`, `base/timer`, the build tmp dir, **plus the directories of the `"sources"` files**. It does **NOT** include `pins/i2c/esp32`, so `modI2C.h` is not found.

2. **`"modules"` native C files** (e.g. `modI2C.c`, `modFt6206.c`, `modneopixel.c`) → compiled into the **Moddable prebuilt static lib `xs_esp32s3.a`** with the **full module include path** (which DOES include `pins/i2c/esp32`). These are the `# cc xxx.c.o` lines in mcconfig output.

Because `bmp390_adafruit.cpp` / `bmp390_adafruit_c.c` are under `"sources"`, they land in the `main` component and can't see `modI2C.h`.

### Why `"include": ["pins/i2c/manifest.json"]` does NOT fix it
Manifest includes are merged + de-duped into one flat manifest. The host manifest already includes `pins/i2c` (line 9 of `host/manifest.json`). Adding it again in the driver manifest produces the same merged result. The `main` component `INCLUDE_DIRS` is built from a template + `"sources"` dirs, NOT from module include dirs — so no manifest `"include"` will add `pins/i2c/esp32` to it.

### Why bmp280 gets away with `"sources"`
`bmp280` uses the same `"sources"` + `_adafruit.cpp` + `_adafruit_c.c` pattern, BUT its `.cpp` does **not** `#include "modI2C.h"` — it uses an `extern "C"` JS-side I2C bridge (`arduino_stub.cpp`). So it never needs the `pins/i2c/esp32` include dir. bmp390 is different because we deliberately switched it to native `modI2C`.

## THE FIX TO APPLY NEXT (start here)

Move the bmp390 native C from `"sources"` into `"modules"` so they compile into the Moddable lib (and thus get the full include path, incl. `pins/i2c/esp32`). Proven patterns: `ft6206` (`"*": "./*"` glob) and `neopixel`.

Current `moddable/modules/drivers/sensors/bmp390/manifest.json` (note: I already added the `"include"` for pins/i2c — keep it, it ensures modI2C.c is compiled):
```json
{
	"include": [
		"$(MODDABLE)/modules/pins/i2c/manifest.json"
	],
	"modules": {
		"embedded:sensor/Barometer-Temperature/BMP390/Adafruit": "$(MODDABLE)/modules/drivers/sensors/bmp390/bmp390_adafruit"
	},
	"sources": [
		"$(MODDABLE)/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp",
		"$(MODDABLE)/modules/drivers/sensors/bmp390/bmp390_adafruit_c.c"
	]
}
```

**Recommended change — try this first** (glob like neopixel, drop `"sources"`):
```json
{
	"include": [
		"$(MODDABLE)/modules/pins/i2c/manifest.json"
	],
	"modules": {
		"embedded:sensor/Barometer-Temperature/BMP390/Adafruit": "$(MODDABLE)/modules/drivers/sensors/bmp390/bmp390_adafruit",
		"*": "$(MODDABLE)/modules/drivers/sensors/bmp390/*"
	}
}
```
- The `"*"` glob compiles `bmp390_adafruit.cpp` and `bmp390_adafruit_c.c` into the Moddable lib (full includes → finds `modI2C.h`). It also registers `bmp390_adafruit.js` as module `bmp390_adafruit`; the explicit `embedded:` key keeps the specifier `main.js` imports.

### WATCH OUT for these when applying the fix
1. **Double-compile / duplicate symbols.** Both the `embedded:` mapping (basename `bmp390_adafruit` may auto-pull `bmp390_adafruit.cpp`) and the `"*"` glob could reference `bmp390_adafruit.cpp`. Moddable usually de-dupes by source path, but if the linker complains about duplicate `xs_bmp390_adafruit_*` symbols, switch to listing files explicitly instead of the glob, e.g.:
   ```json
   "modules": {
       "embedded:sensor/Barometer-Temperature/BMP390/Adafruit": "$(MODDABLE)/.../bmp390_adafruit",
       "bmp390/binding": "$(MODDABLE)/.../bmp390_adafruit_c"
   }
   ```
   and verify whether the `embedded:` entry alone compiles the `.cpp` (matching basename). If the `.cpp` does NOT get compiled this way, add a unique key for it too.
2. **Module name clash.** If mcconfig errors that `bmp390_adafruit` is defined twice, remove the glob and use explicit unique keys for the native files only.
3. There is a **stale duplicate** `host/bmp390_adafruit.js` in the app dir — it is NOT imported (`main.js` imports the `embedded:` specifier which resolves to the `moddable/modules/...` copy). Edit the moddable copy, not the host one. Consider deleting the stale host copy.

## After it compiles
1. `cd hardware-demo/sensor-nfc-test/host` then `mcconfig -d -m -p esp32/moddable_six`.
2. Expect link to succeed and new trace strings to appear (these confirm the new firmware is running):
   - `BMP390[JS]: constructing (data=4, clock=5, hz=400000)`
   - `BMP390: create address 0x77 sda 4 scl 5 hz 400000`
   - `BMP390: chip id 0x60` (0x60 = BMP390, 0x50 = BMP388)
   - `BMP390: begin OK (initialized)` → `BMP390[JS]: ready`
3. If I2C fails you'll instead see `read8 ... FAILED` / `chip id 0x0` — that points to wiring/address/bus-sharing.
4. Trace logging is gated by `BMP390_DEBUG` (default 1) in `bmp390_adafruit.cpp`. To silence later, add `"defines": { "BMP390_DEBUG": 0 }` to the bmp390 manifest.

## Files changed so far
- `moddable/modules/drivers/sensors/bmp390/bmp390_adafruit.cpp` — native modI2C, correct BMP390 register map, fixed calib types, little-endian `unpack24`, real OSR/ODR/CONFIG writes, soft-reset delay, trace logging (`BMP_LOG`/`BMP_LOGHEX`/`BMP_LOGINT`).
- `bmp390_adafruit.h` — new `bmp390_create(address, sda, scl, hz)`, dropped the callback API.
- `bmp390_adafruit_c.c` — dropped JS I2C callbacks + `xsRemember` misuse; constructor reads `{ data, clock, hz, address }`; xsTrace lifecycle logs.
- `bmp390_adafruit.js` — no longer creates an `io`; passes pins to `super()`; trace logs.
- `bmp390/manifest.json` — added `pins/i2c` include; removed abandoned `esp32_i2c_native.c`. **STILL TODO: move native files from `"sources"` to `"modules"` (the fix above).**
- `host/main.js` — BMP390 probe relies on the constructor (which runs `begin()` and throws on failure).

## Background root causes already solved (context)
- Original constructor crash: `xsRemember()` on stack slots (`xsVar`/`xsThis`) corrupted the XS GC root list. Never `xsRemember` a stack slot; retain via `xsmcSet(xsThis, xsID_io, ...)`.
- Original `begin()` hang: synchronous native->JS reentrant `xsmcCall` inside the I2C callbacks deadlocked the host. Proven by stubbing the callbacks (`#if 0`). Fix = the native `modI2C` rewrite (no JS reentrancy). `xsTrace` output is buffered and can be lost on a hang.
- Moddable Six default I2C pins: SDA(data)=4, SCL(clock)=5. `modI2C` shares the bus safely with RTC/NFC via the weak `i2cActivate` symbol on esp32.
