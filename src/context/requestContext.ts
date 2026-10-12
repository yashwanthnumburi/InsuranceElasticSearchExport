import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  traceId: string;
  jobId?: string;
  messageId?: string;
  workerId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
