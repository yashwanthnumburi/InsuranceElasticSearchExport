import winston from "winston";
import { getLogContext } from "../context/getTraceId";

export const traceFormat = winston.format((info) => {
  Object.assign(info, getLogContext());

  const error = info.error;

  if (error instanceof Error) {
    info.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return info;
});

export const logger = winston.createLogger({
  level: "info",

  defaultMeta: {
    service: "insurance-export-service",
  },

  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    traceFormat(),
    winston.format.json(),
  ),

  transports: [new winston.transports.Console()],
});
