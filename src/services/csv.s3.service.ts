import { PassThrough } from "node:stream";
import { format } from "@fast-csv/format";

export class CsvService {
  private csvStream!: ReturnType<typeof format>;
  private passThrough!: PassThrough;

  create(): PassThrough {
    this.csvStream = format({
      headers: true,
    });

    this.passThrough = new PassThrough({
      // The highWaterMark option sets the maximum number of bytes
      // to store in the internal buffer before pausing the stream.
      // In this case, it's set to 64 KB (64 * 1024 bytes).
      highWaterMark: 64 * 1024,
    });

    this.csvStream.pipe(this.passThrough);

    return this.passThrough;
  }

  async write(documents: Record<string, unknown>[]): Promise<void> {
    if (!this.csvStream) {
      throw new Error(
        "CSV stream has not been initialized. Call create() first.",
      );
    }

    for (const document of documents) {
      const canContinue = this.csvStream.write(document);

      /*
       * Backpressure:
       *
       * If the downstream PassThrough/S3 consumer
       * cannot keep up, wait before writing more.
       */
      if (!canContinue) {
        await this.waitForDrain();
      }
    }
  }

  close(): void {
    if (!this.csvStream) {
      return;
    }

    this.csvStream.end();
  }

  private waitForDrain(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        this.csvStream.removeListener("drain", onDrain);

        this.csvStream.removeListener("error", onError);
      };

      this.csvStream.once("drain", onDrain);

      this.csvStream.once("error", onError);
    });
  }
}
