// Obstacle avoider: drive forward; when something is closer than CLEAR_CM, turn right until the way is clear.
// The left wheel is DC motor 1, the right wheel DC motor 2.
const int LEFT_EN = 5;
const int LEFT_IN1 = 2;
const int LEFT_IN2 = 3;
const int RIGHT_EN = 9;
const int RIGHT_IN1 = 4;
const int RIGHT_IN2 = 6;
const int TRIG_PIN = 7;
const int ECHO_PIN = 8;

const int SPEED = 170;      // 0 to 255
const int TURN_SPEED = 150;
const int CLEAR_CM = 25;

void setMotor(int en, int in1, int in2, int speed) {
  digitalWrite(in1, speed > 0 ? HIGH : LOW);
  digitalWrite(in2, speed < 0 ? HIGH : LOW);
  analogWrite(en, abs(speed));
}

void drive(int left, int right) {
  setMotor(LEFT_EN, LEFT_IN1, LEFT_IN2, left);
  setMotor(RIGHT_EN, RIGHT_IN1, RIGHT_IN2, right);
}

long distanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long echo = pulseIn(ECHO_PIN, HIGH, 30000);
  return echo == 0 ? 400 : echo * 0.0343 / 2;
}

void setup() {
  Serial.begin(9600);
  pinMode(LEFT_EN, OUTPUT);
  pinMode(LEFT_IN1, OUTPUT);
  pinMode(LEFT_IN2, OUTPUT);
  pinMode(RIGHT_EN, OUTPUT);
  pinMode(RIGHT_IN1, OUTPUT);
  pinMode(RIGHT_IN2, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  if (d < CLEAR_CM) {
    drive(TURN_SPEED, -TURN_SPEED);  // spin right on the spot
    delay(250);
  } else {
    drive(SPEED, SPEED);
    delay(40);
  }
}
