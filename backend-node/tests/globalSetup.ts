/** Vitest globalSetup - runs once before the whole suite. Seeds the
 * database (idempotent, safe to rerun) so integration/evaluation tests
 * have deterministic data to assert against, mirroring the Python
 * sibling backend's autouse session fixture.
 */
export async function setup(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("npx", ["tsx", "src/scripts/seedDemo.ts"], { stdio: "inherit", shell: true });
}
