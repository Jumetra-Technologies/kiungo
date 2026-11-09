# Protecting `main`

Goal: nobody merges to `main` without a pull request that another person has reviewed and
that passes CI. Repository settings live on GitHub, not in git, so the steps below must be
applied once by a repository admin.

## What the rules enforce

| Rule                          | Effect                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| Pull request required         | No direct pushes to `main`, including by admins                    |
| 1 approving review            | Someone other than the author must approve                         |
| Code Owner review             | Owners in `.github/CODEOWNERS` must approve changes to their paths |
| Approval of the latest push   | Author cannot sneak in a change after approval                     |
| Stale approvals dismissed     | New commits require a fresh review                                 |
| Conversations resolved        | All review threads closed before merge                             |
| Required check "Quality gate" | CI must pass, on an up-to-date branch                              |
| Linear history, squash only   | Clean history, one commit per PR                                   |
| No force push, no deletion    | `main` cannot be rewritten or removed                              |

## Option A: one command (recommended)

1. Create the repository on GitHub and push this scaffold to it.
2. Edit `.github/CODEOWNERS` and replace `@YOUR-ORG/maintainers` and
   `@YOUR-ORG/firmware-reviewers` with real teams or usernames.
3. Install the GitHub CLI and run `gh auth login` as a repository admin.
4. From the repo root:

```bash
./scripts/setup-branch-protection.sh YOUR-ORG/kiungo
```

The script reads `.github/rulesets/main-protection.json` and creates (or updates) the ruleset.

## Option B: through the GitHub website

1. Repository **Settings > Rules > Rulesets > New ruleset > New branch ruleset**.
2. Name it `Protect main`, set **Enforcement status** to **Active**.
3. **Target branches > Add target > Include default branch**.
4. Tick: **Restrict deletions**, **Block force pushes**, **Require linear history**.
5. Tick **Require a pull request before merging** and set:
   - Required approvals: **1**
   - Dismiss stale pull request approvals when new commits are pushed
   - Require review from Code Owners
   - Require approval of the most recent reviewable push
   - Require conversation resolution before merging
   - Allowed merge methods: **Squash** only
6. Tick **Require status checks to pass**, enable **Require branches to be up to date**, and
   add the check **Quality gate** (it appears after CI has run once on a PR).
7. Leave **Bypass list** empty so the rules apply to admins too. Save.

## Who can merge

GitHub does not let you name "the people allowed to press Merge" in a ruleset the way old
branch protection did. Instead, control it with:

- **Collaborator roles.** Give regular contributors **Write** access. They can open PRs and
  push feature branches, but cannot merge until the rules above are satisfied.
- **Code Owners.** Only people or teams in `CODEOWNERS` can provide the required approval, so
  they are effectively your gatekeepers. Add reviewers there.
- **Bypass list.** Keep it empty. If you ever need an emergency override, add a single
  trusted team and remove it afterwards.

Teams on a paid plan can also restrict who may push to matching branches in classic branch
protection ("Restrict who can push to matching branches"). The ruleset above already blocks
all direct pushes, which is stricter.

## Day-to-day workflow

```bash
git switch -c feat/run-state-machine
# ...work, commit...
git push -u origin feat/run-state-machine
gh pr create --fill       # opens the PR using the template
```

A reviewer approves, CI goes green, then the PR is squash-merged. Direct `git push origin main`
is rejected by GitHub.

## Verifying it works

Try `git push origin main` from a clone: it should fail with "Changes must be made through a
pull request". Open a PR as the only collaborator: the Merge button stays blocked until a
second person approves.

## Solo developer note

With one person on the repo, "1 approval from someone else" blocks you from merging your own
work. Either add a second reviewer, or temporarily set required approvals to 0 and keep the
PR and CI requirements.
