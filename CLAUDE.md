# CLAUDE.md

@AGENTS.md

This file exists only to import [`AGENTS.md`](AGENTS.md) into Claude Code's session context. Claude Code reads `CLAUDE.md` natively but [does not auto-load `AGENTS.md` yet](https://code.claude.com/docs/en/memory#agentsmd) (tracked at [anthropics/claude-code#34235](https://github.com/anthropics/claude-code/issues/34235)) — the `@AGENTS.md` line above is the documented idiom to wire the two together without duplicating any rules.

Operator note: personal tooling (PAI sub-agents, custom skills, voice routing, ElevenLabs voice IDs) stays in your global `~/.claude/CLAUDE.md` (or PAI's `USER/` tree), not in this repo. Anything in this repo's tree must work for any Claude Code user, not just one operator's configuration.
