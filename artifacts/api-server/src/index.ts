import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot";
import { setBotClient } from "./bot-state";
import { loadCustomBaseUrl } from "./app-config";

// Load admin-configured base URL before starting (non-fatal)
loadCustomBaseUrl().catch(() => {});

const botClient = startBot();
setBotClient(botClient);

const rawPort = process.env["API_PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
