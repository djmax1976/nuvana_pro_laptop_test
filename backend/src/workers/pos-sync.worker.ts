/**
 * POS Sync Worker
 *
 * Background worker for scheduled POS data synchronization.
 * Polls the database for integrations due for sync and processes them.
 * Also handles manual sync requests via RabbitMQ queue.
 *
 * Phase 1.6: POS Integration & Auto-Onboarding
 *
 * @module workers/pos-sync.worker
 */

import * as amqp from "amqplib";
import {
  initializeRabbitMQ,
  createChannel,
  closeRabbitMQ,
  QUEUES,
} from "../utils/rabbitmq";
import { closeRedis } from "../utils/redis";
import { prisma } from "../utils/db";
import { posSyncService } from "../services/pos/pos-sync.service";
import type { POSSyncResult } from "../types/pos-integration.types";

/**
 * Worker configuration
 */
const WORKER_CONFIG = Object.freeze({
  /** Interval between scheduled sync checks (ms) */
  POLL_INTERVAL_MS: 60000, // 1 minute
  /** Maximum concurrent sync operations */
  MAX_CONCURRENT_SYNCS: 3,
  /** Maximum retry attempts for failed syncs */
  MAX_RETRIES: 3,
  /** Prefetch count for RabbitMQ consumer */
  PREFETCH_COUNT: 1,
  /** Lock timeout for distributed locking (ms) */
  LOCK_TIMEOUT_MS: 300000, // 5 minutes
} as const);

/**
 * Sync job message structure
 */
interface POSSyncJob {
  type: "SCHEDULED" | "MANUAL" | "INITIAL";
  store_id: string;
  integration_id: string;
  triggered_by?: string;
  options?: {
    departments?: boolean;
    tender_types?: boolean;
    cashiers?: boolean;
    tax_rates?: boolean;
  };
}

/**
 * Worker state for tracking
 */
interface WorkerState {
  isRunning: boolean;
  isShuttingDown: boolean;
  channel: amqp.Channel | null;
  consumerTag: string | null;
  pollIntervalId: NodeJS.Timeout | null;
  activeSyncs: Map<string, Date>;
}

const workerState: WorkerState = {
  isRunning: false,
  isShuttingDown: false,
  channel: null,
  consumerTag: null,
  pollIntervalId: null,
  activeSyncs: new Map(),
};

/**
 * Log message with structured data
 */
function logWorker(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    worker: "pos-sync-worker",
    level,
    message,
    ...data,
  };

  if (level === "error") {
    console.error(JSON.stringify(logData));
  } else if (level === "warn") {
    console.warn(JSON.stringify(logData));
  } else {
    console.log(JSON.stringify(logData));
  }
}

/**
 * Setup POS sync queue
 */
async function setupPOSSyncQueue(): Promise<amqp.Channel> {
  const channel = await createChannel();

  // Create POS sync queue with dead letter configuration
  await channel.assertQueue(QUEUES.POS_SYNC, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "dlx.pos-sync",
      "x-dead-letter-routing-key": QUEUES.POS_SYNC,
    },
  });

  // Create dead letter exchange and queue for failed syncs
  await channel.assertExchange("dlx.pos-sync", "direct", { durable: true });
  await channel.assertQueue("pos.sync.dead-letter", { durable: true });
  await channel.bindQueue(
    "pos.sync.dead-letter",
    "dlx.pos-sync",
    QUEUES.POS_SYNC,
  );

  logWorker("info", "POS sync queue setup complete", {
    queue: QUEUES.POS_SYNC,
  });

  return channel;
}

/**
 * Publish a sync job to the queue
 */
export async function publishSyncJob(job: POSSyncJob): Promise<void> {
  if (!workerState.channel) {
    throw new Error("Worker not initialized");
  }

  const messageBuffer = Buffer.from(JSON.stringify(job));

  workerState.channel.publish("", QUEUES.POS_SYNC, messageBuffer, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
  });

  logWorker("info", "Sync job published", {
    store_id: job.store_id,
    type: job.type,
  });
}

/**
 * Process a single sync job
 */
async function processSyncJob(job: POSSyncJob): Promise<POSSyncResult> {
  const { store_id, integration_id, triggered_by, options } = job;

  logWorker("info", "Processing sync job", {
    store_id,
    integration_id,
    type: job.type,
    triggered_by,
  });

  // Check if sync is already in progress for this store
  if (workerState.activeSyncs.has(store_id)) {
    const startTime = workerState.activeSyncs.get(store_id)!;
    const elapsed = Date.now() - startTime.getTime();

    // If sync is taking too long, allow new one
    if (elapsed < WORKER_CONFIG.LOCK_TIMEOUT_MS) {
      logWorker("warn", "Sync already in progress for store", {
        store_id,
        elapsed_ms: elapsed,
      });
      return {
        success: false,
        status: "FAILED",
        durationMs: 0,
        errors: [
          {
            entityType: "department",
            posCode: "*",
            error: "Sync already in progress",
            errorCode: "SYNC_IN_PROGRESS",
          },
        ],
      };
    } else {
      logWorker("warn", "Previous sync timed out, proceeding with new sync", {
        store_id,
        elapsed_ms: elapsed,
      });
    }
  }

  // Mark sync as in progress
  workerState.activeSyncs.set(store_id, new Date());

  try {
    const result = await posSyncService.triggerSync(store_id, {
      triggeredBy: triggered_by,
      departments: options?.departments,
      tenderTypes: options?.tender_types,
      cashiers: options?.cashiers,
      taxRates: options?.tax_rates,
    });

    logWorker("info", "Sync job completed", {
      store_id,
      integration_id,
      success: result.success,
      status: result.status,
      duration_ms: result.durationMs,
      departments_synced: result.departments?.received,
      tender_types_synced: result.tenderTypes?.received,
      tax_rates_synced: result.taxRates?.received,
      error_count: result.errors?.length,
    });

    return result;
  } finally {
    // Remove from active syncs
    workerState.activeSyncs.delete(store_id);
  }
}

/**
 * Handle incoming sync job message
 */
async function handleMessage(
  msg: amqp.ConsumeMessage,
  channel: amqp.Channel,
): Promise<void> {
  let job: POSSyncJob;

  try {
    const content = msg.content.toString();
    job = JSON.parse(content);
  } catch (parseError) {
    logWorker("error", "Failed to parse sync job message", {
      error: parseError instanceof Error ? parseError.message : "Unknown error",
    });
    // Reject invalid JSON - don't retry
    channel.nack(msg, false, false);
    return;
  }

  try {
    const result = await processSyncJob(job);

    if (result.success || result.status === "PARTIAL_SUCCESS") {
      // Success - acknowledge message
      channel.ack(msg);
    } else {
      // Failed - check retry count
      const retryCount =
        (msg.properties.headers?.["x-retry-count"] as number) || 0;

      if (retryCount < WORKER_CONFIG.MAX_RETRIES) {
        logWorker("warn", "Sync failed, will retry", {
          store_id: job.store_id,
          retry_count: retryCount + 1,
          max_retries: WORKER_CONFIG.MAX_RETRIES,
        });
        // Nack without requeue to let DLX handle retry
        channel.nack(msg, false, false);
      } else {
        logWorker("error", "Max retries exceeded for sync job", {
          store_id: job.store_id,
          retry_count: retryCount,
        });
        channel.nack(msg, false, false);
      }
    }
  } catch (error) {
    logWorker("error", "Unexpected error processing sync job", {
      store_id: job.store_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    channel.nack(msg, false, false);
  }
}

/**
 * Poll for scheduled syncs
 */
async function pollForScheduledSyncs(): Promise<void> {
  if (workerState.isShuttingDown) {
    return;
  }

  // Skip if too many syncs are in progress
  if (workerState.activeSyncs.size >= WORKER_CONFIG.MAX_CONCURRENT_SYNCS) {
    logWorker("info", "Max concurrent syncs reached, skipping poll", {
      active_syncs: workerState.activeSyncs.size,
      max: WORKER_CONFIG.MAX_CONCURRENT_SYNCS,
    });
    return;
  }

  try {
    // Find integrations that are due for sync
    const dueIntegrations = await prisma.pOSIntegration.findMany({
      where: {
        is_active: true,
        sync_enabled: true,
        next_sync_at: {
          lte: new Date(),
        },
      },
      select: {
        pos_integration_id: true,
        store_id: true,
        pos_type: true,
        next_sync_at: true,
      },
      take: WORKER_CONFIG.MAX_CONCURRENT_SYNCS - workerState.activeSyncs.size,
    });

    if (dueIntegrations.length === 0) {
      return;
    }

    logWorker("info", "Found integrations due for sync", {
      count: dueIntegrations.length,
    });

    // Queue sync jobs for each integration
    for (const integration of dueIntegrations) {
      // Skip if already in progress
      if (workerState.activeSyncs.has(integration.store_id)) {
        continue;
      }

      const job: POSSyncJob = {
        type: "SCHEDULED",
        store_id: integration.store_id,
        integration_id: integration.pos_integration_id,
      };

      // Process directly instead of queuing (for scheduled syncs)
      processSyncJob(job).catch((error) => {
        logWorker("error", "Scheduled sync failed", {
          store_id: integration.store_id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
    }
  } catch (error) {
    logWorker("error", "Error polling for scheduled syncs", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Start the POS sync worker
 */
export async function startWorker(): Promise<void> {
  if (workerState.isRunning) {
    logWorker("warn", "Worker is already running");
    return;
  }

  logWorker("info", "Starting POS sync worker...");

  try {
    // Initialize RabbitMQ connection
    await initializeRabbitMQ();
    const channel = await setupPOSSyncQueue();
    workerState.channel = channel;

    // Set prefetch
    await channel.prefetch(WORKER_CONFIG.PREFETCH_COUNT);

    // Start consuming manual sync requests
    const { consumerTag } = await channel.consume(
      QUEUES.POS_SYNC,
      async (msg) => {
        if (msg) {
          if (workerState.isShuttingDown) {
            channel.nack(msg, false, true);
            return;
          }
          await handleMessage(msg, channel);
        }
      },
      { noAck: false },
    );

    workerState.consumerTag = consumerTag;

    // Start polling for scheduled syncs
    workerState.pollIntervalId = setInterval(
      pollForScheduledSyncs,
      WORKER_CONFIG.POLL_INTERVAL_MS,
    );

    // Perform initial poll
    pollForScheduledSyncs();

    workerState.isRunning = true;

    logWorker("info", "POS sync worker started successfully", {
      queue: QUEUES.POS_SYNC,
      consumer_tag: consumerTag,
      poll_interval_ms: WORKER_CONFIG.POLL_INTERVAL_MS,
    });
  } catch (error) {
    logWorker("error", "Failed to start worker", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Stop the POS sync worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (!workerState.isRunning) {
    logWorker("warn", "Worker is not running");
    return;
  }

  logWorker("info", "Stopping POS sync worker...");
  workerState.isShuttingDown = true;

  try {
    // Stop polling
    if (workerState.pollIntervalId) {
      clearInterval(workerState.pollIntervalId);
      workerState.pollIntervalId = null;
    }

    // Cancel consumer
    if (workerState.channel && workerState.consumerTag) {
      await workerState.channel.cancel(workerState.consumerTag);
      logWorker("info", "Consumer cancelled");
    }

    // Wait for active syncs to complete (with timeout)
    const maxWaitTime = 60000; // 60 seconds
    const startWait = Date.now();
    while (
      workerState.activeSyncs.size > 0 &&
      Date.now() - startWait < maxWaitTime
    ) {
      logWorker("info", "Waiting for active syncs to complete", {
        active_syncs: workerState.activeSyncs.size,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (workerState.activeSyncs.size > 0) {
      logWorker(
        "warn",
        "Shutdown timeout - some syncs may not have completed",
        {
          active_syncs: workerState.activeSyncs.size,
        },
      );
    }

    // Close connections
    await closeRabbitMQ();
    await closeRedis();
    await prisma.$disconnect();

    workerState.isRunning = false;
    workerState.isShuttingDown = false;
    workerState.channel = null;
    workerState.consumerTag = null;
    workerState.activeSyncs.clear();

    logWorker("info", "POS sync worker stopped successfully");
  } catch (error) {
    logWorker("error", "Error during worker shutdown", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return workerState.isRunning;
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  running: boolean;
  shuttingDown: boolean;
  activeSyncs: number;
} {
  return {
    running: workerState.isRunning,
    shuttingDown: workerState.isShuttingDown,
    activeSyncs: workerState.activeSyncs.size,
  };
}

// Handle process signals for graceful shutdown
if (require.main === module) {
  // Running as standalone process
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logWorker("info", `Received ${signal}, initiating graceful shutdown...`);
      try {
        await stopWorker();
        process.exit(0);
      } catch (error) {
        logWorker("error", "Error during shutdown", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        process.exit(1);
      }
    });
  });

  // Start the worker
  startWorker().catch((error) => {
    logWorker("error", "Failed to start worker", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  });
}

export { POSSyncJob, WORKER_CONFIG };
