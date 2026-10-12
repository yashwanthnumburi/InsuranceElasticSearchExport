import { randomUUID } from "node:crypto";

import { redis as redisClient } from "../config/redis";
import { ExportService } from "../services/export.service";
import { JobService } from "../services/job.service";
import { JobHeartbeatService } from "../services/job-heartbeat.service";
import { logger } from "../logger";
import { runWithContext } from "../context/runWithContext";

export class ExportWorker {
  private readonly STREAM_NAME = "export:jobs";
  private readonly GROUP_NAME = "export-workers";
  private readonly CONSUMER_NAME = `export-worker-${process.pid}`;
  private readonly exportService = new ExportService();
  private readonly jobService = new JobService();
  private running = true;
  private redisFailureCount = 0;

  async start(): Promise<void> {
    await this.createConsumerGroup();
    this.registerShutdown();

    logger.info("Export worker started", {
      operation: "WORKER_START",
      workerId: this.CONSUMER_NAME,
      stream: this.STREAM_NAME,
      consumerGroup: this.GROUP_NAME,
    });

    while (this.running) {
      try {
        await this.consume();
        this.redisFailureCount = 0;
      } catch (error) {
        if (this.running) {
          this.redisFailureCount++;
          const delay = this.getRedisBackoffDelay(this.redisFailureCount);

          logger.error("Export worker Redis operation failed", {
            operation: "REDIS_CONSUME",
            attempt: this.redisFailureCount,
            backoffMs: delay,
            error,
          });

          await this.sleep(delay);
        }
      }
    }

    logger.info("Export worker stopped", {
      operation: "WORKER_STOP",
      workerId: this.CONSUMER_NAME,
    });
  }

  private async createConsumerGroup(): Promise<void> {
    try {
      await redisClient.xgroup(
        "CREATE",
        this.STREAM_NAME,
        this.GROUP_NAME,
        "0",
        "MKSTREAM",
      );

      logger.info("Redis consumer group created", {
        operation: "REDIS_XGROUP_CREATE",
        consumerGroup: this.GROUP_NAME,
        stream: this.STREAM_NAME,
      });
    } catch (error: any) {
      if (error?.message?.includes("BUSYGROUP")) {
        logger.info("Redis consumer group already exists", {
          operation: "REDIS_XGROUP_CREATE",
          consumerGroup: this.GROUP_NAME,
          stream: this.STREAM_NAME,
        });
        return;
      }

      logger.error("Failed to create Redis consumer group", {
        operation: "REDIS_XGROUP_CREATE",
        error,
      });
      throw error;
    }
  }

  private async consume(): Promise<void> {
    const result = await redisClient.xreadgroup(
      "GROUP",
      this.GROUP_NAME,
      this.CONSUMER_NAME,
      "COUNT",
      1,
      "BLOCK",
      5000,
      "STREAMS",
      this.STREAM_NAME,
      ">",
    );

    if (!result) return;

    for (const [, messages] of result) {
      for (const [messageId, fields] of messages) {
        await this.processMessage(messageId, fields as string[]);
      }
    }
  }

  private async processMessage(messageId: string, fields: string[]): Promise<void> {
    const message = this.parseFields(fields);
    const jobId = message.jobId;
    const jobKey = message.jobKey;
    const traceId = message.traceId ?? randomUUID();

    if (!jobId || !jobKey) {
      logger.error("Invalid export stream message", {
        operation: "STREAM_MESSAGE_INVALID",
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
        const startedAt = process.hrtime.bigint();
        const heartbeat = new JobHeartbeatService();
        let exportCompleted = false;

        logger.info("Export job processing started", {
          operation: "EXPORT_PROCESS",
        });

        try {
          await this.jobService.updateJob(jobKey, {
            status: "PROCESSING",
          });

          heartbeat.start(messageId, this.CONSUMER_NAME);

          const result = await this.exportService.exportClaims({
            filters: {},
            jobId,
            onProgress: async (progress) => {
              await this.jobService.updateJob(jobKey, {
                progress: progress.progress,
                records: progress.records,
              });

              logger.info("Export progress updated", {
                operation: "EXPORT_PROGRESS",
                progress: progress.progress,
                records: progress.records,
              });
            },
          });

          exportCompleted = true;
          heartbeat.stop();

          await this.jobService.updateJob(jobKey, {
            status: "COMPLETED",
            progress: 100,
            records: result.records,
            file: result.location.path,
          });

          await this.ack(messageId);

          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

          logger.info("Export job completed", {
            operation: "EXPORT_PROCESS",
            records: result.records,
            file: result.location.path,
            durationMs: Number(durationMs.toFixed(2)),
          });
        } catch (error) {
          heartbeat.stop();

          const errorMessage = error instanceof Error ? error.message : String(error);

          if (exportCompleted) {
            logger.error("Export completed but final Redis state or ACK failed", {
              operation: "EXPORT_FINALIZE",
              error,
            });
            throw error;
          }

          logger.error("Export job failed", {
            operation: "EXPORT_PROCESS",
            error,
            errorMessage,
          });

          try {
            await this.jobService.updateJob(jobKey, {
              status: "FAILED",
              error: errorMessage,
            });
          } catch (stateError) {
            logger.error("Failed to persist FAILED job state", {
              operation: "JOB_STATE_UPDATE",
              error: stateError,
            });
          }
        }
      },
    );
  }

  private parseFields(fields: string[]): Record<string, string> {
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
    logger.info("Export stream message acknowledged", {
      operation: "REDIS_XACK",
    });
  }

  private getRedisBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(250 * Math.pow(2, attempt - 1), 5_000);
    return exponentialDelay + Math.floor(Math.random() * 250);
  }

  private registerShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info("Export worker shutdown requested", {
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
