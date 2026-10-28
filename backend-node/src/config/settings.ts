import { z } from "zod";

/** Central app configuration, validated from process.env at startup.
 * Nothing here is a secret default - real credentials must come from the
 * environment. Missing optional credentials (Gemini) are tolerated and
 * surfaced as explicit "unavailable" behavior, never fabricated.
 */
const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_MODE: z.enum(["dev", "oidc"]).default("dev"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z
    .string()
    .default("postgresql://app_runtime_node:app_runtime_dev_password@localhost:5433/logistics_demo_node"),
  ADMIN_DATABASE_URL: z
    .string()
    .default("postgresql://logistics:logistics_dev_password@localhost:5433/logistics_demo_node"),

  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  DEMO_TENANT_ID: z.string().default("11111111-1111-1111-1111-111111111111"),

  ALLOW_DESTRUCTIVE_DB_OPERATIONS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  KNOWLEDGE_ROOT: z.string().default("../knowledge"),
  KNOWLEDGE_MAX_CONTEXT_CHARS: z
    .string()
    .default("12000")
    .transform((v) => Number.parseInt(v, 10)),

  PORT: z
    .string()
    .default("8001")
    .transform((v) => Number.parseInt(v, 10)),

  MCP_TRANSPORT: z.enum(["streamable-http", "stdio"]).default("streamable-http"),
  MCP_SERVER_HOST: z.string().default("127.0.0.1"),
  MCP_SERVER_PORT: z
    .string()
    .default("8766")
    .transform((v) => Number.parseInt(v, 10)),
});

export type Settings = {
  appEnv: "development" | "test" | "production";
  authMode: "dev" | "oidc";
  logLevel: string;
  databaseUrl: string;
  adminDatabaseUrl: string;
  frontendOrigin: string;
  demoTenantId: string;
  allowDestructiveDbOperations: boolean;
  geminiApiKey: string;
  geminiModel: string;
  knowledgeRoot: string;
  knowledgeMaxContextChars: number;
  port: number;
  mcpTransport: "streamable-http" | "stdio";
  mcpServerHost: string;
  mcpServerPort: number;
  isProduction: boolean;
  geminiAvailable: boolean;
};

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const env = parsed.data;

  cached = {
    appEnv: env.APP_ENV,
    authMode: env.AUTH_MODE,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    adminDatabaseUrl: env.ADMIN_DATABASE_URL,
    frontendOrigin: env.FRONTEND_ORIGIN,
    demoTenantId: env.DEMO_TENANT_ID,
    allowDestructiveDbOperations: env.ALLOW_DESTRUCTIVE_DB_OPERATIONS,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    knowledgeRoot: env.KNOWLEDGE_ROOT,
    knowledgeMaxContextChars: env.KNOWLEDGE_MAX_CONTEXT_CHARS,
    port: env.PORT,
    mcpTransport: env.MCP_TRANSPORT,
    mcpServerHost: env.MCP_SERVER_HOST,
    mcpServerPort: env.MCP_SERVER_PORT,
    isProduction: env.APP_ENV === "production",
    geminiAvailable: env.GEMINI_API_KEY.length > 0,
  };
  return cached;
}

/** Test-only: clears the cached settings so a test can mutate process.env
 * and have getSettings() re-read it. */
export function resetSettingsCache(): void {
  cached = null;
}
