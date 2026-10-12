import Redis from "ioredis";
import { env } from "./env";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,

  connectTimeout: 5_000,

  /*
   * Must be greater than the longest BLOCK used by
   * XREADGROUP (currently 5 seconds).
   */
  commandTimeout: 9_000,

  /*
   * Retry an individual command a limited number of times.
   *
   * This is NOT the connection retry limit.
   */
  maxRetriesPerRequest: 3,

  /*
   * Connection-level exponential backoff.
   *
   * ioredis keeps reconnecting while this returns a number.
   * Returning null would stop reconnect attempts.
   */
  retryStrategy(times) {
    const maxDelay = 5_000;
    const exponentialDelay = Math.min(250 * Math.pow(2, times - 1), maxDelay);

    const jitter = Math.floor(Math.random() * 250);

    return exponentialDelay + jitter;
  },

  /*
   * Important for our failure-handling strategy.
   *
   * Commands issued while Redis is unavailable should fail
   * instead of silently sitting in an offline queue.
   */
  enableOfflineQueue: false,
});
