import type { PoolClient } from "pg";
import type { CustomerRow } from "../db/types.js";

export class CustomerRepository {
  constructor(private readonly client: PoolClient) {}

  async get(tenantId: string, customerId: string): Promise<CustomerRow | null> {
    const result = await this.client.query<CustomerRow>(
      "SELECT * FROM customers WHERE tenant_id = $1 AND customer_id = $2",
      [tenantId, customerId],
    );
    return result.rows[0] ?? null;
  }

  async listForTenant(tenantId: string): Promise<CustomerRow[]> {
    const result = await this.client.query<CustomerRow>(
      "SELECT * FROM customers WHERE tenant_id = $1 ORDER BY customer_name",
      [tenantId],
    );
    return result.rows;
  }
}
