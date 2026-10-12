import { randomUUID } from "node:crypto";

import { redis as redisClient } from "../config/redis";
import { JobService } from "./job.service";
import { S3Service } from "./s3.service";
import { logger } from "../logger";
import { runWithContext } from "../context/runWithContext";

export class RecoveryWorker {
  private readonly STREAM_NAME = "export:jobs";
  private readonly GROUP_NAME = "export-workers";
  private readonly DLQ_STREAM = "export:jobs:dlq";
  private readonly CONSUMER_NAME = `recovery-worker-${process.pid}`;
  private readonly MIN_IDLE_TIME = 30_000;
  private readonly MAX_RETRIES = 3;
  private readonly INTERVAL = 10_000;
  private readonly jobService = new JobService();
  private readonly s3Service = new S3Service();
  private running = true;
  private redisFailureCount = 0;

  async start(): Promise<void> {
    this.registerShutdown();

    logger.info("Recovery worker started", {
      operation: "WORKER_START",
      workerId: this.CONSUMER_NAME,
      stream: this.STREAM_NAME,
      consumerGroup: this.GROUP_NAME,
      minIdleMs: this.MIN_IDLE_TIME,
      maxRetries: this.MAX_RETRIES,
    });

    while (this.running) {
      try {
        await this.recover();
        this.redisFailureCount = 0;
      } catch (error) {
        if (this.running) {
          this.redisFailureCount++;
          const delay = this.getRedisBackoffDelay(this.redisFailureCount);

          logger.error("Recovery worker Redis operation failed", {
            operation: "REDIS_RECOVERY",
            attempt: this.redisFailureCount,
            backoffMs: delay,
            error,
          });

          await this.sleep(delay);
        }
      }

      if (this.running && this.redisFailureCount === 0) {
        await this.sleep(this.INTERVAL);
      }
    }

    logger.info("Recovery worker stopped", {
      operation: "WORKER_STOP",
      workerId: this.CONSUMER_NAME,
    });
  }

  private async recover(): Promise<void> {
    let startId = "0-0";

    while (this.running) {
      const result = await redisClient.xautoclaim(
        this.STREAM_NAME,
        this.GROUP_NAME,
        this.CONSUMER_NAME,
        this.MIN_IDLE_TIME,
        startId,
        "COUNT",
        10,
      );

      const nextId = result[0] as string;
      const messages = result[1] as Array<[string, string[]]>;

      if (messages.length === 0) break;

      logger.info("Pending export messages claimed", {
        operation: "REDIS_XAUTOCLAIM",
        count: messages.length,
        startId,
        nextId,
      });

      for (const [messageId, fields] of messages) {
        await this.handle(messageId, fields);
      }

      startId = nextId;
      if (startId === "0-0") break;
    }
  }

  private async handle(messageId: string, fields: string[]): Promise<void> {
    const message = this.parse(fields);
    const jobId = message.jobId;
    const jobKey = message.jobKey;
    const traceId = message.traceId ?? randomUUID();

    if (!jobId || !jobKey) {
      logger.error("Invalid recovery stream message", {
        operation: "RECOVERY_MESSAGE_INVALID",
        messageId,
        fields,
      });
      await this.ack(messageId);
      return;
    }

    await runWithContext(
      {
        traceId,
        jobId,
        messageId,
        workerId: this.CONSUMER_NAME,
      },
      async () => {
        const job = await this.jobService.getJob(jobKey);
        const status = job.status;

        logger.info("Recovery processing started", {
          operation: "RECOVERY_PROCESS",
          jobStatus: status,
          retryCount: message.retryCount ?? "0",
        });

        if (status === "COMPLETED") {
          await this.ack(messageId);

          logger.info("Completed job found during recovery; ACKed", {
            operation: "RECOVERY_RECONCILE",
          });
          return;
        }

        if (status === "PROCESSING") {
          const fileName = `claims-${jobId}.csv`;
          const exists = await this.s3Service.exists(fileName);

          if (exists) {
            const location = this.s3Service.getLocation(fileName);

            await this.jobService.updateJob(jobKey, {
              status: "COMPLETED",
              progress: 100,
              file: location,
            });

            await this.ack(messageId);

            logger.info("Job reconciled as completed from S3", {
              operation: "RECOVERY_RECONCILE",
              fileName,
            });
            return;
          }
        }

        const retryCount = Number(message.retryCount ?? "0") + 1;

        logger.warn("Export retry scheduled", {
          operation: "RECOVERY_RETRY",
          retryCount,
          maxRetries: this.MAX_RETRIES,
        });

        if (retryCount > this.MAX_RETRIES) {
          await this.moveToDLQ(messageId, jobId, jobKey, retryCount, traceId);
          return;
        }

        const newMessageId = await redisClient.xadd(
          this.STREAM_NAME,
          "*",
          "jobId",
          jobId,
          "jobKey",
          jobKey,
          "retryCount",
          String(retryCount),
          "recoveredFrom",
          messageId,
          "traceId",
          traceId,
        );

        await this.ack(messageId);

        logger.info("Export job requeued", {
          operation: "RECOVERY_REQUEUE",
          newMessageId,
          recoveredFrom: messageId,
          retryCount,
        });
      },
    );
  }

  private async moveToDLQ(
    messageId: string,
    jobId: string,
    jobKey: string,
    retryCount: number,
    traceId: string,
  ): Promise<void> {
    const dlqMessageId = await redisClient.xadd(
      this.DLQ_STREAM,
      "*",
      "jobId",
      jobId,
      "jobKey",
      jobKey,
      "retryCount",
      String(retryCount),
      "originalMessageId",
      messageId,
      "reason",
      "MAX_RETRIES_EXCEEDED",
      "failedAt",
      new Date().toISOString(),
      "traceId",
      traceId,
    );

    await this.ack(messageId);

    logger.error("Export job moved to DLQ", {
      operation: "RECOVERY_DLQ",
      dlqMessageId,
      retryCount,
      reason: "MAX_RETRIES_EXCEEDED",
    });
  }

  private parse(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      if (key !== undefined && value !== undefined) result[key] = value;
    }
    return result;
  }

  private async ack(messageId: string): Promise<void> {
    await redisClient.xack(this.STREAM_NAME, this.GROUP_NAME, messageId);
    logger.info("Recovery message acknowledged", {
      operation: "REDIS_XACK",
    });
  }

  private getRedisBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(250 * Math.pow(2, attempt - 1), 5_000);
    return exponentialDelay + Math.floor(Math.random() * 250);
  }

  private registerShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info("Recovery worker shutdown requested", {
        operation: "WORKER_SHUTDOWN",
        signal,
      });
      this.running = false;
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
