#!/usr/bin/env bash
set -euo pipefail

# Selective Test Runner for CI/CD
# Analyzes changed files and runs appropriate test suites based on change type
# Exits 0 even when no tests need to run (required for S4 stability)

echo "=== Selective Test Runner ==="
echo "Analyzing changed files..."

# Get changed files based on event type
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # Pull request: compare against base branch
  BASE_BRANCH="$GITHUB_BASE_REF"
  echo "PR mode - Base branch: $BASE_BRANCH"
  CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD || echo "")
else
  # Push event: compare against previous commit
  echo "Push mode - Comparing HEAD~1...HEAD"
  CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD || echo "")
fi

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
  echo "Running E2E [P0] tests..."

  # Clean up port 3000 if occupied
  echo "Cleaning up port 3000..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1

  # Build the frontend first
  echo "Building frontend for E2E tests..."
  npm run build || exit 1

  # Start the frontend server in the background
  echo "Starting frontend server..."
  npm start > frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "Frontend PID: $FRONTEND_PID"

  # Wait for frontend to be ready
  echo "Waiting for frontend to be ready..."
  FRONTEND_READY=false
  for i in {1..30}; do
    if curl -sf --max-time 5 http://localhost:3000 > /dev/null 2>&1; then
      echo "Frontend is ready"
      FRONTEND_READY=true
      break
    fi
    echo "Waiting for frontend... ($i/30)"
    sleep 2
  done

  if [ "$FRONTEND_READY" = false ]; then
    echo "ERROR: Frontend failed to start within timeout"
    echo "Frontend logs:"
    cat frontend.log || echo "No frontend logs available"
    kill $FRONTEND_PID 2>/dev/null || true
    exit 1
  fi

  # Run E2E tests
  npm run test:e2e:p0
  E2E_EXIT_CODE=$?

  # Stop frontend server
  echo "Stopping frontend server (PID: $FRONTEND_PID)..."
  kill $FRONTEND_PID 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true

  # Exit with E2E test exit code
  if [ $E2E_EXIT_CODE -ne 0 ]; then
    exit $E2E_EXIT_CODE
  fi
fi

if [ "$RUN_COMPONENT" = false ] && [ "$RUN_API" = false ] && [ "$RUN_E2E" = false ]; then
  echo "No tests selected - changes don't affect test suites"
  exit 0
fi

echo "=== All selective tests passed ==="
exit 0
