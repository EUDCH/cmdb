# AGENTS.md

> Repo-scoped instructions for any AI coding agent (Claude Code, GitHub Copilot, OpenAI Codex CLI, Cursor, Aider, etc.) working on this repository. Follows the [agents.md](https://agents.md) convention. Human contributors can read this top-to-bottom and get the same picture.

If a tool-specific file (`CLAUDE.md`, `.cursor/rules`, `.github/copilot-instructions.md`, etc.) is also present, that file should defer to this one for shared policy and only add tool-specific deltas (the spawned subprocess model, voice prosody, etc.).

## What this repo is

EDCH CMDB — Configuration Management Database for the [European Diamond Capacity Hub](https://www.eudch.eu), hosted by [OPERAS](https://www.operas-eu.org). v1 is EDCH-first; v2 will add an `operas` namespace additively (ADR-0002). Owner: a single OPERAS sysadmin (Baptiste). External contributors arrive once v1 is in place.

Stack: Bun · Astro (SSR) + HTMX · PostgreSQL · Drizzle ORM · OIDC (OPERAS ID) · GitHub Actions CI. Full picture in [`README.md`](README.md), per-decision detail in [`docs/adr/`](docs/adr/), operational runbook in [`docs/HANDOVER.md`](docs/HANDOVER.md).

## Setup

Requirements: **Bun** (≥ 1.3.x), **Docker** with Compose v2 (for the dev Postgres), **git**.

```sh
bun install                       # never npm / yarn / pnpm
cp .env.example .env              # AUTH_MODE=dev by default — no OIDC creds required
docker compose up -d              # dev Postgres on :5432, migration 0001 auto-applies
bun run dev                       # Astro dev server on http://127.0.0.1:4321
```

## Commands

| Task | Command |
| --- | --- |
| Install deps | `bun install --frozen-lockfile` |
| Dev server | `bun run dev` |
| Production build | `bun run build` |
| Start built server | `bun run start` |
| Type-check (Astro + TS) | `bun run check` |
| Type-check (TS only) | `bun run typecheck` |
| Run tests | `bun test` |
| Generate migration from schema | `bun run db:generate` |
| Apply migrations | `bun run db:migrate` |
| Seed public demo data | `bun run db:seed` |
| Seed real inventory (deployed instance only) | `bun run db:seed:local` |

Never invoke `npm`, `yarn`, or `pnpm` — this is a Bun project end-to-end.

## Code style

- **TypeScript everywhere** for application + test code. The only JS files in the repo are framework-imposed: `astro.config.mjs` at the root (Astro convention; the loader treats `.mjs` differently from `.ts`) and generated files under `.astro/`. Any new script or module goes in TypeScript.
- **No Python**. If a task seems to need a script, write it in TypeScript and run with `bun run script.ts`.
- **Path aliases**: `~/` resolves to `src/`, `@db/` resolves to `db/` (see `tsconfig.json`). Use the alias, not a relative `../../../`.
- **Module imports**: ESM only (`"type": "module"` in `package.json`); no `require()`.
- **No bare `any`**. If a type genuinely can't be expressed, narrow it at the boundary (e.g. `componentOf()` in `src/pages/services/index.astro`).
- **Lifecycle / namespace / dependency / host enums** are defined once in `db/schema.ts` and mirrored in `migrations/0001_init.sql`. If the two drift, the SQL wins and the TS schema must be corrected.
- **Comments**: only when the WHY isn't obvious from the code. Don't restate WHAT the code does; let names do that work.

## Change ceremony

**Every change ships via a PR**. No direct pushes to `main`, even one-line fixes.

- Branch names: `<type>/<short-slug>` — e.g. `feat/services-filter`, `fix/auth-banner-color`, `ci/<thing>`, `docs/<thing>`, `test/<thing>`.
- PR titles use [Conventional Commits](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`, `ci:`, `test:`, `refactor:`, `chore:`).
- PR body explains the **why**, not just the **what**. Reference issues with `Closes #N`.
- **CI must be fully green before merge** — all four jobs (`secrets`, `lint`, `build`, `test`).
- **Merge is the maintainer's call**, not the agent's. Agents open the PR, watch CI, iterate fixes until green, and then ping. Don't self-merge.
- **Squash-merge** is the default; preserve the PR number in the subject so `Closes` traces back.
- **Force-push** to a feature branch is fine while the PR is open (always `--force-with-lease`). **Never** force-push to `main`.
- **Always rebase open PRs when `main` advances.** GitHub's `MERGEABLE` flag only means "no textual conflict on a 3-way merge" — it does NOT mean CI was re-run against the post-merge state. After any PR merges to `main`, every other open PR must be rebased onto the new `main` and force-pushed (`--force-with-lease`) so CI re-runs against what would actually land. Auto-resolved rebases happen often, but the safety net is the policy, not the lucky outcome — a workflow-file change in the merged PR can semantically interact with an open PR's diff even when there's no textual conflict.

## Testing requirements

- **Every new feature lands with tests in the same PR**. No "I'll add tests later."
- **Every bug fix lands with a regression test** that fails before the fix and passes after.
- Tests live under `tests/`, mirror the module path. Example: `tests/routes/services.test.ts` covers `src/pages/services/*.astro`.
- The `test` CI job runs `bun test`; new tests are picked up automatically (filename suffix `.test.ts`).

**Test pyramid for this repo**, in priority order:

1. **Route integration tests** — render the page handler against a real Postgres, assert HTTP status + response body shape. Catches SSR + DB + middleware regressions in one shot, which is where this app's value lives. Example: `tests/routes/services.test.ts`.
2. **Library unit tests** — `src/lib/*` (db queries, session, auth helpers). Fast, no infra.
3. **End-to-end browser tests** — only once the HTMX-driven interactive paths exist; not warranted while pages are read-only.

**Principle, not exact CI shape:** integration tests need a real Postgres in CI (mocking the DB defeats the point of the route-integration tier). The current concrete shape (does the `test` job have a Postgres service, what image, what env vars, what step sequence) lives in `.github/workflows/ci.yml` — read that for ground truth and update it when the principle and the workflow diverge. Local dev uses `docker-compose.yml`. This file stays principle-level so it doesn't go stale on every infra tweak; if you're about to add a route integration test and the workflow doesn't yet provision a Postgres, that's a workflow change too, not a contradiction with this guidance.

**Test data:** fixtures used by integration tests live under `tests/` (separate from `db/seed.ts`, which is the demo seed shipped in the repo). Keep test fixtures minimal and deterministic so assertions stay stable as the demo seed grows.

### Running integration tests locally

Integration tests under `tests/routes/` need the SSR server reachable on `TEST_BASE_URL` (default `http://127.0.0.1:4322` — note: NOT the dev-server's `:4321`, to avoid hitting `bun run dev` against the real dev DB) AND a fresh deterministic fixture applied to its database. Reachability behavior depends on the run mode:

- **Local** (`CI` is anything other than the exact string `"true"` — including unset, `false`, or even `1`): a bare `bun test` is safe — if the server isn't up, the integration suite **skips itself** with a console message rather than failing. This lets contributors run `bun test` on a fresh clone without spinning up the integration stack first.
- **CI** (`CI` is exactly the string `"true"`, which GitHub Actions sets by default): an unreachable server is treated as a **hard failure** at module-import time, not a skip. A silent skip in CI would mask exactly the problem the workflow's start-server step is meant to catch. The check uses strict equality (`process.env.CI === "true"`), so other truthy values like `1` keep the local skip behavior — set `CI=true` explicitly if you want CI-style hard failures locally.

To exercise the suite locally:

```sh
# 1. Once — create a dedicated test database in the dev Postgres container
#    so the destructive reset never touches the dev `cmdb` inventory.
docker exec cmdb-postgres psql -U cmdb -d cmdb -c "CREATE DATABASE cmdb_test;"

# 2. Apply the deterministic test fixture (drops + recreates `public` schema,
#    applies every `migrations/*.sql` in lexicographic order so the test DB
#    stays aligned with whatever production runs, then inserts the fixture:
#    3 services / 2 hosts / 1 owner / 1 dep).
#
#    tests/setup-db.ts has a fail-closed safety guard against accidental
#    wipes of a production-shaped DB. It refuses unless either:
#      - the database name matches /^[a-z][a-z0-9_]*_(test|ci)$/i
#        (strict suffix regex — `cmdb_test`, `myapp_ci`, etc.; does NOT
#        match substrings inside ordinary names like `capacity`), OR
#      - CMDB_ALLOW_DESTRUCTIVE_RESET=1 is set (one-off recovery only;
#        never set it in normal local or CI flows).
#
#    There is no CI=true bypass: CI's workflow points DATABASE_URL at a
#    `cmdb_test` database so the same guard applies uniformly.
DATABASE_URL=postgresql://cmdb:cmdb@localhost:5432/cmdb_test \
  bun run tests/setup-db.ts

# 3a. Build the SSR server (foreground — must finish before step 3b).
#     Note: the build does NOT background. Backgrounding `bun run build &&
#     bun run start` would background the whole AND-list, so the next
#     command could fire before build/start has actually backgrounded.
DATABASE_URL=postgresql://cmdb:cmdb@localhost:5432/cmdb_test \
  AUTH_MODE=dev \
  SESSION_SECRET=local-test-secret-32-bytes-minimum-________ \
  bun run build

# 3b. Start the SSR server in the background (note the trailing `&` on
#     this line only — backgrounds just the `start` command).
DATABASE_URL=postgresql://cmdb:cmdb@localhost:5432/cmdb_test \
  AUTH_MODE=dev \
  SESSION_SECRET=local-test-secret-32-bytes-minimum-________ \
  PORT=4322 bun run start &

# 3c. Wait for the server's TCP port (the suite has its own reachability
#     probe but a short wait avoids running tests before the server is up).
until (echo > /dev/tcp/127.0.0.1/4322) 2>/dev/null; do sleep 0.2; done

# 4. Run the suite against the local server.
TEST_BASE_URL=http://127.0.0.1:4322 bun test
```

CI runs an equivalent sequence via the `test` workflow job; the GHA `services: postgres:` block provisions a `cmdb_test` database that the strict safety guard in `tests/setup-db.ts` accepts uniformly with local runs (no CI bypass).

## Security & secrets

- **Never commit secrets**. The CI `secrets` job runs `gitleaks` against the full history; a failure blocks merge.
- **Never push real inventory data**. `db/seed.local.ts` carries the real EDCH inventory and is gitignored; `db/seed.ts` carries demo data only. If you add real data to a public file by accident, surface it immediately so the history can be rewritten before the leak ages.
- **All URLs in fixtures and demo data** use the `.example.invalid` TLD (RFC 2606). Don't write real customer URLs into tests.
- **Production secrets never enter CI by construction.** No `${{ secrets.* }}` references in any job's env block; jobs that need values inline structural placeholders directly in `.github/workflows/ci.yml`. Two jobs currently carry env: the `build` job (which fails at module-import without `DATABASE_URL`, `SESSION_SECRET`, `AUTH_MODE`) and the `test` job (which connects to its Postgres service and boots the SSR server end-to-end). Both use inline placeholders, never `${{ secrets.* }}`. If you add a job that needs env, follow the same pattern. Don't introduce a `${{ secrets.* }}` fallback "just in case" — that turns absence-of-secret into a silent footgun where a configured prod-ish DSN would flow into the build env.

## Linters and formatters

- **YAML** — `.yamllint.yml` (extends default; `node_modules/` excluded; 120-char lines; GH-Actions `on:` truthy bypass).
- **Markdown** — `.markdownlint-cli2.yaml` (MD013 off; `node_modules/`, `dist/`, `.astro/`, `.git/` excluded). Run locally with `bun x markdownlint-cli2`.
- **TypeScript** — `bun run check` (Astro check) + `bun run typecheck` (tsc `--noEmit`). Both must be clean.
- **Dockerfile** — hadolint via `.github/workflows/ci.yml` (no local config).

Before pushing, run the Bun-based subset locally:

```sh
bun run check && bun run typecheck && bun test
```

This catches TS/Astro/test errors but does **not** mirror the full CI run. To check the remaining lint steps locally before pushing:

```sh
bun x markdownlint-cli2                            # markdown lint (uses .markdownlint-cli2.yaml)
yamllint .                                         # YAML lint    (Python tool — install once with `pip install yamllint` or `pipx install yamllint`; not on the bun/npm path)
docker run --rm -i hadolint/hadolint < Dockerfile  # Dockerfile lint
```

The `secrets` CI job runs `gitleaks` against the full git history — there's no fast local equivalent worth running every push; rely on CI for that gate.

## Anti-patterns to avoid

- ❌ Pushing directly to `main` — even for trivial fixes.
- ❌ Skipping tests on a bug fix ("the fix is obvious, no test needed").
- ❌ Adding `any` to bypass a type error.
- ❌ Reading the real-inventory `db/seed.local.ts` and writing its contents elsewhere.
- ❌ Hardcoding absolute paths (`/home/baptiste/…`, `/Users/…`) — use relative or env-derived paths.
- ❌ Modifying `migrations/0001_init.sql` after it's been deployed anywhere — add a new migration file instead.
- ❌ Force-pushing to `main`. Force-push to feature branches only, always `--force-with-lease`.

## Pointers for tool-specific files

- **Claude Code**: see [`CLAUDE.md`](CLAUDE.md) for the Claude-specific delta (mainly: identity, voice notification rules from the global agent config). The agent-agnostic policy is here.
- **Other agents** (Codex CLI, Cursor, Aider, Copilot): this file is the source of truth. If you maintain a tool-specific file, keep it thin and delegate here.
