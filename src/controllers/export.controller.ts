import { Request, Response, NextFunction } from "express";

import { ExportRequest } from "../types/exports";

import { JobService } from "../services/job.service";

import { ExportQueueService } from "../services/export-queue.service";

import { IdempotencyService } from "../services/idempotency.service";

import { generateJobId } from "../utils/jobId";
import { logger } from "../logger";
import { getTraceId } from "../context/getTraceId";

const jobService = new JobService();

const queueService = new ExportQueueService();

const idempotencyService = new IdempotencyService();

export class ExportController {
  async exportClaims(
    req: Request<{}, {}, ExportRequest>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      /*
       * Client-provided idempotency key.
       */
      const idempotencyKey = req.header("Idempotency-Key");

      if (!idempotencyKey) {
        return res.status(400).json({
          error: "Idempotency-Key header is required",
        });
      }

      /*
       * Generate a new job ID.
       *
       * The ID is only used if this is
       * actually a new request.
       */
      const generatedJobId = generateJobId();

      /*
       * Lua atomically: no transactional gaurantee, but atomic.
       *
       * 1. Checks idempotency key
       * 2. Creates idempotency record
       * 3. Creates job metadata
       *
       * If the request already exists,
       * it returns the existing job.
       */
      const result = await idempotencyService.createOrGetJob(
        idempotencyKey,
        generatedJobId,
      );

      const { jobId, jobKey, status, created } = result;

      /*
       * Existing idempotent request.
       *
       * DO NOT create another stream message.
       */
      if (!created) {
        const job = await jobService.getJob(jobKey);
        logger.info("Idempotent export request", {
          operation: "EXPORT_CREATE",
          idempotent: true,
          jobId,
          jobStatus: job.status ?? status ?? "QUEUED",
          streamMessageId: job.streamMessageId ?? null,
        });
        return res.status(202).json({
          jobId,
          status: job.status ?? "QUEUED",
          messageId: job.streamMessageId ?? null,
          idempotent: true,
        });
      }

      /*
       * New job.
       *
       * At this point Redis contains:
       *
       * streamStatus = PENDING
       */
      const messageId = await queueService.enqueue({
        jobId,
        jobKey,
        traceId: getTraceId(),
      });

      logger.info("Export job enqueued", {
        operation: "EXPORT_ENQUEUE",
        jobId,
        messageId,
      });

      /*
       * XADD succeeded.
       *
       * Update:
       *
       * PENDING → PUBLISHED
       */
      await jobService.updateJob(jobKey, {
        streamStatus: "PUBLISHED",

        streamMessageId: messageId,
      });

      logger.info("Export request accepted", {
        operation: "EXPORT_CREATE",
        jobId,
        messageId,
        idempotent: false,
      });

      /*
       * Job has now been successfully
       * published to the Redis Stream.
       */
      return res.status(202).json({
        jobId,
        status: "QUEUED",
        messageId,
        idempotent: false,
      });
    } catch (error) {
      logger.error("Export request failed", {
        operation: "EXPORT_CREATE",
        error,
      });

      next(error);
    }
  }
}
