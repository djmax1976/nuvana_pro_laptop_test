/**
 * Lottery Ticket Count Reconciliation Worker
 *
 * Background worker for periodic reconciliation of denormalized ticket counts
 * Compares tickets_sold_count with actual counts from LotteryTicketSerial table
 * and corrects any discrepancies
 *
 * Story 6.13: Lottery Database Enhancements & Bin Management
 * Task 10: Implement denormalized ticket count maintenance
 */

import { reconcileAllPackTicketCounts } from "../services/lottery-count.service";

/**
 * Worker configuration
 */
const WORKER_CONFIG = Object.freeze({
  /** Batch size for processing packs */
  BATCH_SIZE: 100,
  /** Interval between reconciliation runs (milliseconds) */
  RECONCILIATION_INTERVAL: 60 * 60 * 1000, // 1 hour
} as const);

/**
 * Worker state for tracking
 */
interface WorkerState {
  isRunning: boolean;
  isShuttingDown: boolean;
  intervalId: NodeJS.Timeout | null;
  lastRunAt: Date | null;
  lastResult: Awaited<ReturnType<typeof reconcileAllPackTicketCounts>> | null;
}

const workerState: WorkerState = {
  isRunning: false,
  isShuttingDown: false,
  intervalId: null,
  lastRunAt: null,
  lastResult: null,
};

/**
 * Log worker messages with timestamp
 */
function logWorker(
  level: "info" | "error" | "warn",
  message: string,
  metadata?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    level,
    message,
    worker: "lottery-reconciliation",
    ...metadata,
  };

  console[level](JSON.stringify(logMessage));
}

/**
 * Execute reconciliation job
 */
async function executeReconciliation(): Promise<void> {
  const startTime = new Date();
  logWorker("info", "Starting reconciliation job", {
    batch_size: WORKER_CONFIG.BATCH_SIZE,
  });

  try {
    const result = await reconcileAllPackTicketCounts(WORKER_CONFIG.BATCH_SIZE);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    workerState.lastRunAt = endTime;
    workerState.lastResult = result;

    logWorker("info", "Reconciliation job completed", {
      duration_ms: duration,
      total_processed: result.total_processed,
      total_corrected: result.total_corrected,
      total_accurate: result.total_accurate,
      discrepancy_count: result.discrepancies.length,
    });

    // Log discrepancies if any
    if (result.discrepancies.length > 0) {
      logWorker("warn", "Discrepancies found during reconciliation", {
        discrepancies: result.discrepancies,
      });
    }
  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logWorker("error", "Reconciliation job failed", {
      duration_ms: duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Start the reconciliation worker
 */
export async function startReconciliationWorker(): Promise<void> {
  if (workerState.isRunning) {
    logWorker("warn", "Worker is already running");
    return;
  }

  workerState.isRunning = true;
  workerState.isShuttingDown = false;

  logWorker("info", "Starting reconciliation worker", {
    interval_ms: WORKER_CONFIG.RECONCILIATION_INTERVAL,
    batch_size: WORKER_CONFIG.BATCH_SIZE,
  });

  // Run immediately on start
  await executeReconciliation();

  // Schedule periodic runs
  workerState.intervalId = setInterval(() => {
    if (!workerState.isShuttingDown) {
      executeReconciliation().catch((error) => {
        logWorker("error", "Unhandled error in reconciliation job", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }, WORKER_CONFIG.RECONCILIATION_INTERVAL);
}

/**
 * Stop the reconciliation worker
 */
export async function stopReconciliationWorker(): Promise<void> {
  if (!workerState.isRunning) {
    logWorker("warn", "Worker is not running");
    return;
  }

  logWorker("info", "Stopping reconciliation worker");

  workerState.isShuttingDown = true;

  if (workerState.intervalId) {
    clearInterval(workerState.intervalId);
    workerState.intervalId = null;
  }

  workerState.isRunning = false;
  logWorker("info", "Reconciliation worker stopped");
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  lastRunAt: Date | null;
  lastResult: typeof workerState.lastResult;
} {
  return {
    isRunning: workerState.isRunning,
    lastRunAt: workerState.lastRunAt,
    lastResult: workerState.lastResult,
  };
}

/**
 * Run reconciliation once (for manual triggers or testing)
 */
export async function runReconciliationOnce(): Promise<
  Awaited<ReturnType<typeof reconcileAllPackTicketCounts>>
> {
  logWorker("info", "Running one-time reconciliation");
  await executeReconciliation();
  if (!workerState.lastResult) {
    throw new Error("Reconciliation completed but no result available");
  }
  return workerState.lastResult;
}

// If running as standalone script, start the worker
if (require.main === module) {
  startReconciliationWorker()
    .then(() => {
      logWorker("info", "Reconciliation worker started successfully");
    })
    .catch((error) => {
      logWorker("error", "Failed to start reconciliation worker", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    logWorker("info", "Received SIGINT, shutting down gracefully");
    await stopReconciliationWorker();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logWorker("info", "Received SIGTERM, shutting down gracefully");
    await stopReconciliationWorker();
    process.exit(0);
  });
}
