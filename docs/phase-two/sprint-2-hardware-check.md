# Sprint 2 hardware check: the shim on a real Uno

Brad runs this at the Sprint 2 review. It shows whether a virtual sensor can answer the user's own, unmodified sketch on a real board (issues #57 to #61).

## Kit

- Arduino Uno (an original, or a clone with a CH340 USB chip)
- HC-SR04 ultrasonic sensor
- 4 jumper wires, a USB cable, a flat object to measure against (a book)

## Wiring

| HC-SR04 | Uno |
| --- | --- |
| VCC | 5V |
| Trig | D9 |
| Echo | D10 |
| GND | GND |

## The sketch

This is the sketch a student writes. The test never changes it.

```cpp
#include <NewPing.h>

NewPing sonar(9, 10, 400);   // trigger, echo, max distance in cm

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(sonar.ping_cm());
  delay(50);
}
```

## Running it

```
npm run fetch:arduino-cli -w @kiungo/desktop        # once
arduino-cli lib install NewPing                       # once, for the Physical build
npm run hardware-check -w @kiungo/desktop -- --port COM5
```

The script (`apps/desktop/scripts/hardware-check.mjs`) builds both sketches, uploads them, pushes the distances, times the delay 20 times, and writes the record below to `docs/phase-two/sprint-2-hardware-results.md`. It stops and asks when a hand is needed (the book, the cable). What it found on the emulator side first is in `sprint-2-spike-results.md`.

## Steps

1. **Real sensor (baseline).** Build with the Physical binding and upload. Hold the book at 20 cm, then 50 cm. Record what the Serial monitor prints.
2. **Virtual sensor (Hybrid build).** Switch the HC-SR04 to Virtual and upload. Leave the sensor wired: the shim must ignore it. Set 30 cm from the PC, then 120 cm. Record the printed values.
3. **Delay.** Change the value from 30 to 120 cm and record how long the print takes to follow. The check runs the change 20 times and reports the median and the worst. The target is 100 ms or less.
4. **Timing of the sketch.** Compare how often a value prints in steps 1 and 2. The shim must not slow `loop()` down.
5. **Memory.** Record flash and RAM for the plain build, the Hybrid build and the Ship build, as Kiungo shows them.
6. **Unplug.** Pull the USB cable while the Hybrid build runs, then plug it back in. The board must restart cleanly.

## Record

| Step | Expected | Seen | Pass |
| --- | --- | --- | --- |
| 1 Real 20 cm, 50 cm | about 20, about 50 | | |
| 2 Virtual 30 cm, 120 cm | 30, 120 | | |
| 3 Delay, median and worst | 100 ms or less | | |
| 4 Prints per second, real vs Hybrid | within 5 % | | |
| 5 Flash and RAM: plain, Hybrid, Ship | Ship equals plain | | |
| 6 Unplug and replug | clean restart | | |

Sprint 2 ends in go or no-go. The decision is taken from this table and from the toolchain tests in issue #57.
