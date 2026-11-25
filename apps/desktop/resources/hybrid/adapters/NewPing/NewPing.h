// Kiungo's NewPing for Hybrid builds (INJ-02 launch adapter).
//
// Same public API as Tim Eckel's NewPing 1.9.x, so a sketch compiles
// unchanged. A sensor whose trigger pin is virtual answers with the distance
// the PC pushed; a sensor on real pins is pinged for real. The real library
// reads port registers directly, which is why a swap at the library level is
// needed rather than a pin-function shim (spec review, section 5).
#pragma once
#include <Arduino.h>

#define MAX_SENSOR_DISTANCE 500
#define US_ROUNDTRIP_IN 146
#define US_ROUNDTRIP_CM 57
#define ONE_PIN_ENABLED true
#define NO_ECHO 0
#define MAX_SENSOR_DELAY 5800
#define ECHO_TIMER_FREQ 24
#define PING_MEDIAN_DELAY 29000
#define PING_OVERHEAD 5
#define PING_TIMER_OVERHEAD 13
#define TIMER_ENABLED true
#define NewPingConvert(echoTime, conversionFactor) (max(((unsigned int)echoTime + conversionFactor / 2) / conversionFactor, (echoTime ? 1 : 0)))

class NewPing {
 public:
  NewPing(uint8_t trigger_pin, uint8_t echo_pin, unsigned int max_cm_distance = MAX_SENSOR_DISTANCE);
  unsigned int ping(unsigned int max_cm_distance = 0);
  unsigned long ping_cm(unsigned int max_cm_distance = 0);
  unsigned long ping_in(unsigned int max_cm_distance = 0);
  unsigned long ping_median(uint8_t it = 5, unsigned int max_cm_distance = 0);
  static unsigned int convert_in(unsigned int echoTime);
  static unsigned int convert_cm(unsigned int echoTime);
  // Timer-driven pings. In this adapter the callback runs on the next check_timer() or ping_timer() call,
  // not from Timer2: a Hybrid build keeps Timer2 free for the user's own tone() and the like.
  void ping_timer(void (*userFunc)(void), unsigned int max_cm_distance = 0);
  boolean check_timer();
  unsigned long ping_result;
  static void timer_us(unsigned int frequency, void (*userFunc)(void));
  static void timer_ms(unsigned long frequency, void (*userFunc)(void));
  static void timer_stop();

  // Kiungo: true when this sensor answers from the PC.
  bool isVirtual() const { return _sensor >= 0; }

 private:
  void set_max_distance(unsigned int max_cm_distance);
  unsigned long echo_us(unsigned int max_cm_distance);
  uint8_t _trigger, _echo;
  int8_t _sensor;
  unsigned int _maxEchoTime;
  void (*_timerFunc)(void) = nullptr;
};
