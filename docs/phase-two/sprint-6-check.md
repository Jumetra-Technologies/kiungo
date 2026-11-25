# Sprint 6 check: real boards

What Brad checks before the Sprint 6 gate, with the Uno, a CH340 Nano clone and an ESP32, on Windows and on Linux. About 40 minutes. Start the app with `npm run desktop` from this branch, or install the 0.6.0 build from CI.

Do step 1 online. The first build for each board downloads its board package; the ESP32's is large, so that one can take several minutes.

## 1. The Uno: from unboxed to Blink (HW-01, BLD-06)

1. Make a new project from **Blink an LED** for the Arduino Uno.
2. Plug in the Uno. Within a couple of seconds **Upload to** shows **Arduino Uno · COM3** (or `/dev/ttyACM0` on Linux).
3. Click **Upload** (or Ctrl+U). The panel shows **Building for the Arduino Uno…**, then **Uploading…**, then **Uploaded … It's running now.**
4. The Uno's LED blinks once a second.

Pass: no help needed between plugging in and the LED blinking.

## 2. The CH340 Nano clone, and its recovery (BLD-06)

1. Plug in the Nano clone (Blink project from step 1, which is a Uno project: a Nano has the same chip).
2. **Upload to** shows **USB serial board (CH340)**, and suggests **Arduino Nano (old bootloader)**. Open the menu: the board has a list of choices, with **Likely** next to the suggestion.
3. Choose **Arduino Nano** (the new bootloader) on purpose and upload. It should fail with **The board didn't answer: it may have the Nano's old bootloader**, and a button **Upload as Arduino Nano (old bootloader)**.
4. Click the button. It uploads and the Nano's LED blinks.

Pass: the recovery gets there in one click. If your clone has the new bootloader, step 3 works first time: note that here.

## 3. The ESP32

1. Make a new project for the **ESP32 Dev Module** from **Blink an LED**. **Distance sensor** is greyed out with the reason (5 V echo).
2. Plug in the ESP32. **Upload to** shows **USB serial board (CP2102)** or **(CH9102)**, suggesting **ESP32 Dev Module**.
3. Upload. If it fails with **The ESP32 didn't start listening for the upload**, follow the steps (hold BOOT when **Uploading** appears).
4. The LED on GPIO2 blinks.

## 4. Serial monitor and plotter (HW-02)

1. On the Uno, make a project from **Distance sensor** (or **Night light**, which prints the light level) and upload it.
2. Open **Serial monitor**, leave **9600 baud**, click **Connect**. Readings scroll by.
3. Click **Plot**. The readings draw as a line, named after the label in the sketch.
4. Upload again with the monitor connected: it disconnects for the upload and says **The serial monitor reconnected** after.
5. Unplug the board while connected: the monitor says **The board was unplugged.**

## 5. My board isn't listed (FIX-09)

On a clean Windows PC (no drivers installed by hand):

1. Unplug every board, open **Upload to** > **My board isn't listed…**. It shows the CH340 and CP210x driver steps with links to the chip makers' sites, and the cable check.
2. Plug in the CH340 Nano. If Windows doesn't install a driver by itself within a minute, follow the link, install, and plug it back in. It appears in **Upload to**.

On Ubuntu:

1. If brltty is installed (it is by default on 22.04 and later), plug in the CH340 Nano. **My board isn't listed…** should say **brltty took its port** with the command to remove it.
2. With a user not in the dialout group, plug in the Uno: the help says **You're not allowed to use /dev/ttyACM0 yet** with the dialout command.

Pass: the FIX-09 check passes on a clean Windows PC; each board uploads Blink.

## Known limits

- Installers from CI are unsigned. Signing and the update channels are Juma's (DSK-80).
- ESP32-S2, S3 and C3 boards aren't supported yet: an upload to one says which chip it found.
- Kiungo can't see a missing driver on Windows or macOS, only that no board appeared, so the steps cover the likely causes in order.
