# Architecture

```
apps/desktop            Electron app (@kiungo/desktop)
  src/main              main process: projects, builds (Arduino CLI), sync, sign-in, updates, serial, Hybrid
  src/preload           contextBridge API: the only door between the interface and the main process
  src/renderer          React interface
  resources/hybrid      the Hybrid runtime and adapters compiled into a sketch for a real board
  scripts               the Arduino CLI download, hardware checks and measurements
  test                  the app's tests (some compile with the real Arduino CLI in CI)
packages/api            the typed IPC contract between main and interface (@kiungo/api)
packages/core           parts, the lab model, firmware files, the board emulator, builds, projects (@kiungo/core)
packages/lab            the Engineering Lab interface: canvas, parts panel, Inspector (@kiungo/lab)
packages/ui             design tokens, theme and shared interface pieces (@kiungo/ui)
__tests__               tests of the lab and the shared packages
docs/phase-two          the hardware checks run before each sprint gate
.github/workflows       CI, and the release that publishes installers and the update feed
.github/scripts         the release manifest and the update feed files
```

`@kiungo/core`, `lab` and `ui` are also built into the website (`jumetra-frontend`), which keeps
its own copy for now. Changes made here that the website needs must be carried over there.

## Security defaults

Context isolation on, Node integration off, a sandboxed interface with a strict CSP, IPC only
from the app's own pages, and Electron fuses set in installed copies
(`apps/desktop/electron-builder.yml`). A project's build settings are checked before Arduino CLI
reads them (`packages/core/src/build/profile-check.ts`).
