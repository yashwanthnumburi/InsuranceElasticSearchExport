import { Router } from "express";
import { esClient } from "../config/elastic";
import { redis } from "../config/redis";
import { logger } from "../logger";

const router = Router();

router.get("/", async (_, res) => {
  logger.debug("Health check requested", { operation: "HEALTH_CHECK" });

  try {
    await esClient.ping();

    const redisStatus = await redis.ping();

    return res.status(200).json({
      status: "UP",
      elasticsearch: "UP",
      redis: redisStatus,
    });
  } catch (error) {
    return res.status(500).json({
      status: "DOWN",
    });
  }
});

export default router;
