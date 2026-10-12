import { redis as redisClient } from "../config/redis";

export interface ExportQueueMessage {
  jobId: string;
  jobKey: string;
  traceId?: string;
}

export class ExportQueueService {
  private readonly STREAM_NAME = "export:jobs";

  async enqueue(message: ExportQueueMessage): Promise<string> {
    const fields = [
      "jobId",
      message.jobId,
      "jobKey",
      message.jobKey,
    ];

    if (message.traceId) {
      fields.push("traceId", message.traceId);
    }

    const messageId = await redisClient.xadd(
      this.STREAM_NAME,
      "*",
      ...fields,
    );

    if (!messageId) {
      throw new Error("Failed to enqueue export job");
    }

    return messageId;
  }
}
