# Sprint 9 check: Hybrid runs on a real board

What Brad checks before the Sprint 9 gate, with an Arduino Uno (or a Nano) on USB. About 30 minutes. CI covers the builds and the link on compiled code; this is the part only a real board can show.

You need: an Uno, a USB cable, an LED with a 220 Ω resistor, and optionally a real HC-SR04 for step 4.

## 1. A virtual sensor answering real code (RUN-01, INJ-01 to INJ-04)

1. New project from **Distance sensor**, Arduino Uno. Plug in the Uno and pick it in **Upload to** (in the Code pane).
2. In the lab, select the **Arduino Uno** and set **Mode** to **Physical**. The note under Mode says Run will upload your code with Kiungo's Hybrid layer. Leave the HC-SR04 on **Virtual**.
3. Click **Run**. The button says **Building…**, then **Loading…** while it uploads. The lab log says "Your code is running on the real Arduino Uno on COM…".
4. In Inputs, move the HC-SR04's distance slider. Within a fraction of a second the serial monitor prints the new distance in cm. The board's panel says **Runs on: The real Arduino Uno on …** and its badge **On board**.
5. Stop. The board keeps the Hybrid program until the next upload; **Upload** (Ctrl+U) puts the plain sketch back.

## 2. Real outputs mirrored in the lab (OUT-01, OUT-04)

1. New project from **Blink**. Wire the real LED and resistor to pin 13 and GND (or use the on-board LED).
2. Mark the board **Physical**, Run. The real LED blinks; the LED in the lab blinks with it.
3. Change `delay(1000)` to `delay(200)`, Stop, Run. Both blink faster.

## 3. What Kiungo's layer costs (HWT-02 to HWT-04)

After step 1's Run, open **Code problems**. The memory meters show your program and, striped at the end, Kiungo's share ("1,234 + 2,100 Kiungo / 32,256 B"). The note under them gives the Ship numbers: what the board runs after a plain Upload.

Note the Hybrid layer's size for the Distance sensor: flash ______ B, RAM ______ B.

## 4. Physical sensors stay real (RUN-04)

With a real HC-SR04 wired as the lab shows (TRIG and ECHO on the same pins), set the lab's HC-SR04 to **Physical** and Run again. The readings now come from the real sensor: put your hand in front of it.

## 5. When things go wrong

- Run with the board unplugged: Run stops at once and says to plug it in and pick it in Upload to.
- Unplug the board while it runs: within a few seconds Run stops and says the link closed.
- Mark a DS18B20 or MPU-6050 **Virtual** on a Physical board: Run says Kiungo can't play that part on a real board yet.

## Gate question

Is the Hybrid run good enough to show on the launch page, or does it stay labeled Preview at launch?

## Known limits

- Hybrid runs work on the Uno and the Nano (ATmega328). The Mega and ESP32 run in the lab or by plain upload.
- Virtual parts: HC-SR04 (pulseIn and NewPing), DHT11/DHT22 (the DHT library), PIR, light sensor, soil moisture and gas sensor. I2C and 1-Wire parts (MPU-6050, BMP280, DS18B20) must be Physical.
- The lab mirrors levels and PWM duty. Tones and servo pulses aren't measured on the board yet, so a servo on the desk moves but the lab's servo doesn't.
- The robot World runs only on the emulated board.
- Masden's self-hosted test rig (a real Uno in CI) is infrastructure: it isn't part of this pull request.
