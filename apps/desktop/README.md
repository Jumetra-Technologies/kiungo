# Kiungo 2 desktop app

Electron, React and TypeScript. The interface has no Node access. It talks to the main process only through the channels typed in `@kiungo/api`. It runs cross-origin isolated, so the emulator workers can share pin levels through shared memory.

## Run it

From the repository root:

```bash
npm install
npm run fetch:arduino-cli -w @kiungo/desktop   # once: the pinned Arduino CLI for this computer
npm run desktop                                # development, with hot reload
```

In the app, **Install the Uno and Nano core** downloads the compiler once, into Kiungo's own data folder. It never touches an Arduino IDE install.

## Projects

Home lists your projects; **New project** makes one from blank or a starter, and **Open folder** opens any Kiungo project. A project is a folder:

| File | What |
| --- | --- |
| `kiungo.json` | The project: name, board, starter, dates |
| `circuit.json` | The lab build, in the website's `.kiungo.json` format |
| `sketch/sketch.ino` | The code |
| `sketch/sketch.yaml` | Arduino CLI profile: the board package and libraries, pinned |
| `records/` | Experiment records (later sprints) |
| `.kiungo/history.json` | Undo and redo, so they survive a restart |

New projects go in Documents/Kiungo unless you pick another folder in the New project dialog. Every change is saved within about 50 ms, written to a temporary file and renamed over the old one, so a forced quit never leaves half a file.

The main process keeps the recent list and only opens projects that are on it or chosen in a folder dialog; the interface can't name other folders.

## Signing in

Kiungo signs in through the website: **Sign in with your browser** opens `/desktop/sign-in`, you approve this computer there, and the browser sends the app a one-time code through `kiungo://signin`. The code only works with a secret this copy of the app holds (PKCE). If the link doesn't arrive, the app polls for the approval every 3 seconds. The refresh token is kept encrypted by the operating system's keychain (`src/main/auth/`). The backend side is `jumetra-backend` `docs/desktop-sign-in.md`.

`KIUNGO_API_URL` points the app at another backend, e.g. a local one with the desktop routes:

```bash
KIUNGO_API_URL=http://127.0.0.1:8000 npm run desktop
```

## Building

**Build** (Ctrl+B) runs `arduino-cli compile --profile kiungo` on the project's `sketch/` folder (`src/main/build/service.ts`). The profile in `sketch.yaml` pins the board package and the libraries, so a project builds the same everywhere; Arduino CLI downloads anything missing into Kiungo's own data folder the first time, so the first build needs the internet. Builds go in `<userData>/builds/<hash of the project path>`, never inside the project.

The compiler's output is turned into problems, explanations and fixes by `@kiungo/core/build` (`packages/core/src/build/`), tested against real avr-gcc 7.3 messages in `packages/core/test/fixtures/gcc/`. Libraries are added and removed with `arduino-cli profile lib add|remove`, which also pins what they depend on.

## Running your code

The lab's Run builds the sketch (or reuses the last good build when no file changed: `kiungo-build.json` in the build folder holds the sketch's fingerprint), then runs the HEX in `@kiungo/core/emulator/worker` (`src/renderer/src/project/program.ts`). The worker reports each pin's level, PWM duty, toggle rate and last pulse width about 20 times a second (`emulator/pinstats.ts`); `@kiungo/core/lab/program` turns those into the parts' states and feeds the sensors' readings back as part models (`emulator/peripherals.ts`: HC-SR04, DHT11/22, analog and digital sensors). The test sketches and the script that compiles them like Arduino CLI are in `packages/core/test/fixtures/sketches/`.

## Robots in a world

A board with two DC motors is a robot (`@kiungo/core/world/robot`). When the project has a `world.json`, Run puts it in that world: the emulator worker steps Rapier 2D physics (`world/sim.ts`) after each slice of cycles, turns the motor pins into wheel speeds and the world into the sensors' readings (`world/harness.ts`, which CI also runs headless to check the templates finish their courses). The World pane (`src/renderer/src/world/WorldPane.tsx`) draws it at the screen's rate and lets you drag the obstacles while it runs.

## Hybrid runs on a real board

A board marked Physical or Hybrid in the Inspector runs the code for real (`src/renderer/src/project/program.ts`, `startReal`). `@kiungo/core/hybrid/plan` decides which parts Kiungo plays (those marked Virtual) and how each answers the sketch. The main process (`src/main/hybrid/service.ts`) builds the sketch twice:

- **Ship build:** the sketch alone.
- **Hybrid build:** a copy in the user-data `builds/<project hash>-hybrid` folder. Each source file starts with the marker and `kiungo_shim.h`, then a `#line` so problems keep their line numbers. Its `sketch.yaml` swaps replaced libraries for the adapters in `resources/hybrid` (`- dir:` entries).

After the upload, `src/main/hybrid/link.ts` keeps `arduino-cli monitor` open at 115200 baud and carries COBS frames (`@kiungo/core/hybrid/protocol`) both ways:

- **To the board:** HELLO, PING every 100 ms, and SET with the virtual parts' values (changes only, and all again after the board restarts).
- **From the board:** TEXT (the sketch's Serial) and OUT (what it drove).

The interface's plan is checked in `parsePlan` before it reaches the generated header.

Safety (sprint 10):

- **STOP:** Stop sends STOP before the port closes; the emergency stop sends it twice and stops pinging.
- **Board watchdog:** the runtime's watchdog runs on Timer0's compare-A interrupt. It turns every driven pin off when the link is quiet for 300 ms after a hello.
- **Checks before a run:** `@kiungo/core/hybrid/safety` adds the real-board checks to the lab's problems through `ProgramDriver.faults`, and `blockingFaults` decides what stops Run.
- **Parts tab:** `@kiungo/core/hybrid/readiness` gives the Parts tab its statuses and the bill of materials.

## Import and sync

**Import:** `src/main/account/import.ts` turns a website lab session into a project. The session file or `/auth/me/lab-sessions` gives the circuit, and `boardForSession` picks the board. A website project gives `records/about.md`.

**Sync:** `src/main/sync/service.ts` keeps a project in step with `/auth/me/projects-sync` (jumetra-backend `docs/sync-api.md`).
- `.kiungo/sync.json` holds the last agreed tree.
- `@kiungo/core/project` `mergeTrees` does the three-way merge, and `conflictCopyPath` names the other side of a conflict.
- Pushes go through `If-Match`, and a 409 means pull and go again.
- The account calls use the desktop session's bearer token, in the main process only (`src/main/account/client.ts`).

## Boards, uploads and the serial monitor

Arduino CLI finds boards (`board list --watch`, kept running while the app is open), uploads (`upload --profile kiungo --fqbn … -p …`) and runs the serial monitor (`monitor -p … --config baudrate=…`), all as child processes (`src/main/hardware/`). The interface can only name a port that discovery has found, and only open the driver pages listed in `src/main/hardware/doctor.ts`. Board limits and pins are in `@kiungo/core/hardware/boards`; upload failures are matched to recovery steps in `@kiungo/core/hardware/upload`.

## Keyboard

| Keys | What |
| --- | --- |
| Ctrl+K (⌘K) | Search and commands |
| Ctrl+N (⌘N) | New project |
| Ctrl+O (⌘O) | Open a project folder |
| Ctrl+Shift+H (⇧⌘H) | Home |
| Ctrl+E (⌘E) | Show or hide the code |
| Ctrl+B (⌘B) | Build |
| Ctrl+U (⌘U) | Upload |
| Ctrl+F (⌘F) | Find, in the code |
| Ctrl+Enter (⌘↵) | Run or stop, in the lab |
| / | Search parts, in the lab |
| 1, 2, 3 | 3D, 2D, Trace |

## Build installers

```bash
npm run dist -w @kiungo/desktop
```

Before a release build, CI runs `npm run fetch:arduino-cli -w @kiungo/desktop -- --all`. Signing comes later (DSK-80).

## Updates

Kiungo updates itself on Windows and from the Linux AppImage (`src/main/updater/service.ts`, with electron-updater). It checks 15 seconds after starting and every four hours, downloads a new version in the background, and a card in the bottom-left corner follows it (`src/renderer/src/update/`): the download's progress, then **Kiungo 0.12.1 is ready**, which is itself the button: one click saves every project, stops the board link, installs, and reopens Kiungo on the new version (it's refused while a Hybrid run or an upload is going, and the card says so). **Later** puts the card away; the update installs anyway when Kiungo quits. The restart is unavoidable: an update replaces the app's own files, which a reload of the window can't do.

- **The feed:** `<channel>.yml` files on the `desktop-feed` GitHub release, written by `.github/scripts/desktop-update-feed.mjs` in the release workflow. They name the installers on the versioned release (`desktop-v<version>`), whose blockmaps let Windows download only what changed.
- **Channels:** the workflow writes `kiungo.updateChannel` (beta or stable) into the packaged `package.json`. Beta copies read `beta.yml` (Windows) or `beta-linux.yml`, which stable releases update too; stable copies read `latest.yml` or `latest-linux.yml`.
- **Can't update itself:** development copies, macOS (until signing), and the .deb and .rpm packages. Those show where to download a new version instead.
- `KIUNGO_UPDATE_URL` points the app at another feed; `KIUNGO_UPDATES=off` turns updates off.
- **Trying it without a release:** a development copy with `KIUNGO_UPDATE_URL` set checks that feed (electron-updater's dev switch is turned on for it, with `dev-app-update.yml` as its settings; start the app from this folder, `electron .`, so its version is the real one). Serve a folder with `beta-linux.yml` (or `beta.yml` on Windows) naming a newer version, its file, its `sha512` (base64) and `size`; on Linux also set `APPIMAGE` to any existing file, since the AppImage updater diffs against the running copy before falling back to a full download. The card goes through downloading and ready; don't press it on a development copy, since there's no installed app to replace.

The app icon is `build/icon.svg` (Windows and Linux) and `build/icon-mac.svg` (macOS, on Apple's icon grid): `node apps/desktop/build/rasterize.mjs` draws the PNGs electron-builder packages, and the window uses the same file on Linux and in development.

## Where things are

| Path | What |
| --- | --- |
| `src/main/index.ts` | Window, the `kiungo-app://` protocol (isolation headers and content policy), IPC handlers |
| `src/main/projects/` | Projects on disk: making, opening, the recent list, crash-safe autosave, sketch files |
| `src/main/auth/` | Signing in through the website, the keychain-encrypted session |
| `src/main/updater/` | Kiungo's own updates: when to check, the state the interface shows, when a restart must wait |
| `src/main/build/` | Building a project with its profile, its libraries, and uploading |
| `src/main/hardware/` | Finding boards on USB, the serial monitor, and why a board might not show up |
| `src/main/toolchain/arduino-cli.ts` | Finding and running Arduino CLI with JSON output |
| `src/preload/index.ts` | The only bridge: `window.kiungo.invoke(channel, ...args)` |
| `src/renderer/` | The interface: the sign-in screen, Home, the project screen (the shared lab from `@kiungo/lab` and the code editor), the command palette |
| `resources/sketches/` | Example sketches shipped with the app |
| `scripts/fetch-arduino-cli.mjs` | Pinned Arduino CLI download, checked against Arduino's published checksums |
| `scripts/measure-lab.mjs` | DSK-21: frames per second while panning a 40-part, 200-wire build |

## Environment overrides (development and CI)

- `KIUNGO_ARDUINO_CLI`: path to an `arduino-cli` binary.
- `KIUNGO_ARDUINO_CONFIG`: path to an Arduino CLI config file. Otherwise the app writes its own under the user data folder.
