# Architecture

The desktop app is moving here from `jumetra-frontend`, where it is built and released today
(team decision, 9 Nov 2026). It arrives one module per pull request, each passing the quality
gate on its own:

| Step | Module                                                                  |
| ---- | ----------------------------------------------------------------------- |
| 1    | Room for it: the first scaffold's app and packages are removed          |
| 2    | `packages/ui`: design tokens, theme and shared interface pieces         |
| 3    | `packages/core`: parts, the lab model, the board emulator, builds       |
| 4    | `packages/lab`: the Engineering Lab interface                           |
| 5    | `packages/api` and `apps/desktop`: the IPC contract and the app         |
| 6    | The desktop CI jobs, the release workflow and the in-app update feed    |

```
apps/desktop        Electron app
  src/main          main process: projects, builds (Arduino CLI), sync, sign-in, updates, serial, Hybrid
  src/preload       contextBridge API (the only door between renderer and main)
  src/renderer      React UI
  resources/hybrid  the Hybrid runtime compiled into a sketch for a real board
packages/api        the typed IPC contract between main and renderer
packages/core       parts, the lab model, firmware files, the board emulator, builds, projects
packages/lab        the Engineering Lab interface
packages/ui         design tokens, theme and shared React components
firmware/           shim, injector and bridge firmware (C/C++)
```

Security defaults: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, CSP in
`index.html`, mic/camera denied by default (PCP-02).
