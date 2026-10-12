import { Client } from "@elastic/elasticsearch";
import { generateClaim } from "../src/generators/claimGenerator";
const client = new Client({
  node: process.env.ES_NODE ?? "http://localhost:9200",
});
const INDEX = "insurance-claims";
const TOTAL = 100000,
  BATCH = 500;
async function main() {
  let ops: any[] = [];
  for (let i = 1; i <= TOTAL; i++) {
    ops.push({ index: { _index: INDEX } });
    ops.push(generateClaim(i));
    if (i % BATCH === 0) {
      await client.bulk({ refresh: false, operations: ops });
      console.log(`Indexed ${i}`);
      ops = [];
    }
  }
  if (ops.length) await client.bulk({ refresh: false, operations: ops });
  await client.indices.refresh({ index: INDEX });
  console.log("Done");
}
main().catch(console.error);
