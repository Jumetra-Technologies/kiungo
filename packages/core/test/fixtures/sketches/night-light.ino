// Night light: the LED comes on when the light sensor reads dark.
const int LIGHT_PIN = A0;
const int LED_PIN = 13;
// Below this reading (0 to 1023) it counts as dark.
const int DARK = 300;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int light = analogRead(LIGHT_PIN);
  digitalWrite(LED_PIN, light < DARK ? HIGH : LOW);
  Serial.println(light);
  delay(250);
}
