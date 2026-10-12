import { esClient } from "../config/elastic";
import { SearchAfterResponse } from "../types/exports";
import { logger } from "../logger";

export class ElasticsearchService {
  private readonly INDEX = "insurance-claims";
  private readonly MAX_RETRIES = 4;

  async openPit(): Promise<string> {
    const startedAt = process.hrtime.bigint();

    const response = await this.withRetry<any>(
      () =>
        esClient.openPointInTime({
          index: this.INDEX,
          keep_alive: "2m",
        }),
      "ES_OPEN_PIT",
    );

    logger.info("Elasticsearch PIT opened", {
      operation: "ES_OPEN_PIT",
      durationMs: this.durationMs(startedAt),
    });

    return response.id;
  }

  async closePit(pitId: string): Promise<void> {
    try {
      await this.withRetry(
        () => esClient.closePointInTime({ id: pitId }),
        "ES_CLOSE_PIT",
      );

      logger.info("Elasticsearch PIT closed", {
        operation: "ES_CLOSE_PIT",
      });
    } catch (error) {
      logger.error("Failed to close Elasticsearch PIT", {
        operation: "ES_CLOSE_PIT",
        error,
      });
    }
  }

  async searchAfter<T>(
    pitId: string,
    size: number,
    searchAfter?: unknown[],
  ): Promise<SearchAfterResponse<T>> {
    const startedAt = process.hrtime.bigint();

    const response = await this.withRetry<any>(
      () =>
        esClient.search<T>({
          size,
          pit: { id: pitId, keep_alive: "2m" },
          sort: [{ _shard_doc: "asc" }],
          search_after: searchAfter,
          track_total_hits: false,
        }),
      "ES_SEARCH",
    );

    const hits = response.hits.hits;

    logger.info("Elasticsearch batch read", {
      operation: "ES_SEARCH",
      batchSize: hits.length,
      durationMs: this.durationMs(startedAt),
      hasSearchAfter: hits.length > 0,
    });

    return {
      documents: hits.map((hit: { _source: T }) => hit._source as T),
      searchAfter: hits.length > 0 ? hits[hits.length - 1].sort : undefined,
    };
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.MAX_RETRIES + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt > this.MAX_RETRIES) {
          logger.error("Elasticsearch operation exhausted retries", {
            operation: operationName,
            attempt,
            maxRetries: this.MAX_RETRIES,
            error,
          });
          throw error;
        }

        const delay = this.getBackoffDelay(attempt);

        logger.warn("Elasticsearch operation failed; retrying", {
          operation: operationName,
          attempt,
          maxRetries: this.MAX_RETRIES,
          backoffMs: delay,
          error,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private getBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(250 * Math.pow(2, attempt - 1), 5_000);
    return exponentialDelay + Math.floor(Math.random() * 250);
  }

  private durationMs(startedAt: bigint): number {
    return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
