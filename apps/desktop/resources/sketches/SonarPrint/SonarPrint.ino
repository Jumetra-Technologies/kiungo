// The Sprint 2 check sketch: what a student writes for an HC-SR04 with NewPing.
// Kiungo never changes it. In a Hybrid build the sensor can be virtual.
#include <NewPing.h>

NewPing sonar(9, 10, 400);   // trigger, echo, max distance in cm

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(sonar.ping_cm());
  delay(50);
}
