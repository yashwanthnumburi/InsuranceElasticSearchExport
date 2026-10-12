import { redis as redisClient } from "../config/redis";
import { logger } from "../logger";
import { ExportWorker } from "../services/export.worker";

async function waitForRedisReady(): Promise<void> {
  if (redisClient.status === "ready") {
    return;
  }

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

async function main(): Promise<void> {
  try {
    await waitForRedisReady();

    logger.info("Worker Redis connection ready", { operation: "WORKER_STARTUP" });

    const worker = new ExportWorker();

    await worker.start();
  } catch (error) {
    logger.error("Worker fatal startup error", { operation: "WORKER_STARTUP", error });
    process.exit(1);
  }
}

main();
