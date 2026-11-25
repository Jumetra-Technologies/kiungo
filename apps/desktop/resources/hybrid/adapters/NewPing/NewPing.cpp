#include "NewPing.h"

#include <kiungo_hybrid.h>

// This file talks to real pins itself, so it wants the real functions.
#undef digitalRead
#undef pulseIn
#undef pulseInLong
#undef digitalWrite

NewPing::NewPing(uint8_t trigger_pin, uint8_t echo_pin, unsigned int max_cm_distance)
    : ping_result(0), _trigger(trigger_pin), _echo(echo_pin), _sensor(kiungo_sensor_for_pin(trigger_pin)) {
  set_max_distance(max_cm_distance);
  if (_sensor < 0) {
    pinMode(_trigger, OUTPUT);
    pinMode(_echo, INPUT);
    digitalWrite(_trigger, LOW);
  }
}

void NewPing::set_max_distance(unsigned int max_cm_distance) {
  if (max_cm_distance == 0 || max_cm_distance > MAX_SENSOR_DISTANCE) max_cm_distance = MAX_SENSOR_DISTANCE;
  _maxEchoTime = max_cm_distance * US_ROUNDTRIP_CM + (US_ROUNDTRIP_CM / 2);
}

// The echo time in microseconds, or NO_ECHO. The pushed value for a virtual
// HC-SR04 is the distance in centimeters, as the lab's sensor control shows it.
unsigned long NewPing::echo_us(unsigned int max_cm_distance) {
  if (max_cm_distance) set_max_distance(max_cm_distance);
  if (_sensor >= 0) {
    int32_t cm = kiungo_sensor_value((uint8_t)_sensor, -1);
    if (cm <= 0) return NO_ECHO;
    unsigned long us = (unsigned long)cm * US_ROUNDTRIP_CM;
    return us > _maxEchoTime ? NO_ECHO : us;
  }
  // Real sensor: a 10 us trigger pulse, then the echo pulse length.
  digitalWrite(_trigger, LOW);
  delayMicroseconds(4);
  digitalWrite(_trigger, HIGH);
  delayMicroseconds(10);
  digitalWrite(_trigger, LOW);
  unsigned long us = pulseIn(_echo, HIGH, (unsigned long)_maxEchoTime + MAX_SENSOR_DELAY);
  if (us == 0 || us > _maxEchoTime) return NO_ECHO;
  return us;
}

unsigned int NewPing::ping(unsigned int max_cm_distance) {
  ping_result = echo_us(max_cm_distance);
  return (unsigned int)ping_result;
}

unsigned long NewPing::ping_cm(unsigned int max_cm_distance) {
  unsigned long us = echo_us(max_cm_distance);
  ping_result = us;
  return us ? NewPingConvert(us, US_ROUNDTRIP_CM) : NO_ECHO;
}

unsigned long NewPing::ping_in(unsigned int max_cm_distance) {
  unsigned long us = echo_us(max_cm_distance);
  ping_result = us;
  return us ? NewPingConvert(us, US_ROUNDTRIP_IN) : NO_ECHO;
}

unsigned long NewPing::ping_median(uint8_t it, unsigned int max_cm_distance) {
  unsigned int samples[it > 0 ? it : 1];
  uint8_t count = 0;
  for (uint8_t i = 0; i < it; i++) {
    unsigned int us = ping(max_cm_distance);
    if (us != NO_ECHO) {
      // insertion sort
      uint8_t j = count;
      while (j > 0 && samples[j - 1] > us) { samples[j] = samples[j - 1]; j--; }
      samples[j] = us;
      count++;
    }
    if (i + 1 < it && _sensor < 0) delayMicroseconds(PING_MEDIAN_DELAY);
  }
  if (count == 0) return NO_ECHO;
  return samples[count / 2];
}

unsigned int NewPing::convert_in(unsigned int echoTime) { return NewPingConvert(echoTime, US_ROUNDTRIP_IN); }
unsigned int NewPing::convert_cm(unsigned int echoTime) { return NewPingConvert(echoTime, US_ROUNDTRIP_CM); }

void NewPing::ping_timer(void (*userFunc)(void), unsigned int max_cm_distance) {
  _timerFunc = userFunc;
  ping_result = echo_us(max_cm_distance);
  if (_timerFunc) _timerFunc();
}

boolean NewPing::check_timer() {
  // The ping completed inside ping_timer(); report it once.
  if (_timerFunc == nullptr) return false;
  _timerFunc = nullptr;
  return ping_result != NO_ECHO;
}

void NewPing::timer_us(unsigned int, void (*userFunc)(void)) { if (userFunc) userFunc(); }
void NewPing::timer_ms(unsigned long, void (*userFunc)(void)) { if (userFunc) userFunc(); }
void NewPing::timer_stop() {}
