/** Development-only identity resolution.
 *
 * THIS IS NOT PRODUCTION AUTHENTICATION. An `X-Demo-User` header names
 * one of a small, server-side fixed set of demo users, each pinned to a
 * tenant (and, for a "customer" role, a customer) below. There is no
 * password, token, or session - anyone who can reach the API can claim
 * any listed demo identity. Must be disabled whenever APP_ENV=production
 * - see src/auth/dependencies.ts. Mirrors app.auth.dev_auth in the
 * Python backend, including identical deterministic ids.
 */
import { deterministicId } from "../db/seedIds.js";
import type { AuthenticatedUser } from "./models.js";

export const TENANT_PRIMARY = "11111111-1111-1111-1111-111111111111";
export const TENANT_SECONDARY = "22222222-2222-2222-2222-222222222222";

export const CUSTOMER_ACME = deterministicId("customer", "primary", "acme");
export const CUSTOMER_BHARAT = deterministicId("customer", "primary", "bharat");
export const CUSTOMER_OCEANIC = deterministicId("customer", "primary", "oceanic");

export const DEV_USERS: Record<string, AuthenticatedUser> = {
  "demo-ops-primary": {
    userId: "demo-ops-primary",
    displayName: "Primary Tenant Ops User",
    tenantId: TENANT_PRIMARY,
    tenantName: "Primary Logistics Co",
    role: "operator",
    customerId: null,
  },
  "demo-ops-secondary": {
    userId: "demo-ops-secondary",
    displayName: "Secondary Tenant Ops User",
    tenantId: TENANT_SECONDARY,
    tenantName: "Secondary Freight Co",
    role: "operator",
    customerId: null,
  },
  "demo-customer-acme": {
    userId: "demo-customer-acme",
    displayName: "Acme Traders (Customer A)",
    tenantId: TENANT_PRIMARY,
    tenantName: "Primary Logistics Co",
    role: "customer",
    customerId: CUSTOMER_ACME,
  },
  "demo-customer-bharat": {
    userId: "demo-customer-bharat",
    displayName: "Bharat Textiles (Customer B)",
    tenantId: TENANT_PRIMARY,
    tenantName: "Primary Logistics Co",
    role: "customer",
    customerId: CUSTOMER_BHARAT,
  },
  "demo-customer-oceanic": {
    userId: "demo-customer-oceanic",
    displayName: "Oceanic Imports (Customer C)",
    tenantId: TENANT_PRIMARY,
    tenantName: "Primary Logistics Co",
    role: "customer",
    customerId: CUSTOMER_OCEANIC,
  },
};

export const DEFAULT_DEV_USER_KEY = "demo-customer-acme";

export function resolveDevUser(headerValue: string | undefined): AuthenticatedUser | null {
  const key = headerValue || DEFAULT_DEV_USER_KEY;
  return DEV_USERS[key] ?? null;
}
