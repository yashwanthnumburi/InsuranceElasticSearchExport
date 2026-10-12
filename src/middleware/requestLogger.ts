import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/health") {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    logger.info("HTTP request completed", {
      operation: "HTTP_REQUEST",
      http: {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
      },
      durationMs: Number(durationMs.toFixed(2)),
      client: {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    });
  });

  next();
}
