import { ElasticsearchService } from "./elasticsearch.service";
import { CsvService } from "./csv.s3.service";
import { S3Service } from "./s3.service";

import { InsuranceClaim } from "../models/insuranceClaim";
import { logger } from "../logger";

export interface ExportProgress {
  progress: number;
  records: number;
}

export interface ExportRequest {
  jobId: string;
  filters: Record<string, unknown>;

  onProgress?: (progress: ExportProgress) => Promise<void>;
}

export class ExportService {
  private readonly elastic = new ElasticsearchService();

  private readonly csv = new CsvService();

  private readonly s3 = new S3Service();

  private readonly BATCH_SIZE = 1000;

  async exportClaims(request: ExportRequest) {
    const startedAt = process.hrtime.bigint();
    const csvStream = this.csv.create();

    const fileName = `claims-${request.jobId}.csv`;

    /*
     * Start upload before producing CSV.
     *
     * CSV writes will provide the data to this stream.
     */
    const uploadPromise = this.s3.upload(csvStream, fileName);

    let pitId: string | undefined;

    let searchAfter: unknown[] | undefined;

    let total = 0;

    try {
      /*
       * PIT creation is now inside the try.
       *
       * If ES is unavailable, finally will still execute.
       */
      pitId = await this.elastic.openPit();

      while (true) {
        const batch = await this.elastic.searchAfter<InsuranceClaim>(
          pitId,
          this.BATCH_SIZE,
          searchAfter,
        );

        if (batch.documents.length === 0) {
          break;
        }

        /*
         * Backpressure.
         */
        await this.csv.write(
          batch.documents as unknown as Record<string, unknown>[],
        );

        total += batch.documents.length;

        await request.onProgress?.({
          progress: 0,
          records: total,
        });

        searchAfter = batch.searchAfter;
      }

      /*
       * Close the CSV stream so S3 knows
       * there is no more data coming.
       */
      this.csv.close();

      /*
       * Wait for the complete multipart upload.
       */
      const location = await uploadPromise;

      logger.info("Export generation completed", {
        operation: "EXPORT_GENERATE",
        records: total,
        fileName,
        durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
      });

      return {
        records: total,
        file: fileName,
        location,
      };
    } finally {
      /*
       * Always close CSV stream.
       */
      try {
        this.csv.close();
      } catch (error) {
        logger.error("Failed to close CSV stream", {
          operation: "CSV_CLOSE",
          error,
        });
      }

      /*
       * Close PIT only if it was successfully opened.
       *
       * ElasticsearchService treats this as best effort.
       */
      if (pitId) {
        await this.elastic.closePit(pitId);
      }
    }
  }
}
