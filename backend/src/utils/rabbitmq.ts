import * as amqp from "amqplib";

// amqplib types have issues, using any for connection to work around type errors
// The runtime behavior is correct - connect() returns a Connection
type Connection = any;
type Channel = amqp.Channel;

let connection: Connection | null = null;
let channels: Set<Channel> = new Set();

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
 * Health check: Verify RabbitMQ connection and channel creation
 * @returns Health status object
 */
export async function checkRabbitMQHealth(): Promise<{
  healthy: boolean;
  error?: string;
}> {
  try {
    await getRabbitMQConnection();
    // Try to create and immediately close a test channel
    const testChannel = await createChannel();
    await closeChannel(testChannel);
    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Export connection for direct use (after initialization)
export { connection };
