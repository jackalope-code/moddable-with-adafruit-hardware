# Adafruit BMP280 Sensor Demo

Reads temperature and barometric pressure from an **Adafruit BMP280** (or compatible Bosch BMP280) sensor and displays the values on the Moddable Six screen.

## Wiring

Connect the BMP280 breakout to the Moddable Six Qwiic/Stemma QT connector (JST-SH 4-pin):

| BMP280 | Moddable Six |
|--------|-------------|
| VIN    | 3.3V        |
| GND    | GND         |
| SDA    | GPIO4       |
| SCL    | GPIO5       |

## Build & Run

```bash
mcconfig -d -m -p esp32/moddable_six
```

The default I2C address is `0x76`. Some Adafruit BMP280 breakouts ship configured for `0x77`; if the sensor is not detected, add address-selection jumper/solder on the breakout board.
