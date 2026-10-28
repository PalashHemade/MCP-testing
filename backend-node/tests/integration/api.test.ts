import { resolve } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { loadBundle } from "../../src/knowledge/loader.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const bundle = loadBundle(resolve(import.meta.dirname, "../../../knowledge"));
  const app = createApp(bundle);
  await new Promise<void>((done) => {
    server = app.listen(0, () => done());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe("Express API", () => {
  it("GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /api/v1/health/ready", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("chat requires authentication", async () => {
    const res = await fetch(`${baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-User": "not-a-real-user" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  it("chat happy path", async () => {
    const res = await fetch(`${baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-User": "demo-customer-acme" },
      body: JSON.stringify({ message: "Show me the details of TRIP-1001." }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Response wire format is snake_case (matches the existing React
    // frontend's contract - see src/api/caseTransform.ts), even though
    // internal TypeScript code stays camelCase.
    expect(body.tool_executions[0].tool_name).toBe("get_trip_details");
    expect(body.tool_executions[0].status).toBe("success");
  });

  it("list tools returns only customer-allowed tools for a customer login", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tools`, { headers: { "X-Demo-User": "demo-customer-acme" } });
    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(tools.length).toBe(7);
    expect(tools.some((t: { name: string }) => t.name === "get_vehicle_utilization")).toBe(false);
  });

  it("list tools returns all 10 for an operator login", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tools`, { headers: { "X-Demo-User": "demo-ops-primary" } });
    const tools = await res.json();
    expect(tools.length).toBe(10);
  });

  it("execute tool endpoint validates arguments", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tools/list_trips/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-User": "demo-ops-primary" },
      body: JSON.stringify({ limit: 999999 }),
    });
    expect(res.status).toBe(422);
  });

  it("execute unknown tool returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tools/delete_everything/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-User": "demo-ops-primary" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("customer cannot execute an operator-only tool", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tools/get_vehicle_utilization/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-User": "demo-customer-acme" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
