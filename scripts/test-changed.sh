#!/usr/bin/env bash
set -euo pipefail

# Selective Test Runner for CI/CD
# Analyzes changed files and runs appropriate test suites based on change type
# Exits 0 even when no tests need to run (required for S4 stability)

echo "=== Selective Test Runner ==="
echo "Analyzing changed files..."

# Get base branch (default to main)
BASE_BRANCH="${GITHUB_BASE_REF:-main}"
echo "Base branch: $BASE_BRANCH"

# Get changed files
CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "No files changed - skipping tests"
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES"
echo ""

# Initialize test flags
RUN_COMPONENT=false
RUN_API=false
RUN_E2E=false

# Analyze changes
while IFS= read -r file; do
  case "$file" in
    # Frontend component changes
    app/*|components/*|lib/*)
      RUN_COMPONENT=true
      RUN_E2E=true
      ;;
    # Backend changes
    backend/*)
      RUN_API=true
      RUN_E2E=true
      ;;
    # Test changes
    tests/component/*)
      RUN_COMPONENT=true
      ;;
    tests/api/*)
      RUN_API=true
      ;;
    tests/e2e/*)
      RUN_E2E=true
      ;;
    # Config changes - run everything
    package.json|tsconfig.json|playwright.config.ts|vitest.config.ts)
      RUN_COMPONENT=true
      RUN_API=true
      RUN_E2E=true
      ;;
  esac
done <<< "$CHANGED_FILES"

# Run selected tests
echo "=== Test Selection ==="
echo "Component tests: $RUN_COMPONENT"
echo "API tests: $RUN_API"
echo "E2E tests: $RUN_E2E"
echo ""

if [ "$RUN_COMPONENT" = true ]; then
  echo "Running component tests..."
  npm run test:component -- --reporter=dot || exit 1
fi

if [ "$RUN_API" = true ]; then
  echo "Running API [P0] tests..."
  npm run test:api:p0 || exit 1
fi

if [ "$RUN_E2E" = true ]; then
  echo "Running E2E [P0] tests..."
  npm run test:e2e:p0 || exit 1
fi

if [ "$RUN_COMPONENT" = false ] && [ "$RUN_API" = false ] && [ "$RUN_E2E" = false ]; then
  echo "No tests selected - changes don't affect test suites"
  exit 0
fi

echo "=== All selective tests passed ==="
exit 0
