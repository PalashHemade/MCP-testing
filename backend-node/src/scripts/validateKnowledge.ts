import "../config/loadEnv.js";
import { getSettings } from "../config/settings.js";
import { loadBundle, validateBundle } from "../knowledge/loader.js";
import { TOOL_SPECS } from "../mcp/registry.js";

const settings = getSettings();
const bundle = loadBundle(settings.knowledgeRoot);
const registeredToolNames = new Set(TOOL_SPECS.map((t) => t.name));
const issues = validateBundle(bundle, registeredToolNames);

console.log(`Loaded ${bundle.concepts.size} concept files, ${bundle.indexes.size} index files from ${bundle.root}`);

const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");

for (const issue of warnings) {
  console.warn(`WARNING [${issue.path}] ${issue.message}`);
}
for (const issue of errors) {
  console.error(`ERROR [${issue.path}] ${issue.message}`);
}

console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length > 0) {
  process.exit(1);
}
