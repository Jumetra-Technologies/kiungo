# Sprint 5 check: build, libraries and error explanations

What Brad checks before the Sprint 5 gate, on the reference PC (Windows) and on Linux. About 20 minutes. Start the app with `npm run desktop` from `main`, or install the 0.5.0 build from CI.

The first build downloads the AVR board package and libraries into Kiungo's own folder, so do step 1 online. Everything after step 1 also works offline, except adding a library.

## 1. Blink builds in 5 seconds (BLD-01, BLD-05)

1. Make a new project from the **Blink an LED** starter. The code opens on the right.
2. Click **Build** (or Ctrl+B). The first build downloads the board package, which can take a minute. The panel says so after a few seconds.
3. Click **Build** again. Time it from click to **Built in … s**.

Pass: the second build is 5 seconds or less on the reference PC (the panel shows the time). Note the time here: ______

## 2. Memory meters (BLD-02)

After the build, the panel shows **Program (flash)** and **Variables (RAM)** with bytes used, the board's limit and a percentage. On the Uno the limits are 32,256 and 2,048 bytes.

Pass: the numbers match what the Arduino IDE reports for the same sketch, if you have it installed.

## 3. Problems on their line, explained (ERR-01, ERR-02)

Make each mistake in `sketch.ino`, build, and check the problem's title in **Code problems** and the red underline in the code. Undo (Ctrl+Z) after each one.

| Mistake | Expected title |
| --- | --- |
| Delete the `;` after `pinMode(LED_PIN, OUTPUT)` | A semicolon is missing |
| Change `LED_PIN` to `ledPin` in `pinMode` | ledPin isn't defined |
| Change `digitalWrite` to `digitalwrite` | digitalwrite should be digitalWrite |
| Delete the `}` that closes `setup()` | The function above isn't closed |
| Change `pinMode(LED_PIN, OUTPUT)` to `pinMode(LED_PIN)` | pinMode needs more values |
| Add `Serial.println("hello);` in `setup()` | Some text is missing its closing " |
| Copy `void setup() { }` to the end | setup is written twice |

Pass: each title shows, the arrow next to it opens a plain explanation and the compiler's own words, and clicking the title goes to the line.

## 4. Quick fixes with a preview (FIX-01)

1. Delete the `;` after `pinMode(LED_PIN, OUTPUT)` and build.
2. Click **Fix**. The preview shows the line before (red) and after (green).
3. Click **Make this change**. The `;` is back, the problem says **changed since the build**, and Ctrl+Z takes the fix back out in one step.
4. Build again: no problems.
5. Repeat with `digitalwrite` and with the deleted `}`.

Pass: each fix is right, and one undo step undoes it.

## 5. A missing library in one click (FIX-02)

1. Add `#include <Servo.h>` at the top of a Blink sketch and build.
2. The problem reads **The library for Servo.h isn't in this sketch**, with **Add Servo**.
3. Click it (online). The sketch builds again, and this time it works.
4. Open `sketch/sketch.yaml` in a text editor: Servo is listed with a version.

## 6. Libraries (BLD-04)

1. Open the **Libraries** tab. Servo is listed.
2. Search **lcd**. Results show libraries that work on AVR boards. Add **LiquidCrystal I2C**.
3. Search **DHT** and add **DHT sensor library**. **Adafruit Unified Sensor** appears too, marked "needed by another library".
4. Remove LiquidCrystal I2C with the bin button.

Pass: `sketch.yaml` matches the list each time.

## 7. Offline

1. Turn the network off. Build a project that has built before: it works.
2. Try to add a library: the message says Kiungo needs the internet.

## Known limits

- **Run** still runs each board's built-in behavior. Running your own built program in the lab arrives in Sprint 7, and uploading to a real board in Sprint 6.
- Fixes are offered only where Kiungo is sure: a name GCC suggests is only used when it differs in capital letters, or by one or two letters in a longer name.
- The temperature and humidity starter made with 0.3.0 or 0.4.0 needs **Add Adafruit Unified Sensor** once (see the CHANGELOG).
