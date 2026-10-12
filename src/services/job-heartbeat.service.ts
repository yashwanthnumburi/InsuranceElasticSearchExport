import { redis as redisClient } from "../config/redis";
import { logger } from "../logger";

export class JobHeartbeatService {
  private readonly STREAM_NAME = "export:jobs";
  private readonly GROUP_NAME = "export-workers";
  private readonly HEARTBEAT_INTERVAL = 10_000;
  private timer?: NodeJS.Timeout;

  start(messageId: string, consumerName: string): void {
    void this.heartbeat(messageId, consumerName);
    this.timer = setInterval(() => {
      void this.heartbeat(messageId, consumerName);
    }, this.HEARTBEAT_INTERVAL);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async heartbeat(messageId: string, consumerName: string): Promise<void> {
    try {
      await redisClient.xclaim(
        this.STREAM_NAME,
        this.GROUP_NAME,
        consumerName,
        0,
        messageId,
      );
    } catch (error) {
      logger.error("Redis job heartbeat failed", {
        operation: "REDIS_HEARTBEAT",
        messageId,
        error,
      });
    }
  }
}
