#!/usr/bin/env bash
# Applies the "Protect main" ruleset to a GitHub repository using the GitHub CLI.
# Usage: ./scripts/setup-branch-protection.sh OWNER/REPO
# You must be a repository admin and logged in with `gh auth login`.
set -euo pipefail

REPO="${1:?Usage: $0 OWNER/REPO}"
RULESET=".github/rulesets/main-protection.json"

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
[ -f "$RULESET" ] || { echo "Run this from the repository root."; exit 1; }

# If a ruleset with the same name exists, update it; otherwise create it.
EXISTING_ID=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="Protect main") | .id' || true)

if [ -n "$EXISTING_ID" ]; then
  echo "Updating existing ruleset $EXISTING_ID on $REPO"
  gh api --method PUT "repos/$REPO/rulesets/$EXISTING_ID" --input "$RULESET" >/dev/null
else
  echo "Creating ruleset on $REPO"
  gh api --method POST "repos/$REPO/rulesets" --input "$RULESET" >/dev/null
fi

echo "Done. Direct pushes to the default branch are now blocked; changes need a reviewed PR."
