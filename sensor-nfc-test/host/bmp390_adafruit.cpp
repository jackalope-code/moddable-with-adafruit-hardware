/*
 * C++ implementation of Adafruit BMP3XX library for Moddable
 * Ported from Adafruit_BMP3XX_Library
 * https://github.com/adafruit/Adafruit_BMP3XX
 */

#include "bmp390_adafruit.h"
#include "xsHost.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

// BMP390 registers
#define BMP390_REG_CHIP_ID     0x00
#define BMP390_REG_ERR_REG     0x02
#define BMP390_REG_STATUS      0x03
#define BMP390_REG_DATA        0x04
#define BMP390_REG_CTRL_MEAS   0x07
#define BMP390_REG_CONFIG      0x08
#define BMP390_REG_ODR         0x09
#define BMP390_REG_CMD         0x7E
#define BMP390_REG_CALIB_DATA  0x31

#define BMP390_CHIP_ID         0x60
#define BMP390_CMD_SOFT_RESET  0xB6

// Moddable I2C interface
extern "C" {
    static moddable_i2c_write_fn g_i2c_write = NULL;
    static moddable_i2c_read_fn g_i2c_read = NULL;
    
    void bmp390_set_i2c_callbacks(moddable_i2c_write_fn write_fn, moddable_i2c_read_fn read_fn) {
        g_i2c_write = write_fn;
        g_i2c_read = read_fn;
    }
}

// BMP390 calibration data structure (from Bosch BMP3 SensorAPI)
typedef struct {
    uint16_t par_t1;
    int16_t  par_t2;
    int8_t   par_t3;
    int16_t  par_p1;
    int16_t  par_p2;
    int8_t   par_p3;
    int8_t   par_p4;
    int16_t  par_p5;
    int16_t  par_p6;
    int8_t   par_p7;
    int8_t   par_p8;
    int16_t  par_p9;
    int8_t   par_p10;
    int8_t   par_p11;
} bmp390_calib_data;

// BMP390 instance structure
struct bmp390_handle {
    uint8_t address;
    uint8_t chip_id;
    bool initialized;
    double temperature;
    double pressure;
    bmp390_calib_data calib;
};

// Helper: read 8-bit register
static uint8_t read8(bmp390_handle_t handle, uint8_t reg) {
    uint8_t buffer[1] = {reg};
    uint8_t result[1] = {0};
    
    if (g_i2c_write) {
        g_i2c_write(handle->address, buffer, 1);
    }
    if (g_i2c_read) {
        g_i2c_read(handle->address, result, 1);
    }
    
    return result[0];
}

// Helper: write 8-bit register
static void write8(bmp390_handle_t handle, uint8_t reg, uint8_t value) {
    uint8_t buffer[2] = {reg, value};
    if (g_i2c_write) {
        g_i2c_write(handle->address, buffer, 2);
    }
}

// Helper: read buffer
static void read_buffer(bmp390_handle_t handle, uint8_t reg, uint8_t *buffer, uint16_t length) {
    uint8_t reg_buf[1] = {reg};
    if (g_i2c_write) {
        g_i2c_write(handle->address, reg_buf, 1);
    }
    if (g_i2c_read) {
        g_i2c_read(handle->address, buffer, length);
    }
}

// Helper: unpack 24-bit value
static int32_t unpack24(const uint8_t *data, int offset) {
    return ((int32_t)data[offset] << 16) | ((int32_t)data[offset + 1] << 8) | (int32_t)data[offset + 2];
}

// Create BMP390 instance
bmp390_handle_t bmp390_create(uint8_t address) {
    bmp390_handle_t handle = (bmp390_handle_t)c_malloc(sizeof(struct bmp390_handle));
    if (!handle) return NULL;
    
    memset(handle, 0, sizeof(struct bmp390_handle));
    handle->address = address;
    handle->initialized = false;
    memset(&handle->calib, 0, sizeof(bmp390_calib_data));
    
    return handle;
}

// Destroy BMP390 instance
void bmp390_destroy(bmp390_handle_t handle) {
    if (handle) {
        c_free(handle);
    }
}

// Initialize sensor
bool bmp390_begin(bmp390_handle_t handle) {
    if (!handle) return false;
    
    // Soft reset
    write8(handle, BMP390_REG_CMD, BMP390_CMD_SOFT_RESET);
    
    // Wait for reset (no delay available in C++ context, assume immediate)
    
    // Read chip ID
    handle->chip_id = read8(handle, BMP390_REG_CHIP_ID);
    if (handle->chip_id != BMP390_CHIP_ID) {
        return false;
    }
    
    // Read calibration data (21 bytes)
    uint8_t calib_raw[21];
    read_buffer(handle, BMP390_REG_CALIB_DATA, calib_raw, 21);
    
    // Parse calibration data (from Bosch BMP3 SensorAPI)
    handle->calib.par_t1 = (calib_raw[1] << 8) | calib_raw[0];
    handle->calib.par_t2 = (int16_t)((calib_raw[3] << 8) | calib_raw[2]);
    handle->calib.par_t3 = (int8_t)calib_raw[4];
    
    handle->calib.par_p1 = (int16_t)((calib_raw[6] << 8) | calib_raw[5]);
    handle->calib.par_p2 = (int16_t)((calib_raw[8] << 8) | calib_raw[7]);
    handle->calib.par_p3 = (int8_t)calib_raw[9];
    handle->calib.par_p4 = (int8_t)calib_raw[10];
    handle->calib.par_p5 = (calib_raw[12] << 8) | calib_raw[11];
    handle->calib.par_p6 = (calib_raw[14] << 8) | calib_raw[13];
    handle->calib.par_p7 = (int8_t)calib_raw[15];
    handle->calib.par_p8 = (int8_t)calib_raw[16];
    handle->calib.par_p9 = (int16_t)((calib_raw[18] << 8) | calib_raw[17]);
    handle->calib.par_p10 = (int8_t)calib_raw[19];
    handle->calib.par_p11 = (int8_t)calib_raw[20];
    
    // Configure sensor
    write8(handle, BMP390_REG_ODR, 0x05);      // ODR
    write8(handle, BMP390_REG_CONFIG, 0x00);    // Config
    write8(handle, BMP390_REG_CTRL_MEAS, 0x33); // PWR_CTRL
    
    handle->initialized = true;
    return true;
}

// Reset sensor
void bmp390_reset(bmp390_handle_t handle) {
    if (!handle) return;
    write8(handle, BMP390_REG_CMD, BMP390_CMD_SOFT_RESET);
}

// Get chip ID
uint8_t bmp390_get_chip_id(bmp390_handle_t handle) {
    if (!handle) return 0;
    return handle->chip_id;
}

// Temperature compensation (from Bosch BMP3 SensorAPI)
static float compensate_temp(bmp390_handle_t handle, int32_t raw_temp) {
    const bmp390_calib_data *c = &handle->calib;
    
    double par_t1_q = c->par_t1 / 0.00390625;
    double par_t2_q = c->par_t2 / 1073741824.0;
    double par_t3_q = c->par_t3 / 281474976710656.0;
    
    double partial_data1 = raw_temp - par_t1_q;
    double partial_data2 = partial_data1 * par_t2_q;
    double t_lin = partial_data2 + (partial_data1 * partial_data1) * par_t3_q;
    
    return (float)t_lin;
}

// Pressure compensation (from Bosch BMP3 SensorAPI)
static float compensate_press(bmp390_handle_t handle, int32_t raw_press, double t_lin) {
    const bmp390_calib_data *c = &handle->calib;
    
    double par_p1_q = (c->par_p1 - 16384) / 1048576.0;
    double par_p2_q = (c->par_p2 - 16384) / 536870912.0;
    double par_p3_q = c->par_p3 / 4294967296.0;
    double par_p4_q = c->par_p4 / 137438953472.0;
    double par_p5_q = c->par_p5 * 8.0;
    double par_p6_q = c->par_p6 / 64.0;
    double par_p7_q = c->par_p7 / 256.0;
    double par_p8_q = c->par_p8 / 32768.0;
    double par_p9_q = c->par_p9 / 281474976710656.0;
    double par_p10_q = c->par_p10 / 281474976710656.0;
    double par_p11_q = c->par_p11 / 36893488147419103232.0;
    
    double p1 = par_p6_q * t_lin;
    double p2 = par_p7_q * pow(t_lin, 2);
    double p3 = par_p8_q * pow(t_lin, 3);
    double partial_out1 = par_p5_q + p1 + p2 + p3;
    
    double p4 = par_p2_q * t_lin;
    double p5 = par_p3_q * pow(t_lin, 2);
    double p6 = par_p4_q * pow(t_lin, 3);
    double partial_out2 = raw_press * (par_p1_q + p4 + p5 + p6);
    
    double p7 = pow(raw_press, 2);
    double p8 = par_p9_q + par_p10_q * t_lin;
    double p9 = p7 * p8;
    double p10 = p9 + pow(raw_press, 3) * par_p11_q;
    
    return (float)(partial_out1 + partial_out2 + p10);
}

// Perform reading (blocking)
bool bmp390_perform_reading(bmp390_handle_t handle) {
    if (!handle || !handle->initialized) return false;
    
    uint8_t data[6];
    read_buffer(handle, BMP390_REG_DATA, data, 6);
    
    int32_t raw_press = unpack24(data, 0);
    int32_t raw_temp = unpack24(data, 3);
    
    double t_lin = compensate_temp(handle, raw_temp);
    handle->temperature = t_lin;
    handle->pressure = compensate_press(handle, raw_press, t_lin);
    
    return true;
}

// Read temperature (Celsius)
float bmp390_read_temperature(bmp390_handle_t handle) {
    if (!handle) return NAN;
    if (bmp390_perform_reading(handle)) {
        return handle->temperature;
    }
    return NAN;
}

// Read pressure (Pascals)
float bmp390_read_pressure(bmp390_handle_t handle) {
    if (!handle) return NAN;
    if (bmp390_perform_reading(handle)) {
        return handle->pressure;
    }
    return NAN;
}

// Read altitude (meters)
float bmp390_read_altitude(bmp390_handle_t handle, float sea_level) {
    if (!handle) return NAN;
    float pressure = bmp390_read_pressure(handle);
    if (isnan(pressure)) return NAN;
    
    return 44330.0 * (1.0 - pow(pressure / sea_level, 0.1903));
}

// Set temperature oversampling
bool bmp390_set_temperature_oversampling(bmp390_handle_t handle, uint8_t os) {
    // Placeholder - would need to implement register writing
    return true;
}

// Set pressure oversampling
bool bmp390_set_pressure_oversampling(bmp390_handle_t handle, uint8_t os) {
    // Placeholder - would need to implement register writing
    return true;
}

// Set IIR filter coefficient
bool bmp390_set_iir_filter_coeff(bmp390_handle_t handle, uint8_t fs) {
    // Placeholder - would need to implement register writing
    return true;
}

// Set output data rate
bool bmp390_set_output_data_rate(bmp390_handle_t handle, uint8_t odr) {
    // Placeholder - would need to implement register writing
    return true;
}
