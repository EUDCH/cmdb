/**
 * Static-analysis regression guard — runtime config must NOT be read
 * via `import.meta.env.X` anywhere under `src/`.
 *
 * Astro/Vite resolves `import.meta.env.NON_PUBLIC` at build time and
 * inlines the literal string (or `undefined` when the var is unset
 * in the build environment). Production builds run `astro build` with
 * no runtime secrets present, so a bundle that reads `import.meta.env`
 * ships with `undefined` baked in and the first request that hits the
 * affected module throws. The runtime `process.env` is never consulted.
 *
 * The fix is to read `process.env.X` directly — but the build pipeline
 * passes type-check and tests today even when this rule is broken
 * (the `bun test` harness DOES map `import.meta.env` to `process.env`
 * at module-load, hiding the production-only divergence). This test
 * is the catch: if anyone re-introduces `import.meta.env.X` in `src/`,
 * the suite turns red before the regression reaches a deployment.
 *
 * The allowed accessors — all Astro/Vite build-time built-ins, never
 * user-defined env — are intentionally listed by name (see
 * `ALLOWED_ACCESSES` below) rather than allowlisted by prefix, so that
 * an accidental `import.meta.env.MY_NEW_SECRET` can't slip through
 * under a future `MODE`-shaped name. Update the set when Astro adds a
 * new built-in; never widen by prefix.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(import.meta.dir, "..", "..", "src");

const ALLOWED_ACCESSES = new Set<string>([
  // Astro/Vite build-time built-ins. None is a user-supplied secret:
  //   DEV / PROD — booleans inverted across `astro dev` vs the
  //                production bundle
  //   MODE       — the literal mode string (`development` / `production`)
  //   SSR        — true on server-rendered code paths
  //   BASE_URL   — the configured site base prefix (defaults to `/`)
  // Build-time inlining is the intended semantic for these; the rule
  // this test enforces only applies to runtime secrets / config.
  "import.meta.env.DEV",
  "import.meta.env.MODE",
  "import.meta.env.PROD",
  "import.meta.env.SSR",
  "import.meta.env.BASE_URL",
]);

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".astro")) {
      out.push(full);
    }
  }
  return out;
}

// Strip block + line comments so explanatory text mentioning the
// forbidden expression doesn't trip the regex. The pass is intentionally
// crude (does not respect string-literal boundaries) — accepts the tiny
// risk that a `//` inside a string mid-file ends a real expression early
// because the alternative (a full lexer) is wildly out of scope for a
// guard test and the only false-positive shape would be a string that
// contains the literal substring `import.meta.env.X`, which itself is
// suspicious enough to want flagged.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("env access discipline (src/)", () => {
  test("never reads runtime config via import.meta.env.X", () => {
    const files = walkSourceFiles(SRC_ROOT);
    const violations: string[] = [];
    const pattern = /import\.meta\.env\.[A-Za-z_][A-Za-z0-9_]*/g;
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const matches = stripped.match(pattern);
      if (!matches) continue;
      for (const m of matches) {
        if (ALLOWED_ACCESSES.has(m)) continue;
        violations.push(`${file.replace(SRC_ROOT, "src")}: ${m}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
