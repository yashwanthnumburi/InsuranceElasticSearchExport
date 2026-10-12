import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough } from "node:stream";
import { env } from "../config/env";
import { logger } from "../logger";

export interface UploadResult {
  location: "s3" | "local";
  path: string;
}

export class S3Service {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async upload(stream: PassThrough, fileName: string): Promise<UploadResult> {
    const startedAt = process.hrtime.bigint();

    try {
      const result = await this.uploadToS3(stream, fileName);

      logger.info("S3 upload completed", {
        operation: "S3_UPLOAD",
        fileName,
        durationMs: this.durationMs(startedAt),
      });

      return { location: "s3", path: result };
    } catch (error) {
      logger.error("S3 upload failed", {
        operation: "S3_UPLOAD",
        fileName,
        durationMs: this.durationMs(startedAt),
        error,
      });
      throw error;
    }
  }

  async exists(fileName: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: env.AWS_S3_BUCKET,
          Key: fileName,
        }),
      );

      logger.info("S3 object found during reconciliation", {
        operation: "S3_HEAD",
        fileName,
        exists: true,
      });

      return true;
    } catch (error: any) {
      const statusCode = error?.$metadata?.httpStatusCode;
      const errorName = error?.name;

      if (
        statusCode === 404 ||
        errorName === "NotFound" ||
        errorName === "NoSuchKey"
      ) {
        logger.info("S3 object not found during reconciliation", {
          operation: "S3_HEAD",
          fileName,
          exists: false,
        });
        return false;
      }

      logger.error("S3 HEAD failed during reconciliation", {
        operation: "S3_HEAD",
        fileName,
        error,
      });

      throw error;
    }
  }

  getLocation(fileName: string): string {
    return `s3://${env.AWS_S3_BUCKET}/${fileName}`;
  }

  private async uploadToS3(stream: PassThrough, fileName: string): Promise<string> {
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: env.AWS_S3_BUCKET,
        Key: fileName,
        Body: stream,
        ContentType: "text/csv",
      },
      partSize: 5 * 1024 * 1024,
      queueSize: 2,
      leavePartsOnError: false,
    });

    await upload.done();
    return this.getLocation(fileName);
  }

  private durationMs(startedAt: bigint): number {
    return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  }
}
