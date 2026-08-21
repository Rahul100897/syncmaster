import { Queue, type QueueOptions } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";

/**
 * Shared Redis connection for all BullMQ queues and workers.
 * BullMQ requires `maxRetriesPerRequest: null` on the connection.
 */
const redisOptions: RedisOptions = { maxRetriesPerRequest: null };

export const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  redisOptions,
);

const queueOptions: QueueOptions = { connection };

/** Queue for all product/inventory/metafield/metaobject/order sync jobs. */
export const syncQueue = new Queue("sync", queueOptions);

/** Queue for snapshot creation + restore jobs. */
export const snapshotQueue = new Queue("snapshot", queueOptions);
