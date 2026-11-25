# Contributing

## Rules of the road

1. Never push to `main`. It is protected; GitHub will reject the push.
2. Branch from `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
3. Keep PRs small and tied to spec feature IDs (for example `DSK-80`, `EMU-04`).
4. Open a pull request and fill in the template.
5. CI must pass: the **Quality gate** and the desktop builds on Windows, Ubuntu and macOS.
6. At least one reviewer who is not the author must approve; Code Owners must approve changes
   to their areas (see `.github/CODEOWNERS`).
7. Resolve every review comment. PRs are squash-merged.

## Local checks before opening a PR

```bash
npm run check
```

A change to the app bumps `apps/desktop/package.json` (patch for fixes, minor for features) so
it can be released.

## Commit style

Short imperative subject, spec ID where relevant: `Refuse unknown board packages (DSK-81)`.

## Extra care areas

Changes to the Hybrid runtime (`apps/desktop/resources/hybrid/`) or anything that drives real
outputs need a reviewer who has run it on a board, and the PR must state how safe state was
verified. Changes to the main process or preload (`apps/desktop/src/main`, `src/preload`) are
the app's security boundary: say what they let the interface do.

Branch protection details: [docs/BRANCH_PROTECTION.md](docs/BRANCH_PROTECTION.md).
