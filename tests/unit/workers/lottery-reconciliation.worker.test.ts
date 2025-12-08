/**
 * Unit Tests: Lottery Reconciliation Worker
 *
 * Tests for lottery ticket count reconciliation worker:
 * - Worker start/stop functionality
 * - Reconciliation job execution
 * - Error handling
 * - Worker status tracking
 *
 * @test-level Unit
 * @justification Tests worker logic with mocked services - fast, isolated
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (Important - Background Job Reliability)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startReconciliationWorker,
  stopReconciliationWorker,
  getWorkerStatus,
  runReconciliationOnce,
} from "../../../backend/src/workers/lottery-reconciliation.worker";
import { reconcileAllPackTicketCounts } from "../../../backend/src/services/lottery-count.service";

// Mock the reconciliation service
vi.mock("../../../backend/src/services/lottery-count.service", () => ({
  reconcileAllPackTicketCounts: vi.fn(),
}));

describe("6.13-UNIT: Lottery Reconciliation Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Stop worker if running
    try {
      await stopReconciliationWorker();
    } catch {
      // Ignore errors if worker not running
    }
    vi.useRealTimers();
  });

  describe("Worker Lifecycle", () => {
    it("6.13-UNIT-030: should start worker successfully", async () => {
      // GIVEN: Mocked reconciliation service
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue({
        total_processed: 0,
        total_corrected: 0,
        total_accurate: 0,
        discrepancies: [],
      });

      // WHEN: Starting worker
      await startReconciliationWorker();

      // THEN: Worker is running
      const status = getWorkerStatus();
      expect(status.isRunning).toBe(true);
    });

    it("6.13-UNIT-031: should stop worker successfully", async () => {
      // GIVEN: Worker is running
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue({
        total_processed: 0,
        total_corrected: 0,
        total_accurate: 0,
        discrepancies: [],
      });
      await startReconciliationWorker();

      // WHEN: Stopping worker
      await stopReconciliationWorker();

      // THEN: Worker is stopped
      const status = getWorkerStatus();
      expect(status.isRunning).toBe(false);
    });

    it("6.13-UNIT-032: should not start worker if already running", async () => {
      // GIVEN: Worker is already running
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue({
        total_processed: 0,
        total_corrected: 0,
        total_accurate: 0,
        discrepancies: [],
      });
      await startReconciliationWorker();

      // WHEN: Starting worker again
      await startReconciliationWorker();

      // THEN: Worker is still running (no error thrown)
      const status = getWorkerStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe("Reconciliation Execution", () => {
    it("6.13-UNIT-033: should execute reconciliation on start", async () => {
      // GIVEN: Mocked reconciliation service
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue({
        total_processed: 10,
        total_corrected: 2,
        total_accurate: 8,
        discrepancies: [
          { pack_id: "pack-1", difference: 5 },
          { pack_id: "pack-2", difference: -3 },
        ],
      });

      // WHEN: Starting worker
      await startReconciliationWorker();

      // THEN: Reconciliation was called
      expect(reconcileAllPackTicketCounts).toHaveBeenCalledWith(100);
    });

    it("6.13-UNIT-034: should run reconciliation once when requested", async () => {
      // GIVEN: Mocked reconciliation service
      const mockResult = {
        total_processed: 5,
        total_corrected: 1,
        total_accurate: 4,
        discrepancies: [{ pack_id: "pack-1", difference: 2 }],
      };
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue(mockResult);

      // WHEN: Running reconciliation once
      const result = await runReconciliationOnce();

      // THEN: Result is returned
      expect(result).toEqual(mockResult);
      expect(reconcileAllPackTicketCounts).toHaveBeenCalledWith(100);
    });

    it("6.13-UNIT-035: should handle reconciliation errors gracefully", async () => {
      // GIVEN: Reconciliation service throws error
      vi.mocked(reconcileAllPackTicketCounts).mockRejectedValue(
        new Error("Database connection failed"),
      );

      // WHEN: Starting worker
      // THEN: Worker starts but logs error (no exception thrown)
      await expect(startReconciliationWorker()).resolves.not.toThrow();
    });
  });

  describe("Worker Status", () => {
    it("6.13-UNIT-036: should track last run time", async () => {
      // GIVEN: Mocked reconciliation service
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue({
        total_processed: 0,
        total_corrected: 0,
        total_accurate: 0,
        discrepancies: [],
      });

      // WHEN: Starting worker
      await startReconciliationWorker();

      // THEN: Last run time is tracked
      const status = getWorkerStatus();
      expect(status.lastRunAt).not.toBeNull();
      expect(status.lastResult).not.toBeNull();
    });

    it("6.13-UNIT-037: should track last reconciliation result", async () => {
      // GIVEN: Mocked reconciliation service with result
      const mockResult = {
        total_processed: 20,
        total_corrected: 3,
        total_accurate: 17,
        discrepancies: [],
      };
      vi.mocked(reconcileAllPackTicketCounts).mockResolvedValue(mockResult);

      // WHEN: Starting worker
      await startReconciliationWorker();

      // THEN: Last result is tracked
      const status = getWorkerStatus();
      expect(status.lastResult).toEqual(mockResult);
    });
  });
});
