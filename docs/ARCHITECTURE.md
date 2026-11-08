# Architecture

```
apps/desktop        Electron app
  src/main          main process: sessions, serial, build pipeline, IPC
  src/preload       contextBridge API (the only door between renderer and main)
  src/renderer      React UI, Zustand stores
packages/core       shared types and Zod schemas (board, part, project, binding)
packages/protocol   IPC channels and the framed board protocol (INJ-04)
packages/ui         shared React components
firmware/           shim, injector and bridge firmware (C/C++)
boards/ parts/      JSON definitions (HWT-11, PRJ-04)
templates/          starter projects (PRJ-03)
```

## Where spec groups land

| Spec group    | Location                                               |
| ------------- | ------------------------------------------------------ |
| RUN, SAF      | `apps/desktop/src/main/sessions`, `packages/core`      |
| HWT, boards   | `boards/`, `packages/core/src/board.ts`                |
| INJ, OUT      | `firmware/`, `packages/protocol`, main process         |
| WLD, EMU      | workers (to be added under `apps/desktop/src/workers`) |
| EDT, ERR, FIX | renderer + main (to be added)                          |
| BLD           | `apps/desktop/src/main/build` (to be added)            |
| PRJ           | `packages/core/src/project.ts`                         |

Security defaults: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, CSP in
`index.html`, mic/camera denied by default (PCP-02).
