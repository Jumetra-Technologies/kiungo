// Runs out of RAM on purpose: each call keeps 64 bytes on the stack, forever.
volatile int depth = 0;
int dive(int n) {
  volatile char buffer[64];
  buffer[0] = n;
  depth++;
  return dive(n + 1) + buffer[0];
}
void setup() {
  Serial.begin(9600);
  Serial.println("start");
}
void loop() {
  Serial.println(dive(0));
}
