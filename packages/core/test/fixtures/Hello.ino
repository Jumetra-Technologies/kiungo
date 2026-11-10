// Prints a counter once every 100 ms at 9600 baud.
int count = 0;

void setup() {
  Serial.begin(9600);
  Serial.println("Kiungo");
}

void loop() {
  Serial.println(count++);
  delay(100);
}
