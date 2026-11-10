// Distance sensor: the HC-SR04 sends a ping and times the echo.
const int TRIG_PIN = 2;
const int ECHO_PIN = 3;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Sound travels about 0.0343 cm per microsecond, there and back.
  long echo = pulseIn(ECHO_PIN, HIGH, 30000);
  if (echo == 0) {
    Serial.println("Nothing in range");
  } else {
    Serial.print(echo * 0.0343 / 2);
    Serial.println(" cm");
  }
  delay(200);
}
