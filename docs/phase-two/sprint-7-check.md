# Sprint 7 check: run your own code

What Brad checks before the Sprint 7 gate, in the desktop app on Windows and Linux. About 25 minutes. The first build of each project needs the internet (Sprint 5); everything after works offline.

## 1. Blink (EMU-01, RUN-03)

1. New project, **Blink an LED**, Arduino Uno.
2. Click **Run** in the lab. The button reads **Building…**, **Loading…**, then **Stop**. The LED blinks once a second (500 ms on, 500 ms off).
3. In the editor, change both `delay(500)` to `delay(100)` and click **Run** again (Stop first). The LED blinks five times faster.
4. Stop, then Run again without changing anything. It goes straight to running: the build is cached. Time it from click to **Stop**: under 2 s.

Pass: Run reaches running in 2 s or less with a cached build.

## 2. Servo sweep (OUT-02)

1. New project, **Servo sweep**. Run.
2. The servo horn sweeps 0° to 180° and back, about 2.7 s each way. Its panel shows the angle and the pulse ("1,472 µs every 20.0 ms" at 90°).

## 3. HC-SR04 (EMU-02, PCP-03)

1. New project, **Distance sensor**. Run, and open **Serial** in the lab.
2. The distances printed follow the lab's simulated sweep.
3. Select the HC-SR04, and in the Inspector set the distance to 42 cm. The serial readings settle at 42 cm.
4. Set 500 cm. The sketch prints **Nothing in range**.
5. Open **Signals**: the trigger and echo pins show their pulses.

## 4. The buzzer melody

1. New project, blank, Arduino Uno. Add a buzzer and wire its + to pin 8, − to GND.
2. Paste the melody from the Wokwi example (or the one in `packages/core/test/fixtures/sketches/melody.ino`) and Run with sound on.
3. You hear the notes at their pitches; the buzzer's panel shows the frequency (262 Hz, 330 Hz…).

## 5. When things go wrong (HWT-07)

1. Break the Blink sketch (delete a `;`) and Run. The run stops at the build; **Code problems** shows the problem on its line.
2. Paste `packages/core/test/fixtures/sketches/stack.ino` (it runs out of RAM on purpose) and Run. The board stops and shows **Crashed**: "Stopped: ran out of memory", as a real Uno would hang.

## 6. Real time (RUN-05)

While any sketch runs, the board's panel shows **Speed: Real time**. On the reference PC, note whether it ever shows a percentage: ______

Pass: the EMU-01, EMU-02, HWT-01 and HWT-07 checks pass; Run reaches running in 2 s or less with a cached build.

## Known limits

- Only the Uno runs your code in the lab. Mega and ESP32 projects show the built-in behavior on Run (the button's tooltip says so); Upload runs them on a real board.
- LCDs, OLEDs and radios talk over buses the emulator doesn't model yet, so they show "Not shown yet" while your code runs. `Serial` works.
- Signals samples each pin about 20 times a second, so a 10 µs trigger pulse shows as a short blip rather than to scale.
