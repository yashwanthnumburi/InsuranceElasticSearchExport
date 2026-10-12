import { asyncLocalStorage, RequestContext } from "./requestContext";

export function runWithContext<T>(
  context: RequestContext,
  callback: () => Promise<T>,
): Promise<T> {
  return asyncLocalStorage.run(context, callback);
}
