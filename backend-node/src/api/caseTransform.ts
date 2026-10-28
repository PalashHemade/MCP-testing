/** Converts response bodies from this backend's idiomatic camelCase
 * TypeScript objects into the snake_case wire format the existing React
 * frontend already expects (ported from the Python/FastAPI sibling
 * backend, which used Pydantic's default snake_case). Applied only at
 * the HTTP response boundary (see api/routes/*.ts) - internal code stays
 * idiomatic camelCase throughout; this keeps the frontend reusable
 * against either backend with zero changes, which matters more here
 * than internal naming purity.
 */
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toSnakeCase(item)) as T;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[camelToSnake(key)] = toSnakeCase(val);
    }
    return out as T;
  }
  return value;
}
