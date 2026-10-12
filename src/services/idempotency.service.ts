import { redis as redisClient } from "../config/redis";

export interface CreateJobResult {
  jobId: string;
  jobKey: string;
  status: string;
  created: boolean;
}

export class IdempotencyService {
  private readonly TTL_SECONDS = 24 * 60 * 60;

  private readonly script = `
    local existingJobId = redis.call("GET", KEYS[1])

    -- Idempotency key already exists
    if existingJobId then

      local existingJobKey =
        "export:job:{" .. ARGV[4] .. "}:" .. existingJobId

      local status = redis.call(
        "HGET",
        existingJobKey,
        "status"
      )

      return {
        existingJobId,
        status or "",
        0
      }
    end

    -- New job
    redis.call(
      "SET",
      KEYS[1],
      ARGV[1],
      "EX",
      ARGV[2]
    )

    redis.call(
      "HSET",
      KEYS[2],
      "jobId", ARGV[1],
      "status", "QUEUED",
      "progress", "0",
      "records", "0",
      "retryCount", "0",
      "streamStatus", "PENDING",
      "createdAt", ARGV[3],
      "updatedAt", ARGV[3]
    )

    return {
      ARGV[1],
      "QUEUED",
      1
    }
  `;

  async createOrGetJob(
    idempotencyKey: string,
    jobId: string,
  ): Promise<CreateJobResult> {
    const timestamp = new Date().toISOString();

    const idempotencyRedisKey = `idempotency:{${idempotencyKey}}`;

    const jobRedisKey = `export:job:{${idempotencyKey}}:${jobId}`;

    const result = (await redisClient.eval(
      this.script,
      2,
      idempotencyRedisKey,
      jobRedisKey,
      jobId,
      String(this.TTL_SECONDS),
      timestamp,
      idempotencyKey,
    )) as [string, string, number];

    const existingOrCreatedJobId = result[0];
    const status = result[1];
    const created = result[2] === 1;

    /*
     * Important:
     * For an idempotent request, result[0] is the EXISTING
     * jobId, not the newly generated jobId.
     *
     * Therefore construct the jobKey using result[0].
     */
    const actualJobKey = `export:job:{${idempotencyKey}}:${existingOrCreatedJobId}`;

    return {
      jobId: existingOrCreatedJobId,
      jobKey: actualJobKey,
      status,
      created,
    };
  }
}
