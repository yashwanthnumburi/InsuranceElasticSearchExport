import { asyncLocalStorage, RequestContext } from "./requestContext";

export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId;
}

export function getLogContext(): Partial<RequestContext> {
  const context = asyncLocalStorage.getStore();

  if (!context) {
    return {};
  }

  const { traceId, jobId, messageId, workerId } = context;

  return {
    ...(traceId ? { traceId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(messageId ? { messageId } : {}),
    ...(workerId ? { workerId } : {}),
  };
}
