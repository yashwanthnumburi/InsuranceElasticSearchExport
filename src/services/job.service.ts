import { redis as redisClient } from "../config/redis";

export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export type StreamStatus = "PENDING" | "PUBLISHED";

export interface JobUpdate {
  status?: JobStatus;
  progress?: number;
  records?: number;
  file?: string;
  error?: string;
  retryCount?: number;
  streamStatus?: StreamStatus;
  streamMessageId?: string;
}

export interface CreateJobData {
  filters?: Record<string, unknown>;
}

export class JobService {
  private getKey(jobKey: string): string {
    return jobKey;
  }

  async createJob(jobKey: string, data?: CreateJobData): Promise<void> {
    const now = new Date().toISOString();

    const fields: Record<string, string> = {
      status: "QUEUED",
      progress: "0",
      records: "0",
      retryCount: "0",
      streamStatus: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    if (data?.filters) {
      fields.filters = JSON.stringify(data.filters);
    }

    await redisClient.hset(this.getKey(jobKey), fields);
  }

  async updateJob(jobKey: string, update: JobUpdate): Promise<void> {
    const key = this.getKey(jobKey);

    const fields: Record<string, string> = {
      updatedAt: new Date().toISOString(),
    };

    if (update.status !== undefined) {
      fields.status = update.status;
    }

    if (update.progress !== undefined) {
      fields.progress = String(update.progress);
    }

    if (update.records !== undefined) {
      fields.records = String(update.records);
    }

    if (update.file !== undefined) {
      fields.file = update.file;
    }

    if (update.error !== undefined) {
      fields.error = update.error;
    }

    if (update.retryCount !== undefined) {
      fields.retryCount = String(update.retryCount);
    }

    if (update.streamStatus !== undefined) {
      fields.streamStatus = update.streamStatus;
    }

    if (update.streamMessageId !== undefined) {
      fields.streamMessageId = update.streamMessageId;
    }

    /*
     * Intentionally allow Redis errors to propagate.
     *
     * The caller decides whether the operation is recoverable.
     */
    await redisClient.hset(key, fields);
  }

  async getJob(jobKey: string): Promise<Record<string, string>> {
    return redisClient.hgetall(this.getKey(jobKey));
  }
}
