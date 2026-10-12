import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import healthRouter from "./routes/health.route";
import { requestContextMiddleware } from "./middleware/requestContext";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import exportRoutes from "./routes/export.route";

const app = express();

// Why express.json() middleware is needed?
// Socket
//       │
//       ▼
// Raw bytes
//       │
//       ▼
// JSON Parser
//       │
//       ▼
// JavaScript Object
//       │
//       ▼
// req.body

app.use(express.json());
app.use(requestContextMiddleware);
app.use(requestLogger);
app.use(cors());

// With Helmet
// HTTP/1.1 200 OK
// X-Content-Type-Options: nosniff
// X-DNS-Prefetch-Control: off
// Referrer-Policy: no-referrer
// Cross-Origin-Opener-Policy: same-origin
// Cross-Origin-Resource-Policy: same-origin
// Origin-Agent-Cluster: ?1

app.use(helmet());
app.use("/exports", exportRoutes);

// Compresses eligible HTTP responses (typically with gzip or Brotli)
// to reduce bandwidth usage and improve response times.
// It does compress based on the request's Accept-Encoding header.
app.use(compression());

app.use("/health", healthRouter);
app.use(errorHandler);

export default app;
