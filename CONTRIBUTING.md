# Contributing

## Rules of the road

1. Never push to `main`. It is protected; GitHub will reject the push.
2. Branch from `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
3. Keep PRs small and tied to spec feature IDs (for example `RUN-03`, `INJ-01`).
4. Open a pull request and fill in the template.
5. CI (`Lint, typecheck, test`) must pass.
6. At least one reviewer who is not the author must approve; Code Owners must approve changes
   to their areas (see `.github/CODEOWNERS`).
7. Resolve every review comment. PRs are squash-merged.

## Local checks before opening a PR

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm validate:boards
```

## Commit style

Short imperative subject, spec ID where relevant: `Add run state machine (RUN-03)`.

## Extra care areas

Changes under `firmware/` or anything that drives real outputs (SAF-xx, OUT-xx) need a
reviewer from the firmware team, and the PR must state how safe state was verified.

Branch protection details: [docs/BRANCH_PROTECTION.md](docs/BRANCH_PROTECTION.md).
