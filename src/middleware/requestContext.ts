import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

import { asyncLocalStorage } from "../context/requestContext";
import { HEADERS } from "../constants/headers";

// Correlation ID
//       │
//       └── C123
//           "These activities are related"

// Trace ID
//       │
//       └── T123
//            │
//            ├── Span S1
//            ├── Span S2
//            ├── Span S3
//            └── Span S4

// Correlation ID is a label for connecting related application activity.
// Trace ID identifies an entire distributed trace. Span ID identifies one operation within that trace.

function extractTraceId(req: Request): string {
  const traceParent = req.header(HEADERS.TRACE_PARENT);

  if (traceParent) {
    /**
     * W3C format:
     * 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
     *
     * We extract:
     * 4bf92f3577b34da6a3ce929d0e0e4736
     */
    // 00
    // │
    // ├── version

    // 4bf92f3577b34da6a3ce929d0e0e4736
    // │
    // ├── trace-id

    // 00f067aa0ba902b7
    // │
    // ├── parent-id / span-id

    // 01
    // │
    // └── trace flags

    const parts = traceParent.split("-");

    if (parts.length >= 4) {
      return parts[1];
    }
  }

  const correlationId = req.header(HEADERS.CORRELATION_ID);

  if (correlationId) {
    return correlationId;
  }

  return randomUUID();
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const traceId = extractTraceId(req);

  // AsyncLocalStorage provides request-scoped storage in Node.js,
  // allowing data to remain accessible throughout the asynchronous operations triggered by a request
  // without explicitly passing that data through every function.

  asyncLocalStorage.run(
    {
      traceId,
    },
    () => {
      res.setHeader(HEADERS.TRACE_ID, traceId);

      next();
    },
  );
}
