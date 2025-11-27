/**
 * Transaction Processing Worker
 *
 * Asynchronous RabbitMQ worker for processing transactions.
 * Consumes messages from transactions.processing queue, validates,
 * creates database records, updates inventory, and invalidates cache.
 *
 * Story 3.3: Transaction Processing Worker
 */

import * as amqp from "amqplib";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  initializeRabbitMQ,
  setupTransactionsQueue,
  closeRabbitMQ,
  QUEUES,
} from "../utils/rabbitmq";
import { getRedisClient, closeRedis } from "../utils/redis";
import {
  TransactionPayload,
  TransactionLineItemPayload,
  safeValidateTransactionPayload,
} from "../schemas/transaction.schema";
import { TransactionMessage } from "../services/transaction.service";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";

const prisma = new PrismaClient();

/**
 * Worker configuration
 */
const WORKER_CONFIG = {
  /** Maximum retry attempts before dead-lettering */
  MAX_RETRIES: 5,
  /** Base delay for exponential backoff (ms) */
  BASE_RETRY_DELAY: 1000,
  /** Prefetch count for RabbitMQ consumer */
  PREFETCH_COUNT: 1,
  /** Cache key pattern for shift summaries */
  SHIFT_CACHE_PATTERN: "shift:summary:",
} as const;

/**
 * Worker state for tracking
 */
interface WorkerState {
  isRunning: boolean;
  isShuttingDown: boolean;
  channel: amqp.Channel | null;
  consumerTag: string | null;
  messagesInFlight: number;
}

const workerState: WorkerState = {
  isRunning: false,
  isShuttingDown: false,
  channel: null,
  consumerTag: null,
  messagesInFlight: 0,
};

/**
 * Processing result for logging
 */
interface ProcessingResult {
  success: boolean;
  correlation_id: string;
  transaction_id?: string;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  timing: {
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
}

/**
 * Log message with correlation ID and structured data
 */
function logWorker(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    worker: "transaction-worker",
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
 * Calculate exponential backoff delay
 * @param retryCount - Current retry attempt (0-indexed)
 * @returns Delay in milliseconds (1s, 2s, 4s, 8s, 16s)
 */
function calculateBackoffDelay(retryCount: number): number {
  return WORKER_CONFIG.BASE_RETRY_DELAY * Math.pow(2, retryCount);
}

/**
 * Get retry count from message headers
 */
function getRetryCount(msg: amqp.ConsumeMessage): number {
  const deathHeaders = msg.properties.headers?.["x-death"] as
    | Array<{ count: number }>
    | undefined;
  if (deathHeaders && deathHeaders.length > 0) {
    return deathHeaders[0].count || 0;
  }
  // Check custom retry header
  return (msg.properties.headers?.["x-retry-count"] as number) || 0;
}

/**
 * Validate products exist and are active
 * Note: Product model not yet in Prisma schema (Epic 5)
 * This function provides graceful degradation
 */
async function validateProducts(
  lineItems: TransactionLineItemPayload[],
  correlation_id: string,
): Promise<{ valid: boolean; errors: string[] }> {
  // Product model not available yet - log and skip validation
  logWorker(
    "warn",
    "Product validation skipped - Product model not available",
    {
      correlation_id,
      line_item_count: lineItems.length,
      note: "Product and StockMovement models planned for Epic 5: Inventory Management",
    },
  );

  // Return valid for now - product validation will be added when Product model exists
  return { valid: true, errors: [] };
}

/**
 * Validate shift exists and is in OPEN status
 */
async function validateShift(
  shiftId: string,
  storeId: string,
  _correlationId: string,
): Promise<{ valid: boolean; error?: string }> {
  const shift = await prisma.shift.findUnique({
    where: { shift_id: shiftId },
    select: { store_id: true, status: true },
  });

  if (!shift) {
    return { valid: false, error: `Shift ${shiftId} not found` };
  }

  if (shift.store_id !== storeId) {
    return {
      valid: false,
      error: `Shift ${shiftId} does not belong to store ${storeId}`,
    };
  }

  if (shift.status !== "OPEN") {
    return {
      valid: false,
      error: `Shift ${shiftId} is ${shift.status}, must be OPEN`,
    };
  }

  return { valid: true };
}

/**
 * Create transaction records in database atomically
 */
async function createTransactionRecords(
  payload: TransactionPayload,
  correlationId: string,
  userId: string,
): Promise<string> {
  const transactionId = correlationId; // Use correlation_id as transaction_id

  // Calculate total
  const total = payload.subtotal + payload.tax - payload.discount;

  // Generate public_id for the transaction
  const publicId = generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION);

  // Create all records in a single Prisma transaction
  await prisma.$transaction(async (tx) => {
    // Create Transaction record
    await tx.transaction.create({
      data: {
        transaction_id: transactionId,
        store_id: payload.store_id,
        shift_id: payload.shift_id,
        cashier_id: payload.cashier_id || userId, // Use payload cashier_id or user_id
        pos_terminal_id: payload.pos_terminal_id || null,
        timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        subtotal: new Prisma.Decimal(payload.subtotal),
        tax: new Prisma.Decimal(payload.tax),
        discount: new Prisma.Decimal(payload.discount),
        total: new Prisma.Decimal(total),
        public_id: publicId,
      },
    });

    // Create TransactionLineItem records
    const lineItemPromises = payload.line_items.map((item) => {
      const lineTotal = item.quantity * item.unit_price - item.discount;
      return tx.transactionLineItem.create({
        data: {
          transaction_id: transactionId,
          product_id: item.product_id || null,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unit_price: new Prisma.Decimal(item.unit_price),
          discount: new Prisma.Decimal(item.discount),
          line_total: new Prisma.Decimal(lineTotal),
        },
      });
    });

    // Create TransactionPayment records
    const paymentPromises = payload.payments.map((payment) =>
      tx.transactionPayment.create({
        data: {
          transaction_id: transactionId,
          method: payment.method,
          amount: new Prisma.Decimal(payment.amount),
          reference: payment.reference || null,
        },
      }),
    );

    await Promise.all([...lineItemPromises, ...paymentPromises]);
  });

  logWorker("info", "Transaction records created successfully", {
    correlation_id: correlationId,
    transaction_id: transactionId,
    public_id: publicId,
    line_items_count: payload.line_items.length,
    payments_count: payload.payments.length,
  });

  return transactionId;
}

/**
 * Update inventory with StockMovement records
 * Note: StockMovement model not yet in Prisma schema (Epic 5)
 * This function provides graceful degradation
 */
async function updateInventory(
  transactionId: string,
  lineItems: TransactionLineItemPayload[],
  _storeId: string,
  correlationId: string,
): Promise<void> {
  // StockMovement model not available yet - log and skip
  logWorker(
    "warn",
    "Inventory update skipped - StockMovement model not available",
    {
      correlation_id: correlationId,
      transaction_id: transactionId,
      line_item_count: lineItems.length,
      note: "StockMovement model planned for Epic 5: Inventory Management",
    },
  );

  // When StockMovement is available, this function will:
  // 1. Create StockMovement records with type='SALE' and negative quantity
  // 2. Update Product inventory quantities atomically
  // 3. Create AuditLog entries for inventory changes
}

/**
 * Invalidate Redis cache for shift summaries
 */
async function invalidateShiftCache(
  shiftId: string,
  correlationId: string,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      logWorker("warn", "Redis unavailable - cache invalidation skipped", {
        correlation_id: correlationId,
        shift_id: shiftId,
      });
      return;
    }

    const cacheKey = `${WORKER_CONFIG.SHIFT_CACHE_PATTERN}${shiftId}`;
    await redis.del(cacheKey);

    logWorker("info", "Cache invalidated successfully", {
      correlation_id: correlationId,
      shift_id: shiftId,
      cache_key: cacheKey,
    });
  } catch (error) {
    // Don't fail transaction for cache errors - log and continue
    logWorker("error", "Cache invalidation failed", {
      correlation_id: correlationId,
      shift_id: shiftId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Create audit log entry
 */
async function createAuditLog(
  action: string,
  tableName: string,
  recordId: string,
  userId: string | null,
  newValues: Prisma.InputJsonValue,
  correlationId: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        table_name: tableName,
        record_id: recordId,
        new_values: newValues,
        reason: `Transaction processing - correlation_id: ${correlationId}`,
      },
    });
  } catch (error) {
    // Don't fail for audit log errors
    logWorker("error", "Audit log creation failed", {
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Process a single transaction message
 */
async function processTransaction(
  message: TransactionMessage,
): Promise<ProcessingResult> {
  const startTime = new Date();
  const { correlation_id, user_id, payload } = message;

  logWorker("info", "Processing transaction", {
    correlation_id,
    store_id: payload.store_id,
    shift_id: payload.shift_id,
    line_items: payload.line_items.length,
    payments: payload.payments.length,
  });

  try {
    // Step 1: Validate payload structure
    const validationResult = safeValidateTransactionPayload(payload);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(
        (issue) => issue.message,
      );
      throw new Error(`Payload validation failed: ${errors.join(", ")}`);
    }

    // Step 2: Validate shift exists and is OPEN
    const shiftValidation = await validateShift(
      payload.shift_id,
      payload.store_id,
      correlation_id,
    );
    if (!shiftValidation.valid) {
      throw new Error(shiftValidation.error);
    }

    // Step 3: Validate products (graceful degradation - skipped until Product model available)
    const productValidation = await validateProducts(
      payload.line_items,
      correlation_id,
    );
    if (!productValidation.valid) {
      throw new Error(
        `Product validation failed: ${productValidation.errors.join(", ")}`,
      );
    }

    // Step 4: Create database records (Transaction, LineItems, Payments)
    const transactionId = await createTransactionRecords(
      payload,
      correlation_id,
      user_id,
    );

    // Step 5: Update inventory (graceful degradation - skipped until StockMovement model available)
    await updateInventory(
      transactionId,
      payload.line_items,
      payload.store_id,
      correlation_id,
    );

    // Step 6: Invalidate shift summary cache
    await invalidateShiftCache(payload.shift_id, correlation_id);

    // Step 7: Create audit log
    await createAuditLog(
      "CREATE",
      "transactions",
      transactionId,
      user_id,
      {
        store_id: payload.store_id,
        shift_id: payload.shift_id,
        total: payload.subtotal + payload.tax - payload.discount,
      },
      correlation_id,
    );

    const endTime = new Date();
    return {
      success: true,
      correlation_id,
      transaction_id: transactionId,
      timing: {
        started_at: startTime.toISOString(),
        completed_at: endTime.toISOString(),
        duration_ms: endTime.getTime() - startTime.getTime(),
      },
    };
  } catch (error) {
    const endTime = new Date();
    return {
      success: false,
      correlation_id,
      error: {
        code: "PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      timing: {
        started_at: startTime.toISOString(),
        completed_at: endTime.toISOString(),
        duration_ms: endTime.getTime() - startTime.getTime(),
      },
    };
  }
}

/**
 * Handle message from RabbitMQ queue
 */
async function handleMessage(
  msg: amqp.ConsumeMessage,
  channel: amqp.Channel,
): Promise<void> {
  workerState.messagesInFlight++;

  let correlationId = msg.properties.correlationId || "unknown";
  const retryCount = getRetryCount(msg);

  try {
    // Parse message content
    const content = msg.content.toString();
    let message: TransactionMessage;

    try {
      message = JSON.parse(content);
      correlationId = message.correlation_id || correlationId;
    } catch (parseError) {
      logWorker("error", "Failed to parse message", {
        correlation_id: correlationId,
        error: "Invalid JSON",
      });
      // Reject invalid JSON - don't retry
      channel.nack(msg, false, false);
      workerState.messagesInFlight--;
      return;
    }

    // Process the transaction
    const result = await processTransaction(message);

    if (result.success) {
      // Success - acknowledge message
      channel.ack(msg);
      logWorker("info", "Transaction processed successfully", {
        correlation_id: correlationId,
        transaction_id: result.transaction_id,
        duration_ms: result.timing.duration_ms,
      });
    } else {
      // Failed - handle retry logic
      if (retryCount < WORKER_CONFIG.MAX_RETRIES) {
        const delay = calculateBackoffDelay(retryCount);
        logWorker("warn", "Transaction processing failed, will retry", {
          correlation_id: correlationId,
          retry_count: retryCount + 1,
          max_retries: WORKER_CONFIG.MAX_RETRIES,
          backoff_delay_ms: delay,
          error: result.error?.message,
        });

        // Nack without requeue - let dead-letter exchange handle retry
        // In production, would use a delay queue for proper exponential backoff
        channel.nack(msg, false, false);
      } else {
        // Max retries exceeded - send to dead-letter queue
        logWorker(
          "error",
          "Max retries exceeded, sending to dead-letter queue",
          {
            correlation_id: correlationId,
            retry_count: retryCount,
            error: result.error?.message,
            stack: result.error?.stack,
          },
        );
        channel.nack(msg, false, false);
      }
    }
  } catch (error) {
    logWorker("error", "Unexpected error handling message", {
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Nack for unexpected errors
    channel.nack(msg, false, false);
  } finally {
    workerState.messagesInFlight--;
  }
}

/**
 * Start the transaction worker
 */
export async function startWorker(): Promise<void> {
  if (workerState.isRunning) {
    logWorker("warn", "Worker is already running");
    return;
  }

  logWorker("info", "Starting transaction worker...");

  try {
    // Initialize RabbitMQ connection and setup queue
    await initializeRabbitMQ();
    const channel = await setupTransactionsQueue();
    workerState.channel = channel;

    // Set prefetch to process one message at a time
    await channel.prefetch(WORKER_CONFIG.PREFETCH_COUNT);

    // Start consuming messages
    const { consumerTag } = await channel.consume(
      QUEUES.TRANSACTIONS_PROCESSING,
      async (msg) => {
        if (msg) {
          if (workerState.isShuttingDown) {
            // During shutdown, nack without requeue to let another consumer handle
            channel.nack(msg, false, true);
            return;
          }
          await handleMessage(msg, channel);
        }
      },
      { noAck: false },
    );

    workerState.consumerTag = consumerTag;
    workerState.isRunning = true;

    logWorker("info", "Transaction worker started successfully", {
      queue: QUEUES.TRANSACTIONS_PROCESSING,
      consumer_tag: consumerTag,
      prefetch: WORKER_CONFIG.PREFETCH_COUNT,
    });
  } catch (error) {
    logWorker("error", "Failed to start worker", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Stop the transaction worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (!workerState.isRunning) {
    logWorker("warn", "Worker is not running");
    return;
  }

  logWorker("info", "Stopping transaction worker...");
  workerState.isShuttingDown = true;

  try {
    // Cancel consumer
    if (workerState.channel && workerState.consumerTag) {
      await workerState.channel.cancel(workerState.consumerTag);
      logWorker("info", "Consumer cancelled");
    }

    // Wait for in-flight messages to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startWait = Date.now();
    while (
      workerState.messagesInFlight > 0 &&
      Date.now() - startWait < maxWaitTime
    ) {
      logWorker("info", "Waiting for in-flight messages to complete", {
        messages_in_flight: workerState.messagesInFlight,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (workerState.messagesInFlight > 0) {
      logWorker(
        "warn",
        "Shutdown timeout - some messages may not have completed",
        {
          messages_in_flight: workerState.messagesInFlight,
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

    logWorker("info", "Transaction worker stopped successfully");
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
  messagesInFlight: number;
} {
  return {
    running: workerState.isRunning,
    shuttingDown: workerState.isShuttingDown,
    messagesInFlight: workerState.messagesInFlight,
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

export {
  processTransaction,
  validateShift,
  validateProducts,
  createTransactionRecords,
  updateInventory,
  invalidateShiftCache,
  WORKER_CONFIG,
};
