# CLAUDE.md

@AGENTS.md

This file only imports [`AGENTS.md`](AGENTS.md). Keep the import: a `CLAUDE.md` at or above the working directory suppresses `AGENTS.md`, so dropping the line would hide every rule in it rather than add to them.

Operator note: personal tooling (PAI sub-agents, custom skills, voice routing, ElevenLabs voice IDs) stays in your global `~/.claude/CLAUDE.md` (or PAI's `USER/` tree), not in this repo. Anything in this repo's tree must work for any Claude Code user, not just one operator's configuration.
