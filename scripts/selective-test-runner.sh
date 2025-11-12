#!/usr/bin/env bash

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-main}"
DEFAULT_SMOKE_TAG="${SELECTIVE_SMOKE_TAG:-@smoke}"
CRITICAL_CHANGED=false

echo "Fetching base branch $BASE_BRANCH for diff..."
git fetch origin "$BASE_BRANCH" --depth=1 >/dev/null 2>&1 || true
CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No files changed. Skipping selective tests."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  - /'
echo ""

run_smoke_only=false
affected_specs=""

if echo "$CHANGED_FILES" | grep -qE '(package\.json|package-lock\.json|playwright\.config|\.github/workflows)'; then
  echo "Critical configuration files changed; running full suite."
  CRITICAL_CHANGED=true
elif echo "$CHANGED_FILES" | grep -qE '(auth|login|signup|security)'; then
  echo "Auth/Security files changed; running auth + smoke tests."
  npm run test -- --grep "@auth|${DEFAULT_SMOKE_TAG}"
  exit $?
elif echo "$CHANGED_FILES" | grep -qE '(api|service|controller)'; then
  echo "API files changed; running integration + smoke tests."
  npm run test -- --grep "@integration|${DEFAULT_SMOKE_TAG}"
  exit $?
elif echo "$CHANGED_FILES" | grep -qE '\.(tsx|jsx|vue)$'; then
  echo "UI component files changed; running component + smoke tests."
components=$(echo "$CHANGED_FILES" | grep -E '\.(tsx|jsx|vue)$' | xargs -I {} basename {} | sed 's/\.[^.]*$//' || true)
for component in $components; do
  matches=$(find tests -name "*${component}*" -type f 2>/dev/null || true)
  if [ -n "$matches" ]; then
    affected_specs+="$matches"$'\n'
  fi
done
  if [ -n "$affected_specs" ]; then
    mapfile -t SPEC_LIST < <(echo "$affected_specs" | sed '/^$/d')
    echo "Running component-specific tests:"
    printf '  - %s\n' "${SPEC_LIST[@]}"
    npm run test -- "${SPEC_LIST[@]}" --grep "${DEFAULT_SMOKE_TAG}"
  else
    echo "No specific component tests found; running smoke suite."
    npm run test -- --grep "${DEFAULT_SMOKE_TAG}"
  fi
  exit $?
elif echo "$CHANGED_FILES" | grep -qE '\.(md|txt|json|yml|yaml)$'; then
  echo "Only documentation/config files changed; running smoke suite."
  run_smoke_only=true
else
  echo "Other files changed; running smoke suite."
  run_smoke_only=true
fi

if [ "$CRITICAL_CHANGED" = true ]; then
  npm run test
elif [ "$run_smoke_only" = true ]; then
  npm run test -- --grep "${DEFAULT_SMOKE_TAG}"
fi
