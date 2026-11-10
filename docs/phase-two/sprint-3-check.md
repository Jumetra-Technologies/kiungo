# Sprint 3 check: projects, Home and the lab

What Brad checks before the Sprint 3 gate. About 20 minutes on the Windows reference PC, and the same on Linux if you have it.

## Get the build

Either download the installer from the pull request's CI run (**Desktop · Windows**, artifact `kiungo-desktop-Windows`; it isn't signed yet, so Windows asks you to confirm), or run it from the repository:

```bash
npm ci
npm run fetch:arduino-cli -w @kiungo/desktop
npm run desktop
```

## 1. Home is your projects and nothing else (DSK-10)

1. Start Kiungo for the first time. Home says your projects will show up here and offers four starters.
2. Check there's nothing else on the screen: no news, tips or banners.

## 2. Make a project from a starter and wire it (DSK-11, DSK-20)

1. Click **Distance sensor**. In the dialog, name it `Rover radar`, keep **Arduino Uno**, and click **Create project**.
2. The lab opens with the Uno and the HC-SR04 already wired. Check the top bar shows **Saved**.
3. Press `/`, add a **Buzzer**. It wires itself to the Uno.
4. Click **Show in folder** in the project menu (the name at the top left). Open `sketch/sketch.ino`: `TRIG_PIN` and `ECHO_PIN` match the pins the HC-SR04's wires go to on the Uno.

## 3. Kill the app mid-edit and reopen it (DSK-13)

1. Add a **LED**, and straight away end Kiungo from Task Manager (**End task**), not by closing the window.
2. Start Kiungo again. Home shows `Rover radar` with a drawing of the circuit.
3. Open it. The buzzer and the LED are there. Press Ctrl+Z: the last change is undone, so undo survived the restart.

Pass: nothing you did before the kill is lost, and the project opens.

## 4. The rest of Sprint 3

- **Theme:** switch Windows between light and dark mode (Settings > Personalization > Colors). Kiungo follows straight away.
- **Command palette:** press Ctrl+K, type `trace`, press Enter: the canvas switches to Trace. Ctrl+K and a project name opens it.
- **New projects folder:** in the New project dialog, click **Change** and pick another folder. The next project goes there.
- **Open folder:** on Home, **Open folder** and choose the `Rover radar` folder: it opens. Choose any other folder: Kiungo says it isn't a Kiungo project.

## 5. Performance on the reference PC (DSK-21)

```bash
npm run build -w @kiungo/desktop
npm run measure-lab -w @kiungo/desktop -- --view top
npm run measure-lab -w @kiungo/desktop -- --view reality
npm run measure-lab -w @kiungo/desktop -- --view flow
```

Each run opens a 40-part, 200-wire project in its own temporary settings (your projects aren't touched), drags the canvas for a few seconds and prints frames per second. Target: 60 fps, with the 95th-percentile frame at 25 ms or less. The test build has many deliberate faults, and Trace pulses every faulty pin, so Trace is the hardest of the three.

Record the three lines in the pull request.

On the cloud workspace (no graphics card) the numbers were 41 fps in 2D, 35 in 3D and 25 in Trace, against 44 for a 4-part build: that machine's ceiling, not the reference PC's.

## The gate questions

- Is Home minimal enough?
- Is the lab at parity with the website?
