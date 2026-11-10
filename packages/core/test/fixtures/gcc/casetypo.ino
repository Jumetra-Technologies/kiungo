void setup() {
  serial.begin(9600);
  Serial.println("hi");
}
void loop() {
  digitalwrite(13, HIGH);
}
