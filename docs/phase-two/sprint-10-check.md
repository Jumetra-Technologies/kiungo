# Sprint 10 check: Hybrid safety and readiness

What Brad checks before the Sprint 10 gate, with an Uno, an L298N (or the motor driver you have), one DC motor and a battery pack. About 30 minutes. The board-side behavior is tested in CI on compiled code in the emulator (`apps/desktop/test/hybrid-shim.test.ts`, "safety on the board"). This check is the part only real hardware can show.

Wiring: the motor driver's IN1, IN2 and EN to the pins the lab shows. Its motor supply comes from the battery pack (or VIN with the battery on the barrel jack). GNDs are joined.

## 1. Electrical checks before a run (SAF-03)

1. New project from **Obstacle avoider**. Mark the **Arduino Uno** and one **DC motor** as **Physical**.
2. Open **Problems**: nothing is blocking. The motors' VM is on **VIN**, which is the barrel jack's supply.
3. In the lab, move one motor's VM wire from VIN to **5V**. Problems now shows "DC motor runs from the board's 5V" as an error, and the part turns red.
4. Click **Run**. Run refuses and says why ("Fix this before running on the real board…"). Put the wire back on VIN.
5. Move the LED in a Blink project to pin **D1**. With the board marked Physical, Problems says "D1 is Kiungo's link".

## 2. Emergency stop (SAF-01)

1. Obstacle avoider, board and one motor Physical, the motor wired as in the lab. Plug in the Uno and pick it in **Upload to**. Click **Run**.
2. The motor spins. A red **Emergency stop** button appears beside Run.
3. Press it, or press **Esc**. The motor stops at once (well inside half a second). The lab says the outputs are off and stay off.
4. Click **Run** again: the board restarts with the upload and the motor runs again.

## 3. Stop and the link dropping (SAF-01, SAF-02)

1. Run again. Press **Stop**: the motor stops (Kiungo sends STOP before it lets go of the port).
2. Run again. With the motor running, **pull the USB cable**.
   - Board powered from USB only: everything stops at once, because the board has lost power.
   - Board also on the barrel jack (battery): the board keeps running, sees the link go quiet, and turns every output it drives off within half a second. Time it: ______ ms.
   - Run stops in the app and says why.
3. Plug the cable back in and Run again: it starts normally.

## 4. Parts and what to buy (VER-01, VER-03)

1. In the lab, open the **Parts** tab at the bottom.
2. **In a run** lists each part as **Hybrid** (the board, when it plays virtual parts), **Real** (on your desk) or **Virtual** (played by the lab), with one line on what that means.
3. **What you need**:
   - **On the desk** lists the board, the parts marked Physical, jumper wires and the USB cable.
   - **Everything** lists the whole build, with a battery pack when there are motors.
4. **Copy list** gives plain text; **Save CSV** saves a spreadsheet file.

## Gate question

Would we let a 14-year-old run this with a motor on the desk?

## Known limits

- The watchdog runs once Kiungo has said hello. A board that was never connected to Kiungo just runs its sketch.
- Outputs the sketch drives with `digitalWrite` and `analogWrite` are made safe. Anything driven another way isn't covered: `Servo` (it holds its last position), `tone()`, or writing port registers directly.
- A sketch with its own `serialEvent()`, inside a long `delay()`, gets STOP through the watchdog (about 300 ms) rather than at once.
- The current check uses typical figures per part. It catches a motor on 5 V or a pile of servos, not a precise budget.
- The L298N and motor on Masden's CI rig are infrastructure (Juma and Masden). They aren't part of this pull request.
