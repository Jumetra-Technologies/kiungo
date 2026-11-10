// Kiungo's DHT for Hybrid builds (INJ-02 launch adapter).
//
// Same public API as Adafruit's DHT sensor library 1.4.x for reading, so a
// sketch compiles unchanged. A virtual DHT answers with the temperature and
// humidity the PC pushed: tenths of a degree in the high 16 bits of the
// value, tenths of a percent in the low 16 (see packDht in
// @kiungo/core/hybrid/plan.ts). Until a value arrives, reads give NAN, as a
// real DHT that hasn't answered does.
//
// Only virtual DHTs are played here: the real library's bit timing isn't in
// this adapter. A DHT on the desk needs the board's run to be fully real
// (mark the board Virtual or the DHT Virtual, not one of each).
#pragma once
#include <Arduino.h>

static const uint8_t DHT11{11};
static const uint8_t DHT12{12};
static const uint8_t DHT21{21};
static const uint8_t DHT22{22};
static const uint8_t AM2301{21};

class DHT {
 public:
  DHT(uint8_t pin, uint8_t type, uint8_t count = 6);
  void begin(uint8_t usec = 55);
  float readTemperature(bool S = false, bool force = false);
  float convertCtoF(float);
  float convertFtoC(float);
  float computeHeatIndex(bool isFahrenheit = true);
  float computeHeatIndex(float temperature, float percentHumidity, bool isFahrenheit = true);
  float readHumidity(bool force = false);
  bool read(bool force = false);

 private:
  uint8_t _pin, _type;
  int8_t _sensor;
  int32_t value();
};
