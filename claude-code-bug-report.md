# Bug Report: "Prompt is too long" Error When Running Tests

## Summary
Running test suites that previously completed successfully now consistently fails with "Prompt is too long" error. This is a regression - the same test commands worked fine in previous versions/sessions.

## Environment
- **Claude Code Version**: 2.0.76
- **Platform**: Windows 11 (win32)
- **Node.js**: v24.7.0
- **npm**: 11.5.1
- **Test Frameworks**: Vitest 3.2.4, Playwright 1.57.0

## Steps to Reproduce
1. Open a Claude Code session in a project with a test suite
2. Ask Claude to run the full test suite (e.g., `npm run test` or `npx vitest run`)
3. Tests begin executing but before completion, the error "Prompt is too long" appears
4. The test run is interrupted and results are lost

## Expected Behavior
- Test suite runs to completion
- Claude reports pass/fail summary
- This worked correctly in previous sessions (before ~late December 2025)

## Actual Behavior
- Test output accumulates in the context
- Before tests complete, "Prompt is too long" error occurs
- No test results are provided
- User cannot complete their testing workflow

## Impact
- **Severity**: High - blocks normal development workflow
- **Frequency**: Consistent - happens on every full test run
- **Workaround**: Must use `--reporter=dot` and pipe through `tail`, but this loses valuable debugging information

## Additional Context
- Project has ~136,000 lines of test code across multiple test files
- Previously, full test runs completed without issues
- The issue appears to be related to how tool output (specifically test output) is counted against context limits
- This seems to be a regression in context handling, not a change in the test suite

## Suggested Fix
- Increase context buffer for tool outputs, OR
- More aggressively truncate/summarize tool output before adding to context, OR
- Provide a way to stream test output without accumulating it all in context

## User Impact Statement
"I used to run all the tests before without any issues. This suddenly started happening and now none of my test runs complete. This breaks my development workflow."
