import { randomUUID } from "node:crypto";

export function generateJobId(): string {
  return randomUUID();
}
