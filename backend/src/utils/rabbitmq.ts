import * as amqp from "amqplib";

// amqplib types have issues, using any for connection to work around type errors
// The runtime behavior is correct - connect() returns a Connection
type Connection = any;
type Channel = amqp.Channel;

let connection: Connection | null = null;
let channels: Set<Channel> = new Set();
let transactionsChannel: Channel | null = null;

/**
 * Queue configuration constants
 */
export const QUEUES = {
  TRANSACTIONS_PROCESSING: "transactions.processing",
} as const;

/**
 * Dead letter exchange configuration
 */
export const DEAD_LETTER_EXCHANGE = "dlx.transactions";
export const DEAD_LETTER_QUEUE = "transactions.dead-letter";

/**
 * Initialize RabbitMQ connection with retry logic
 * @returns RabbitMQ connection instance
 */
export async function initializeRabbitMQ(): Promise<Connection> {
  if (connection) {
    return connection;
  }

  const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";

  let retries = 0;
  const maxRetries = 10;
  const baseDelay = 100; // 100ms base delay

  while (retries < maxRetries) {
    try {
      const conn = await amqp.connect(rabbitmqUrl);
      console.log("RabbitMQ: Connected successfully");

      // Error handling
      conn.on("error", (err: Error) => {
        console.error("RabbitMQ Connection Error:", err);
        connection = null;
      });

      conn.on("close", () => {
        console.log("RabbitMQ: Connection closed");
        connection = null;
        channels.clear();
        transactionsChannel = null;
      });

      connection = conn;
      return connection;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        console.error("RabbitMQ: Max connection attempts reached");
        throw new Error(
          `Failed to connect to RabbitMQ after ${maxRetries} attempts: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, etc.
      const delay = Math.min(baseDelay * Math.pow(2, retries - 1), 30000);
      console.log(
        `RabbitMQ: Connection failed, retrying in ${delay}ms (attempt ${retries}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("RabbitMQ: Connection initialization failed");
}

/**
 * Get or create RabbitMQ connection
 * @returns RabbitMQ connection instance
 */
export async function getRabbitMQConnection(): Promise<Connection> {
  if (!connection) {
    return await initializeRabbitMQ();
  }
  return connection;
}

/**
 * Create a new channel
 * @returns RabbitMQ channel instance
 */
export async function createChannel(): Promise<Channel> {
  const conn = await getRabbitMQConnection();
  try {
    const channel = await conn.createChannel();
    channels.add(channel);

    // Track channel errors and closures
    channel.on("error", (err: Error) => {
      console.error("RabbitMQ Channel Error:", err);
      channels.delete(channel);
    });

    channel.on("close", () => {
      console.log("RabbitMQ: Channel closed");
      channels.delete(channel);
      // Clear transactions channel if this was it
      if (channel === transactionsChannel) {
        transactionsChannel = null;
      }
    });

    return channel;
  } catch (error) {
    console.error("RabbitMQ: Failed to create channel:", error);
    throw error;
  }
}

/**
 * Close a specific channel
 * @param channel Channel to close
 */
export async function closeChannel(channel: Channel): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channels.delete(channel);
      console.log("RabbitMQ: Channel closed successfully");
    }
  } catch (error) {
    console.error("RabbitMQ: Error closing channel:", error);
    channels.delete(channel);
  }
}

/**
 * Close all channels and connection gracefully
 */
export async function closeRabbitMQ(): Promise<void> {
  // Clear transactions channel reference
  transactionsChannel = null;

  // Close all channels first
  const closePromises = Array.from(channels).map((channel) =>
    closeChannel(channel),
  );
  await Promise.allSettled(closePromises);
  channels.clear();

  // Close connection
  if (connection) {
    try {
      await connection.close();
      console.log("RabbitMQ: Connection closed gracefully");
    } catch (error) {
      console.error("RabbitMQ: Error during connection close:", error);
    }
    connection = null;
  }
}

/**
 * Setup transactions queue with dead letter exchange
 * Reuses existing channel if available to prevent connection churn
 * @returns Channel configured with the queue
 */
export async function setupTransactionsQueue(): Promise<Channel> {
  // Reuse existing channel if available and open
  if (transactionsChannel) {
    try {
      // Verify channel is still usable by checking the queue
      await transactionsChannel.checkQueue(QUEUES.TRANSACTIONS_PROCESSING);
      return transactionsChannel;
    } catch (error) {
      // Channel is broken, create a new one
      console.log("RabbitMQ: Transactions channel unavailable, recreating...");
      transactionsChannel = null;
    }
  }

  // Create new channel
  const channel = await createChannel();

  try {
    // Create dead letter exchange and queue
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "direct", {
      durable: true,
    });

    await channel.assertQueue(DEAD_LETTER_QUEUE, {
      durable: true,
    });

    await channel.bindQueue(
      DEAD_LETTER_QUEUE,
      DEAD_LETTER_EXCHANGE,
      QUEUES.TRANSACTIONS_PROCESSING,
    );

    // Create main transactions processing queue with dead letter config
    await channel.assertQueue(QUEUES.TRANSACTIONS_PROCESSING, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
        "x-dead-letter-routing-key": QUEUES.TRANSACTIONS_PROCESSING,
      },
    });

    console.log(
      `RabbitMQ: Queue ${QUEUES.TRANSACTIONS_PROCESSING} setup complete`,
    );

    // Cache the channel for reuse
    transactionsChannel = channel;
    return channel;
  } catch (error) {
    console.error("RabbitMQ: Failed to setup transactions queue:", error);
    await closeChannel(channel);
    throw error;
  }
}

/**
 * Publish message to transactions processing queue
 * @param message - Message content to publish
 * @param correlationId - Correlation ID for tracking
 * @returns true if message was published successfully
 */
export async function publishToTransactionsQueue(
  message: object,
  correlationId: string,
): Promise<boolean> {
  const channel = await setupTransactionsQueue();

  try {
    const messageBuffer = Buffer.from(JSON.stringify(message));

    const published = channel.publish(
      "", // default exchange
      QUEUES.TRANSACTIONS_PROCESSING,
      messageBuffer,
      {
        persistent: true, // Message persistence
        correlationId,
        contentType: "application/json",
        timestamp: Date.now(),
      },
    );

    if (!published) {
      console.warn("RabbitMQ: Channel buffer is full, message queued");
    }

    return published;
  } catch (error) {
    console.error("RabbitMQ: Failed to publish message:", error);
    throw error;
  }
}

/**
 * Health check: Verify RabbitMQ connection and channel creation
 * Reuses transactions channel to avoid creating/destroying test channels
 * @returns Health status object
 */
export async function checkRabbitMQHealth(): Promise<{
  healthy: boolean;
  error?: string;
  queues?: { name: string; messageCount: number; consumerCount: number }[];
}> {
  try {
    await getRabbitMQConnection();

    // Reuse transactions channel for health check (avoid creating test channels)
    const channel = await setupTransactionsQueue();

    // Check transactions queue status
    let queues: {
      name: string;
      messageCount: number;
      consumerCount: number;
    }[] = [];
    try {
      const queueInfo = await channel.checkQueue(
        QUEUES.TRANSACTIONS_PROCESSING,
      );
      queues.push({
        name: QUEUES.TRANSACTIONS_PROCESSING,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
      });
    } catch {
      // Queue may not exist yet, that's okay
    }

    // Don't close the channel - we're reusing it
    return { healthy: true, queues };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Export connection for direct use (after initialization)
export { connection };
