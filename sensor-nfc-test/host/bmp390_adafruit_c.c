/*
 * C binding layer for XS integration with Adafruit BMP390 C++ bridge
 * Bridges JavaScript calls to the C++ implementation
 */

#include "xsHost.h"
#include "xsmc.h"
#include "mc.xs.h"
#include "bmp390_adafruit.h"

// Structure to hold BMP390 instance and I2C IO reference
typedef struct bmp390_instance {
    xsSlot obj;
    xsMachine *the;
    xsSlot ioSlot;  // Reference to JavaScript I2C object
    bmp390_handle_t handle;
    uint8_t address;
} bmp390_instance, *bmp390_instance_ptr;

// Global instance reference for I2C callbacks (single-threaded assumption)
static bmp390_instance_ptr g_current_instance = NULL;

// I2C callback functions that call back into JavaScript
static void moddable_i2c_write_callback(uint8_t address, uint8_t *data, uint16_t length) {
    if (!g_current_instance || !g_current_instance->the)
        return;
    
    xsMachine *the = g_current_instance->the;
    xsmcVars(1);
    
    // Create a Uint8Array from the data
    xsVar(0) = xsNewArray(the, length, xsGlobal(the, xsID_Uint8Array));
    uint8_t *arrayData = xsmcToArrayBuffer(xsVar(0));
    if (arrayData) {
        for (uint16_t i = 0; i < length; i++) {
            arrayData[i] = data[i];
        }
    }
    
    // Call io.write(data) on the JavaScript I2C object
    xsmcCall(xsResult, g_current_instance->ioSlot, xsID_write, 1, xsVar(0));
}

static void moddable_i2c_read_callback(uint8_t address, uint8_t *data, uint16_t length) {
    if (!g_current_instance || !g_current_instance->the)
        return;
    
    xsMachine *the = g_current_instance->the;
    xsmcVars(1);
    
    // Create a Uint8Array to receive data
    xsVar(0) = xsNewArray(the, length, xsGlobal(the, xsID_Uint8Array));
    
    // Call io.read(buffer) on the JavaScript I2C object
    xsmcCall(xsResult, g_current_instance->ioSlot, xsID_read, 1, xsVar(0));
    
    // Copy the result back to the data buffer
    uint8_t *arrayData = xsmcToArrayBuffer(xsVar(0));
    if (arrayData) {
        for (uint16_t i = 0; i < length; i++) {
            data[i] = arrayData[i];
        }
    }
}

// Constructor: xs_bmp390_adafruit_constructor
void xs_bmp390_adafruit_constructor(xsMachine *the) {
    bmp390_instance_ptr instance;
    xsSlot ioSlot;
    uint8_t address = 0x77; // default address
    
    xsmcVars(1);
    
    // Get the I2C object from the options
    xsmcGet(xsVar(0), xsArg(0), xsID_io);
    ioSlot = xsVar(0);
    
    // Check if address is provided
    if (xsmcArgc > 1) {
        xsmcGet(xsVar(0), xsArg(0), xsID_address);
        address = xsmcToInteger(xsVar(0));
    }
    
    // Allocate instance structure
    instance = c_malloc(sizeof(bmp390_instance));
    if (!instance)
        xsUnknownError("no memory");
    
    // Store instance data
    instance->obj = xsThis;
    instance->the = the;
    instance->ioSlot = ioSlot;
    instance->address = address;
    
    // Set global instance for I2C callbacks
    g_current_instance = instance;
    
    // Create BMP390 handle
    instance->handle = bmp390_create(address);
    if (!instance->handle) {
        g_current_instance = NULL;
        c_free(instance);
        xsUnknownError("failed to create BMP390");
    }
    
    // Set I2C callbacks
    bmp390_set_i2c_callbacks(moddable_i2c_write_callback, moddable_i2c_read_callback);
    
    // Attach to XS object
    xsmcSetHostData(xsThis, instance);
    xsRemember(xsThis);
}

// Destructor: xs_bmp390_adafruit_destructor
void xs_bmp390_adafruit_destructor(void *data) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)data;
    
    if (NULL == instance)
        return;
    
    if (instance->handle) {
        bmp390_destroy(instance->handle);
    }
    
    if (g_current_instance == instance) {
        g_current_instance = NULL;
    }
    
    c_free(instance);
}

// Initialize the sensor: xs_bmp390_adafruit_begin
void xs_bmp390_adafruit_begin(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    // Set global instance for I2C callbacks during begin
    g_current_instance = instance;
    
    bool success = bmp390_begin(instance->handle);
    xsResult = xsBoolean(success);
}

// Reset the sensor: xs_bmp390_adafruit_reset
void xs_bmp390_adafruit_reset(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    g_current_instance = instance;
    bmp390_reset(instance->handle);
}

// Get chip ID: xs_bmp390_adafruit_getChipID
void xs_bmp390_adafruit_getChipID(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    uint8_t chip_id = bmp390_get_chip_id(instance->handle);
    xsResult = xsInteger(chip_id);
}

// Read temperature: xs_bmp390_adafruit_readTemperature
void xs_bmp390_adafruit_readTemperature(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    g_current_instance = instance;
    float temp = bmp390_read_temperature(instance->handle);
    xsResult = xsNumber(temp);
}

// Read pressure: xs_bmp390_adafruit_readPressure
void xs_bmp390_adafruit_readPressure(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    g_current_instance = instance;
    float pressure = bmp390_read_pressure(instance->handle);
    xsResult = xsNumber(pressure);
}

// Read altitude: xs_bmp390_adafruit_readAltitude
void xs_bmp390_adafruit_readAltitude(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    float sea_level = 1013.25; // default sea level pressure
    if (xsmcArgc > 0) {
        sea_level = xsmcToNumber(xsArg(0));
    }
    
    g_current_instance = instance;
    float altitude = bmp390_read_altitude(instance->handle, sea_level);
    xsResult = xsNumber(altitude);
}

// Set temperature oversampling: xs_bmp390_adafruit_setTemperatureOversampling
void xs_bmp390_adafruit_setTemperatureOversampling(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    if (xsmcArgc > 0) {
        uint8_t os = xsmcToInteger(xsArg(0));
        g_current_instance = instance;
        bool success = bmp390_set_temperature_oversampling(instance->handle, os);
        xsResult = xsBoolean(success);
    }
}

// Set pressure oversampling: xs_bmp390_adafruit_setPressureOversampling
void xs_bmp390_adafruit_setPressureOversampling(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    if (xsmcArgc > 0) {
        uint8_t os = xsmcToInteger(xsArg(0));
        g_current_instance = instance;
        bool success = bmp390_set_pressure_oversampling(instance->handle, os);
        xsResult = xsBoolean(success);
    }
}

// Set IIR filter coefficient: xs_bmp390_adafruit_setIIRFilterCoeff
void xs_bmp390_adafruit_setIIRFilterCoeff(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    if (xsmcArgc > 0) {
        uint8_t fs = xsmcToInteger(xsArg(0));
        g_current_instance = instance;
        bool success = bmp390_set_iir_filter_coeff(instance->handle, fs);
        xsResult = xsBoolean(success);
    }
}

// Set output data rate: xs_bmp390_adafruit_setOutputDataRate
void xs_bmp390_adafruit_setOutputDataRate(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    if (xsmcArgc > 0) {
        uint8_t odr = xsmcToInteger(xsArg(0));
        g_current_instance = instance;
        bool success = bmp390_set_output_data_rate(instance->handle, odr);
        xsResult = xsBoolean(success);
    }
}

// Perform reading: xs_bmp390_adafruit_performReading
void xs_bmp390_adafruit_performReading(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance || NULL == instance->handle)
        return;
    
    g_current_instance = instance;
    bool success = bmp390_perform_reading(instance->handle);
    xsResult = xsBoolean(success);
}

// Close: xs_bmp390_adafruit_close
void xs_bmp390_adafruit_close(xsMachine *the) {
    bmp390_instance_ptr instance = (bmp390_instance_ptr)xsmcGetHostData(xsThis);
    if (NULL == instance)
        return;
    
    if (instance->handle) {
        bmp390_destroy(instance->handle);
        instance->handle = NULL;
    }
    
    if (g_current_instance == instance) {
        g_current_instance = NULL;
    }
}
