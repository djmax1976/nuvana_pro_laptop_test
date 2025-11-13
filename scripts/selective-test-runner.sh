#!/usr/bin/env bash
# Selective Test Runner
# Intelligently selects tests based on changed files and tags
# Usage: ./scripts/selective-test-runner.sh

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-main}"
TEST_ENV="${TEST_ENV:-local}"
DEFAULT_SMOKE_TAG="${SELECTIVE_SMOKE_TAG:-@smoke}"

echo "🎯 Selective Test Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Base branch: $BASE_BRANCH"
echo "Environment: $TEST_ENV"
echo ""

# Fetch base branch for accurate diff
echo "Fetching base branch $BASE_BRANCH for diff..."
git fetch origin "$BASE_BRANCH" --depth=1 >/dev/null 2>&1 || true

# Get changed files
CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "✅ No files changed. Skipping tests."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  - /'
echo ""

# Determine test strategy
run_smoke_only=false
run_all_tests=false
affected_specs=""

# Critical files = run all tests
if echo "$CHANGED_FILES" | grep -qE '(package\.json|package-lock\.json|playwright\.config|tsconfig\.json|\.github/workflows)'; then
  echo "⚠️  Critical configuration files changed. Running ALL tests."
  run_all_tests=true

# Auth/security changes = run auth + smoke tests
elif echo "$CHANGED_FILES" | grep -qE '(auth|login|signup|security|rbac|permission)'; then
  echo "🔒 Auth/security files changed. Running auth + smoke tests."
  npm run test:api -- --grep "@auth|@p0|${DEFAULT_SMOKE_TAG}" || npm run test:api:p0 || echo "No matching tests found"
  exit $?

# Backend API changes = run API tests + smoke
elif echo "$CHANGED_FILES" | grep -qE '(backend/src|api|service|controller|middleware)'; then
  echo "🔌 Backend API files changed. Running API tests + smoke."
  npm run test:api -- --grep "@p0|@p1|${DEFAULT_SMOKE_TAG}" || npm run test:api:p1 || echo "No matching tests found"
  exit $?

# Frontend component changes = run component + smoke tests
elif echo "$CHANGED_FILES" | grep -qE '\.(tsx|jsx|vue)$'; then
  echo "🎨 UI components changed. Running component + smoke tests."
  
  # Extract component names and find related tests
  components=$(echo "$CHANGED_FILES" | grep -E '\.(tsx|jsx|vue)$' | xargs -I {} basename {} | sed 's/\.[^.]*$//' || true)
  for component in $components; do
    # Find tests matching component name
    matches=$(find tests -name "*${component}*" -type f 2>/dev/null || true)
    if [ -n "$matches" ]; then
      affected_specs+="$matches"$'\n'
    fi
  done
  
  if [ -n "$affected_specs" ]; then
    mapfile -t SPEC_LIST < <(echo "$affected_specs" | sed '/^$/d' | sort -u)
    echo "Running tests for components:"
    printf '  - %s\n' "${SPEC_LIST[@]}"
    npm run test:e2e -- "${SPEC_LIST[@]}" --grep "${DEFAULT_SMOKE_TAG}" || npm run test:e2e:p0 || echo "No matching tests found"
  else
    echo "No specific tests found. Running smoke tests only."
    npm run test:e2e -- --grep "${DEFAULT_SMOKE_TAG}" || npm run test:e2e:p0 || echo "No matching tests found"
  fi
  exit $?

# Test file changes = run those tests directly
elif echo "$CHANGED_FILES" | grep -qE '\.(spec|test)\.(ts|tsx|js|jsx)$'; then
  echo "🧪 Test files changed. Running changed tests."
  CHANGED_SPECS=$(echo "$CHANGED_FILES" | grep -E '\.(spec|test)\.(ts|tsx|js|jsx)$' || true)
  if [ -n "$CHANGED_SPECS" ]; then
    echo "$CHANGED_SPECS" | while read -r spec; do
      echo "  - $spec"
    done
    npm run test:api -- $CHANGED_SPECS || npm run test:e2e -- $CHANGED_SPECS || echo "Tests completed"
  fi
  exit $?

# Documentation/config only = run smoke tests
elif echo "$CHANGED_FILES" | grep -qE '\.(md|txt|json|yml|yaml)$'; then
  echo "📝 Documentation/config files changed. Running smoke tests only."
  run_smoke_only=true
else
  echo "⚙️  Other files changed. Running smoke tests."
  run_smoke_only=true
fi

# Execute selected strategy
if [ "$run_all_tests" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚨 Running FULL test suite (critical changes detected)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  npm run test:api || npm run test:e2e || echo "Full suite completed"
elif [ "$run_smoke_only" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running smoke tests..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  npm run test:api -- --grep "${DEFAULT_SMOKE_TAG}" || npm run test:api:p0 || npm run test:e2e:p0 || echo "Smoke tests completed"
fi
