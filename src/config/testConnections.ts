import { esClient as elasticClient } from "./elastic";
import { redis as redisClient } from "./redis";
import { logger } from "../logger";

export async function testConnections(): Promise<void> {
  try {
    // Wait until Redis connection is ready
    if (redisClient.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        const cleanup = () => {
          redisClient.off("ready", onReady);
          redisClient.off("error", onError);
        };

        redisClient.once("ready", onReady);
        redisClient.once("error", onError);
      });
    }

    await redisClient.ping();

    logger.info("Redis connection verified", { operation: "REDIS_HEALTHCHECK" });

    await elasticClient.ping();

    logger.info("Elasticsearch connection verified", { operation: "ES_HEALTHCHECK" });
  } catch (error) {
    logger.error("Startup dependency check failed", {
      operation: "STARTUP_HEALTHCHECK",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}
