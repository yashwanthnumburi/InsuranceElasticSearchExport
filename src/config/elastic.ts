import { Client } from "@elastic/elasticsearch";
import { env } from "./env";

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,

  /*
   * Maximum time for a single Elasticsearch request.
   */
  requestTimeout: 10_000,

  /*
   * Let our application-level retry logic control retries.
   */
  maxRetries: 0,

  /*
   * Don't automatically resurrect nodes aggressively.
   */
  resurrectStrategy: "ping",

  pingTimeout: 3_000,
});
