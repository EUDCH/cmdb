# CLAUDE.md

Authoritative repo policy lives in [`AGENTS.md`](AGENTS.md) — read that first; it is the single source of truth for every agent, including Claude.

This file exists only so Claude Code auto-loads the policy via its project-scoped instruction convention (per the "Project-Specific Rules" section of the global `~/.claude/CLAUDE.md`). It deliberately carries **no repo-scoped policy of its own** — every rule lives in `AGENTS.md` so there is nothing to drift.

If your Claude setup bundles personal tooling — PAI sub-agents (Forge, Engineer), custom skills (Interceptor, Browser), voice notifications, identity files — those are **personal-config concerns**, not repo policy. Keep them in your global `~/.claude/CLAUDE.md` (or PAI's `USER/` tree), not here. Anything in this repo's tree must work for any Claude Code user, not just one operator's configuration.
