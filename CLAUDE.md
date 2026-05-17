# CMDB — Repo Rules

Repo-scoped working agreement. Loaded automatically by Claude Code when sessions start under this directory; merged with the global `~/.claude/CLAUDE.md`.

## Change ceremony — PR required

- **Every change ships via a PR**, even one-line fixes. No direct pushes to `main`.
- **CI must be fully green before merge.** All four jobs (`secrets`, `lint`, `build`, `test`) succeed.
- Branch names follow `<type>/<short-slug>` (e.g. `feat/services-filter`, `fix/auth-banner-color`, `ci/<thing>`, `docs/<thing>`).
- PR titles use Conventional Commits prefixes; PR body explains the *why* in addition to the *what*. Close any related issue with `Closes #N`.
- I open the PR, watch CI, and only ping Baptiste when it's green + mergeable. If CI fails, I iterate until it's green; I don't ask permission for each fix unless the failure points at a design question.
- **Merge is Baptiste's call**, not mine. The default merge style is squash (single commit per PR on `main`); preserve the PR number in the subject so `Closes` traces back.
- Force-push to a feature branch is fine while the PR is open (use `--force-with-lease`). Never to `main`.

**Why:** the PR + CI loop is the only structural guarantee that the repo stays in a known-good state, and the only way external contributors (future EDCH technical-board reviewers) see a coherent history. The cherry-pick → PR #2 round established this — the prior "push direct to main" shortcut is retired.

## Automated feature testing

- **Every new feature lands with tests** in the same PR. No "I'll add tests later" — later doesn't come.
- **Every bug fix lands with a regression test** that fails before the fix and passes after.
- Tests live under `tests/`, mirror the module path (`tests/routes/services.test.ts` for `src/pages/services/*.astro`).
- The `test` CI job runs `bun test`; new tests are picked up automatically (filename suffix `.test.ts`).
- Test pyramid for this repo, in priority order:
  1. **Route integration tests** — render the page handler against a test Postgres, assert status code + response body shape. Catches SSR + DB + middleware regressions in one shot, which is where this app's value lives.
  2. **Library unit tests** — `src/lib/*` (db queries, session, auth helpers). Fast, no infra.
  3. **End-to-end browser tests** — only once the HTMX-driven interactive paths exist; not warranted while pages are read-only.
- For integration tests, spin up the test DB via the existing `docker-compose.yml` in the CI `test` job. Migrations replay on a fresh volume; seed with a deterministic fixture (smaller than `db/seed.ts` demo data).
- The `tests/smoke.test.ts` file is a placeholder — keep it until at least one real test ships, then remove.

**Why:** the repo is going to grow (new namespaces, edit UI, audit log, OPERAS ID integration). Without tests, every refactor is a guess about what still works. Building the test harness alongside the second feature is cheap; retro-fitting against 20 features is not.

## Existing operational rules apply

The global `~/.claude/CLAUDE.md` rules still apply: bun-not-npm, TypeScript-not-Python, never hardcode paths, Interceptor for any browser verification, etc. This file only adds repo-specific policy.
