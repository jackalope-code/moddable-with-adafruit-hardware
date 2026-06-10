# ChronoDot 3.0 Clock — Moddable Six

Reads the current time from a [ChronoDot 3.0](https://shop.macetech.com/products/chronodot-v3-high-precision-rtc) real-time clock module and displays it on the Moddable Six's 2.4″ display using Piu.

## Hardware

| Component | Details |
|-----------|---------|
| Board | Moddable Six (ESP32-S3) |
| RTC | ChronoDot 3.0 (MAX31328, DS3231-compatible) |
| Interface | I²C (0.1" through-hole header — **not** Qwiic) |

### ChronoDot 3.0 Pull-Up Resistors

The ChronoDot 3.0 **does not ship with I²C pull-up resistors installed**. The board has two solder-jumper pads that let you add 4.7 kΩ or 10 kΩ pull-ups from SDA→VCC and SCL→VCC, but the resistors are **not populated** by default.

| Option | What to do |
|--------|-----------|
| **Solder resistors on the ChronoDot** | Install 4.7 kΩ (or 10 kΩ) resistors in the two labeled pads, then bridge the two small solder jumpers next to them with a blob of solder. |
| **Use external pull-ups** | Add a 4.7 kΩ resistor from **SDA to 3.3V** and another from **SCL to 3.3V** on your breadboard. This is often easier if you're already breadboarding. |
| **Use a Qwiic/Stemma adapter** | If you plug the ChronoDot into a Qwiic-to-breadboard adapter (or a Qwiic hub), the Moddable Six Qwiic connector already provides pull-ups, so no extra resistors are needed. |

> The Moddable Six's **Qwiic / Stemma QT** connector (JST-SH 4-pin) **does** include I²C pull-ups on SDA and SCL. However, the ChronoDot 3.0 is a 0.1" header module, so it will not plug directly into that connector unless you use a Qwiic-to-breadboard adapter cable.

### Wiring

Use jumper wires between the ChronoDot 3.0 and the **16-pin external header** on the Moddable Six (pins 1–4 carry the I²C bus and power):

| ChronoDot 3.0 | Moddable Six 16-pin header | Pin # |
|---------------|---------------------------|:-----:|
| **VCC** | 3.3V | 4 |
| **GND** | GND | 3 |
| **SDA** | SDA / IO4 (GPIO 4) | 1 |
| **SCL** | SCL / IO5 (GPIO 5) | 2 |

**If you are not using a Qwiic adapter with built-in pull-ups**, also add two 4.7 kΩ resistors:
- One resistor from **SDA** to **3.3V**
- One resistor from **SCL** to **3.3V**

These can be on your breadboard (external) or soldered onto the ChronoDot's pull-up pads and enabled via the solder jumpers.

### RTC chip note

The ChronoDot 3.0 uses a **MAX31328** (not DS3231), but Maxim designed it to be register-identical to the DS3231 — same I²C address (0x68) and same register map — so the Moddable SDK `embedded:RTC/DS3231` driver works without modification.

## Building

```sh
cd /path/to/hardware-demo/chronodot-clock
mcconfig -d -m -p esp32/moddable_six
```

### Setting the time

On first power-on (or if the backup battery is dead), the RTC oscillator will be stopped and the firmware initializes the clock to **2025-01-01 00:00:00 UTC**. To set the correct time, edit the fallback line in `main.js`:

```js
rtc.time = Date.UTC(2025, 0, 1, 0, 0, 0);  // ← replace with current UTC
```

Or add a Wi-Fi NTP sync and write the result to `rtc.time` at startup.

## Zephyr note

The Moddable SDK has Zephyr support (`zephyr/<board>` platform), but the Moddable Six is an ESP32-S3 board with no official Zephyr target in the SDK. The closest existing Zephyr target is `adafruit_feather_esp32s3_tft` (same MCU, different pins/display). This project therefore targets the native **`esp32/moddable_six`** platform, which provides full Piu display support and the ECMA-419 I2C API used by the DS3231 driver.

## Display

- **Background:** dark navy (`#0f172a`)
- **Time:** `HH:MM:SS` in large white type — colons blink every 500 ms
- **Date:** `Day, Mon DD YYYY` in muted blue-gray
- **Status:** green `● RTC Connected` or red `● RTC Not Found`
