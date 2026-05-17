# CLAUDE.md

Claude-specific delta for this repo. The agent-agnostic ruleset lives in [`AGENTS.md`](AGENTS.md) — read that first; everything below is layered on top.

Claude Code auto-loads this file when the session cwd is in this repo (per the "Project-Specific Rules" section of the global `~/.claude/CLAUDE.md`). It merges with both the global file and `AGENTS.md`.

## Source of truth

- **Agent-agnostic policy** (change ceremony, tests, code style, anti-patterns): [`AGENTS.md`](AGENTS.md)
- **This file**: only Claude-specific bits (subagent routing, voice prosody, identity). Keep it thin so the two files don't drift.

## Claude-specific deltas

- **Forge auto-include** (from the global rules): coding tasks at effort E3+ get a parallel Forge agent. That applies in this repo too. Forge writes code; Engineer agent works the same surface from the Claude-family side.
- **Interceptor for any UI verification**. When confirming a deploy or fix against the running instance (local `http://127.0.0.1:4321` or the operator's tailnet endpoint — never name the tailnet URL in repo-tracked files), use the Interceptor skill (real Chrome) rather than agent-browser (CDP fingerprints differently and misses rendering issues real Chrome catches). The endpoint itself is operator-configured and lives in the operator's session, not in repo.
- **Voice notifications**: defer to the global rule. CMDB-related notifications use the standard Daryl voice (`TX3LPaxmHKxFdv7VOQHJ`); no repo-specific override.

## When in doubt

Read `AGENTS.md`. If a rule isn't there but seems obvious, propose adding it there (single source of truth) rather than codifying it here.
