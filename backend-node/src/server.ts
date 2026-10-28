import "./config/loadEnv.js";
import { createApp } from "./app.js";
import { getSettings } from "./config/settings.js";
import { closePool } from "./db/pool.js";
import { loadBundle, validateBundle } from "./knowledge/loader.js";
import { TOOL_SPECS } from "./mcp/registry.js";

const settings = getSettings();

const knowledgeBundle = loadBundle(settings.knowledgeRoot);
const issues = validateBundle(knowledgeBundle, new Set(TOOL_SPECS.map((t) => t.name)));
const errors = issues.filter((i) => i.severity === "error");
if (errors.length > 0) {
  console.error(`OKF bundle has ${errors.length} conformance error(s) - refusing to start:`);
  for (const issue of errors) console.error(`  [${issue.path}] ${issue.message}`);
  process.exit(1);
}
console.log(
  `Loaded OKF knowledge bundle: ${knowledgeBundle.concepts.size} concepts from ${knowledgeBundle.root}`,
);

const app = createApp(knowledgeBundle);

const server = app.listen(settings.port, () => {
  console.log(`Logistics AI backend (Node) listening on http://localhost:${settings.port}`);
  console.log(`AUTH_MODE=${settings.authMode}  APP_ENV=${settings.appEnv}  gemini=${settings.geminiAvailable}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
