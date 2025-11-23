#!/usr/bin/env bash
set -euo pipefail

# Selective Test Runner for CI/CD
# Analyzes changed files and runs appropriate test suites based on change type
# Exits 0 even when no tests need to run (required for S4 stability)

SELECT_ONLY=false
if [[ "${1:-}" == "--select-only" ]]; then
  SELECT_ONLY=true
fi

echo "=== Selective Test Runner ==="
echo "Analyzing changed files..."

# Get changed files based on event type
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # Pull request: compare against base branch
  BASE_BRANCH="$GITHUB_BASE_REF"
  echo "PR mode - Base branch: $BASE_BRANCH"
  CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD || echo "")
else
  # Push event: compare against full pushed range when available
  BEFORE_SHA=""
  AFTER_SHA=""
  if command -v jq >/dev/null 2>&1 && [ -n "${GITHUB_EVENT_PATH:-}" ]; then
    BEFORE_SHA=$(jq -r '.before // ""' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
    AFTER_SHA=$(jq -r '.after // ""' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
  fi
  if [ -n "$BEFORE_SHA" ] && [ "$BEFORE_SHA" != "0000000000000000000000000000000000000000" ]; then
    echo "Push mode - Comparing $BEFORE_SHA...$AFTER_SHA"
    CHANGED_FILES=$(git diff --name-only "$BEFORE_SHA" "$AFTER_SHA" || echo "")
  else
    # Fallback for unexpected payloads
    echo "Push mode - Fallback HEAD~1...HEAD"
    CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD || echo "")
  fi
fi

if [ -z "$CHANGED_FILES" ]; then
  echo "No files changed - skipping tests"
  if [ "$SELECT_ONLY" = true ]; then
    {
      echo "component=false"
      echo "api=false"
      echo "e2e=false"
    } >> "${GITHUB_OUTPUT:-/dev/null}"
  fi
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
    # Test support/infrastructure changes - run ALL tests
    tests/support/*)
      RUN_COMPONENT=true
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
    # CI/CD and workflow changes - run ALL tests
    .github/*|nuvana_control/workflows/11-ci_pipeline/*)
      RUN_COMPONENT=true
      RUN_API=true
      RUN_E2E=true
      ;;
    # Styles and public assets - run component and E2E
    styles/*|public/*|*.css)
      RUN_COMPONENT=true
      RUN_E2E=true
      ;;
    # Next.js and frontend configs
    next.config.*|tailwind.config.*|postcss.config.*)
      RUN_COMPONENT=true
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

if [ "$SELECT_ONLY" = true ]; then
  {
    echo "component=$RUN_COMPONENT"
    echo "api=$RUN_API"
    echo "e2e=$RUN_E2E"
  } >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi

# Skip API/E2E tests gracefully if required secrets are unavailable (e.g., fork PRs)
if { [ "$RUN_API" = true ] || [ "$RUN_E2E" = true ]; } && \
   { [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ] || [ -z "${COOKIE_SECRET:-}" ]; }; then
  echo "API/E2E tests selected but JWT/COOKIE secrets are missing; skipping API/E2E suites"
  RUN_API=false
  RUN_E2E=false
fi

if [ "$RUN_COMPONENT" = true ]; then
  echo "Running component tests..."
  npm run test:component -- --reporter=dot || exit 1
fi

if [ "$RUN_API" = true ]; then
  echo "Running API [P0] tests only..."
  # Use the dedicated P0 test script which has the correct grep pattern
  npm run test:api:p0 || exit 1
fi

if [ "$RUN_E2E" = true ]; then
  echo "E2E tests detected but skipping in selective test runner"
  echo "E2E tests run in dedicated 'E2E Smoke' job with full stack"
  echo "This keeps selective tests fast (backend-only)"
fi

if [ "$RUN_COMPONENT" = false ] && [ "$RUN_API" = false ] && [ "$RUN_E2E" = false ]; then
  echo "No tests selected - changes don't affect test suites"
  exit 0
fi

echo "=== All selective tests passed ==="
exit 0
