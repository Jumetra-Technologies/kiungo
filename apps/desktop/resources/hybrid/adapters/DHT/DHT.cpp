#include "DHT.h"

#include <kiungo_hybrid.h>

DHT::DHT(uint8_t pin, uint8_t type, uint8_t) : _pin(pin), _type(type), _sensor(kiungo_sensor_for_pin(pin)) {}

void DHT::begin(uint8_t) {}

// The pushed value, or a marker that nothing has arrived.
int32_t DHT::value() {
  if (_sensor < 0 || !kiungo_sensor_known((uint8_t)_sensor)) return INT32_MIN;
  return kiungo_sensor_value((uint8_t)_sensor, 0);
}

bool DHT::read(bool) { return value() != INT32_MIN; }

float DHT::readTemperature(bool S, bool) {
  int32_t v = value();
  if (v == INT32_MIN) return NAN;
  float c = (int16_t)((uint32_t)v >> 16) / 10.0f;
  // A DHT11 reports whole degrees and tenths; a DHT22 tenths. Both come through as sent.
  return S ? convertCtoF(c) : c;
}

float DHT::readHumidity(bool) {
  int32_t v = value();
  if (v == INT32_MIN) return NAN;
  return (uint16_t)((uint32_t)v & 0xFFFF) / 10.0f;
}

float DHT::convertCtoF(float c) { return c * 1.8f + 32; }
float DHT::convertFtoC(float f) { return (f - 32) * 0.55555f; }

float DHT::computeHeatIndex(bool isFahrenheit) { return computeHeatIndex(readTemperature(isFahrenheit), readHumidity(), isFahrenheit); }

// The US National Weather Service's heat index: Steadman's simple form, and
// Rothfusz's regression with its adjustments above 80 °F.
float DHT::computeHeatIndex(float t, float rh, bool isFahrenheit) {
  if (!isFahrenheit) t = convertCtoF(t);
  float hi = 0.5f * (t + 61.0f + ((t - 68.0f) * 1.2f) + (rh * 0.094f));
  if (hi > 79) {
    hi = -42.379f + 2.04901523f * t + 10.14333127f * rh - 0.22475541f * t * rh - 0.00683783f * t * t - 0.05481717f * rh * rh +
         0.00122874f * t * t * rh + 0.00085282f * t * rh * rh - 0.00000199f * t * t * rh * rh;
    if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) * 0.25f) * sqrt((17 - fabs(t - 95)) * 0.05882f);
    else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) * 0.1f) * ((87 - t) * 0.2f);
  }
  return isFahrenheit ? hi : convertFtoC(hi);
}
