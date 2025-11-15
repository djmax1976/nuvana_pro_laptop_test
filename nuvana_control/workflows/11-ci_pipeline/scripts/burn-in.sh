#!/usr/bin/env bash
set -euo pipefail

# Burn-In Test Runner for CI/CD
# Runs changed test specs multiple times to detect flakiness
# Exits 0 when no test files changed (required for S4 stability)

echo "=== Burn-In Test Runner ==="

# Get iterations from env or default to 5
ITERATIONS="${BURN_IN_ITERATIONS:-5}"
echo "Burn-in iterations: $ITERATIONS"

# Find changed test files based on event type
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # Pull request: compare against base branch
  BASE_BRANCH="$GITHUB_BASE_REF"
  echo "PR mode - Base branch: $BASE_BRANCH"
  CHANGED_TESTS=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD | grep -E '\.(spec|test)\.(ts|tsx|js|jsx)$' || echo "")
else
  # Push event: compare against previous commit
  echo "Push mode - Comparing HEAD~1...HEAD"
  CHANGED_TESTS=$(git diff --name-only HEAD~1 HEAD | grep -E '\.(spec|test)\.(ts|tsx|js|jsx)$' || echo "")
fi

if [ -z "$CHANGED_TESTS" ]; then
  echo "No test files changed - skipping burn-in"
  exit 0
fi

echo "Changed test files:"
echo "$CHANGED_TESTS"
echo ""

# Run each changed test file multiple times
FAILED_TESTS=()

while IFS= read -r test_file; do
  if [ -z "$test_file" ]; then
    continue
  fi

  echo "=== Burn-in: $test_file ($ITERATIONS iterations) ==="

  for i in $(seq 1 "$ITERATIONS"); do
    echo "  Iteration $i/$ITERATIONS..."

    # Determine test runner based on file path
    if [[ "$test_file" == tests/component/* ]]; then
      # Vitest for component tests
      if ! npm run test:component -- "$test_file" --reporter=dot --run; then
        echo "❌ FLAKY TEST DETECTED: $test_file failed on iteration $i"
        FAILED_TESTS+=("$test_file")
        break
      fi
    elif [[ "$test_file" == tests/api/* ]] || [[ "$test_file" == tests/e2e/* ]]; then
      # Playwright for API/E2E tests
      PROJECT="api"
      if [[ "$test_file" == tests/e2e/* ]]; then
        PROJECT="e2e"
      fi

      if ! npx playwright test --project="$PROJECT" "$test_file" --reporter=dot; then
        echo "❌ FLAKY TEST DETECTED: $test_file failed on iteration $i"
        FAILED_TESTS+=("$test_file")
        break
      fi
    fi
  done

  if [[ ! " ${FAILED_TESTS[*]} " =~ " ${test_file} " ]]; then
    echo "  ✓ Stable: $test_file passed all $ITERATIONS iterations"
  fi
  echo ""
done <<< "$CHANGED_TESTS"

# Report results
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
  echo "=== Burn-In FAILED ==="
  echo "Flaky tests detected:"
  printf '  - %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi

echo "=== Burn-In PASSED ==="
echo "All changed tests are stable ($ITERATIONS iterations each)"
exit 0
