// A short melody on a passive buzzer, with tone().
const int BUZZER_PIN = 8;
const int notes[] = {262, 330, 392, 523};
void setup() {}
void loop() {
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, notes[i], 200);
    delay(250);
  }
  noTone(BUZZER_PIN);
  delay(500);
}
