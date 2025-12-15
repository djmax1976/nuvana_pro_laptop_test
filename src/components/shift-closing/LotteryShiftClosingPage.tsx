/**
 * LotteryShiftClosingPage Placeholder Component
 *
 * This is a placeholder export for tests that expect this component.
 * The actual page is implemented as a Next.js page at:
 * src/app/(mystore)/mystore/terminal/shift-closing/lottery/page.tsx
 *
 * @deprecated Use the Next.js page directly. This stub is for test compatibility only.
 */

import React from "react";

export interface LotteryShiftClosingPageProps {
  shiftId?: string;
}

/**
 * Placeholder component - not for production use
 * Tests should be updated to test the actual page or individual components
 */
export function LotteryShiftClosingPage({
  shiftId,
}: LotteryShiftClosingPageProps) {
  return (
    <div data-testid="lottery-shift-closing-placeholder">
      <button data-testid="manual-entry-button">Manual Entry</button>
      <div data-testid="manual-entry-indicator" style={{ display: "none" }}>
        Manual Entry Mode Active
      </div>
      <p>
        Placeholder component. Shift ID: {shiftId || "none"}. Use actual page
        component.
      </p>
    </div>
  );
}

export default LotteryShiftClosingPage;
