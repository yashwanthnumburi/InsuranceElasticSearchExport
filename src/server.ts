import app from "./app";

import { env } from "./config/env";
import { testConnections } from "./config/testConnections";
import { logger } from "./logger";

async function bootstrap() {
  await testConnections();

  app.listen(env.PORT, () => {
    logger.info("HTTP server started", {
      operation: "SERVER_START",
      port: env.PORT,
    });
  });
}

bootstrap();
