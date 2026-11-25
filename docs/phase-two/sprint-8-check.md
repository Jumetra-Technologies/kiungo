# Sprint 8 check: robots in a world

What Brad checks before the Sprint 8 gate, in the desktop app. About 20 minutes.

## 1. The obstacle avoider

1. New project from **Obstacle avoider**, Arduino Uno. The right-hand side opens on **World**: an arena with six boxes, the robot on the left and a **Finish** circle on the right.
2. Click **Run**. The robot drives forward; when the dashed line from its sensor meets a box closer than 25 cm, it spins right until clear.
3. While it runs, drag a box into its path. It sees the box and turns.
4. It reaches **Finish** (the stats say **Finished**).
5. Open **Code**, change `CLEAR_CM = 25` to `CLEAR_CM = 50`, then Stop and Run. It turns away earlier.

## 2. The line follower

1. New project from **Line follower**. The World shows a black oval with four checkpoints.
2. Run. The robot follows the line round; the two dots on its nose turn amber when they see the tape.
3. The stats reach **Finished** after one lap (about 15 to 20 s), with **0 bumps**.

## 3. Performance (the done check)

On the reference PC, with the obstacle avoider running (six boxes; add four more with **Box** to make ten):

- The board's panel in the lab says **Speed: Real time** (100 % or more).
- The World moves smoothly. To measure frames per second, open DevTools (Ctrl+Shift+I) > Rendering > Frame rendering stats, and note the frames per second: ______

Pass: both templates finish their course in CI (they do: `packages/core/test/world.test.ts`), and one robot with 10 obstacles runs at 100 % of real time or more at 60 fps on the reference PC.

## Gate question

Keep the robot world for launch, or move it to the first update if the schedule has slipped?

## Known limits

- One robot per project, on the Uno. Boxes only (no round obstacles yet).
- The robot's wheels hold their speed (geared motors) rather than modeling torque and slip.
