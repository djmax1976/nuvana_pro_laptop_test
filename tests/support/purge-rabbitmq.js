/**
 * Purge RabbitMQ queues before running tests
 * This eliminates flaky tests caused by stale messages from previous test runs
 */
const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUES = [
  'transactions.processing',
  'transactions.dead-letter',
];

async function purgeQueues() {
  let connection;
  try {
    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);

    for (const queue of QUEUES) {
      // Create a fresh channel for each queue to handle 404 errors gracefully
      let channel;
      try {
        channel = await connection.createChannel();
        const result = await channel.purgeQueue(queue);
        console.log(`✓ Purged ${result.messageCount} messages from ${queue}`);
        await channel.close();
      } catch (err) {
        // Queue might not exist yet, that's OK
        console.log(`○ Queue ${queue} does not exist or is empty (OK)`);
      }
    }

    console.log('✓ RabbitMQ queues purged successfully');
  } catch (error) {
    // Rethrow connection errors so the outer catch can handle them
    // This allows the script to exit with a non-zero code on critical failures
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

(async () => {
  try {
    await purgeQueues();
    process.exit(0);
  } catch (err) {
    console.error('Error purging queues:', err);
    process.exit(1);
  }
})();
