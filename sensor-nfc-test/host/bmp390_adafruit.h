/*
 * C++ wrapper for Adafruit BMP3XX library for Moddable
 * Ported from Adafruit_BMP3XX_Library
 * https://github.com/adafruit/Adafruit_BMP3XX
 */

#ifndef BMP390_ADAFRUIT_H
#define BMP390_ADAFRUIT_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Opaque handle for BMP390 instance
typedef struct bmp390_handle* bmp390_handle_t;

// I2C callback function types
typedef void (*moddable_i2c_write_fn)(uint8_t address, uint8_t *data, uint16_t length);
typedef void (*moddable_i2c_read_fn)(uint8_t address, uint8_t *data, uint16_t length);

// Create BMP390 instance
bmp390_handle_t bmp390_create(uint8_t address);

// Destroy BMP390 instance
void bmp390_destroy(bmp390_handle_t handle);

// Set I2C callbacks
void bmp390_set_i2c_callbacks(moddable_i2c_write_fn write_fn, moddable_i2c_read_fn read_fn);

// Initialize sensor
bool bmp390_begin(bmp390_handle_t handle);

// Reset sensor
void bmp390_reset(bmp390_handle_t handle);

// Get chip ID
uint8_t bmp390_get_chip_id(bmp390_handle_t handle);

// Read temperature (Celsius)
float bmp390_read_temperature(bmp390_handle_t handle);

// Read pressure (Pascals)
float bmp390_read_pressure(bmp390_handle_t handle);

// Read altitude (meters)
float bmp390_read_altitude(bmp390_handle_t handle, float sea_level);

// Set temperature oversampling
bool bmp390_set_temperature_oversampling(bmp390_handle_t handle, uint8_t os);

// Set pressure oversampling
bool bmp390_set_pressure_oversampling(bmp390_handle_t handle, uint8_t os);

// Set IIR filter coefficient
bool bmp390_set_iir_filter_coeff(bmp390_handle_t handle, uint8_t fs);

// Set output data rate
bool bmp390_set_output_data_rate(bmp390_handle_t handle, uint8_t odr);

// Perform reading (blocking)
bool bmp390_perform_reading(bmp390_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif // BMP390_ADAFRUIT_H
