/** `pg` parses a Postgres DATE column into a JS Date at local-timezone
 * midnight by default - serializing that back out (JSON.stringify,
 * string comparison) shifts it by the local UTC offset (e.g.
 * "2026-09-18" becomes "2026-09-17T18:30:00.000Z" under IST), which
 * silently corrupts every date-string comparison and API response in
 * this codebase (every repository/service here treats DATE columns as
 * plain 'YYYY-MM-DD' strings). Overriding the type parser for OID 1082
 * (date) to pass the raw text through unparsed fixes this at the
 * source - must be imported before any Pool is constructed, so it's
 * pulled in by config/loadEnv.ts, which every entrypoint imports first.
 */
import pg from "pg";

const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value: string) => value);
