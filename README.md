# Kiungo

The Kiungo desktop app (Electron, React, TypeScript) and the packages it is built from. Students, technicians, instructors, clubs and schools use it to build, code and run robotics projects: fully simulated, on a real board, or a mix of both (Hybrid).

This repository is the desktop app's home. It moved here from `jumetra-frontend` in November 2026 at desktop 0.13.3; the website stays in `jumetra-frontend`.

## Getting started

Node 22 (`.nvmrc`) and npm.

```bash
npm install
npm run fetch:arduino-cli -w @kiungo/desktop   # once: the pinned Arduino CLI for this computer
npm run dev                                     # the app, with hot reload
```

How the app works, project by project, is in [apps/desktop/README.md](apps/desktop/README.md); the layout is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Checks

```bash
npm run check    # typecheck, lint and every test: what the Quality gate runs
npm run build    # the desktop bundles
```

## Releases

Installers and in-app updates are published from this repository by the **Release the desktop app** workflow ([.github/workflows/release-desktop.yml](.github/workflows/release-desktop.yml)). Bump `apps/desktop/package.json` first; a version is released once.

## Contributing

`main` is protected: open a pull request, get it reviewed, and let the checks pass. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/BRANCH_PROTECTION.md](docs/BRANCH_PROTECTION.md).
