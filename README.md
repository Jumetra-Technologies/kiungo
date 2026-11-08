# Kiungo

Desktop application for hybrid robotics and IoT simulation. See
`docs/ARCHITECTURE.md` and the Desktop Feature Specification (draft 0.1).

## Getting started

```bash
corepack enable
pnpm install
pnpm dev          # launch the Electron app
pnpm typecheck
pnpm lint
```

Requires Node 20.11+ (`.nvmrc`) and pnpm 9.

## Contributing

`main` is protected. Nobody pushes to it directly: open a pull request, get it reviewed,
and let the checks pass. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/BRANCH_PROTECTION.md](docs/BRANCH_PROTECTION.md).
