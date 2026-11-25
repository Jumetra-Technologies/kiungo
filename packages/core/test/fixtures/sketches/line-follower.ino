// Line follower: the light sensors sit either side of the line. When one sees the dark tape,
// the robot has drifted that way: slow that side's wheel to turn back onto the line.
// The left wheel is DC motor 1, the right wheel DC motor 2.
const int LEFT_EN = 5;
const int LEFT_IN1 = 2;
const int LEFT_IN2 = 3;
const int RIGHT_EN = 9;
const int RIGHT_IN1 = 4;
const int RIGHT_IN2 = 6;
const int LEFT_SENSOR = A0;
const int RIGHT_SENSOR = A1;

const int SPEED = 140;   // 0 to 255
const int DARK = 300;    // below this (0 to 1023) the sensor is over the tape

void setMotor(int en, int in1, int in2, int speed) {
  digitalWrite(in1, speed > 0 ? HIGH : LOW);
  digitalWrite(in2, speed < 0 ? HIGH : LOW);
  analogWrite(en, abs(speed));
}

void drive(int left, int right) {
  setMotor(LEFT_EN, LEFT_IN1, LEFT_IN2, left);
  setMotor(RIGHT_EN, RIGHT_IN1, RIGHT_IN2, right);
}

void setup() {
  Serial.begin(9600);
  pinMode(LEFT_EN, OUTPUT);
  pinMode(LEFT_IN1, OUTPUT);
  pinMode(LEFT_IN2, OUTPUT);
  pinMode(RIGHT_EN, OUTPUT);
  pinMode(RIGHT_IN1, OUTPUT);
  pinMode(RIGHT_IN2, OUTPUT);
}

void loop() {
  bool leftDark = analogRead(LEFT_SENSOR) < DARK;
  bool rightDark = analogRead(RIGHT_SENSOR) < DARK;
  if (leftDark && !rightDark) {
    drive(0, SPEED);   // the line is to the left: turn left
  } else if (rightDark && !leftDark) {
    drive(SPEED, 0);   // the line is to the right: turn right
  } else {
    drive(SPEED, SPEED);
  }
}
