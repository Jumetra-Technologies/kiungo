// Servo sweep: turns the servo from 0° to 180° and back.
#include <Servo.h>

const int SERVO_PIN = 3;
Servo servo;

void setup() {
  servo.attach(SERVO_PIN);
}

void loop() {
  for (int angle = 0; angle <= 180; angle++) {
    servo.write(angle);
    delay(15);
  }
  for (int angle = 180; angle >= 0; angle--) {
    servo.write(angle);
    delay(15);
  }
}
