# CLAUDE.md

@AGENTS.md

This file exists only to import [`AGENTS.md`](AGENTS.md), which holds this repository's guidance for AI agents.

Claude Code [reads `AGENTS.md` natively](https://code.claude.com/docs/en/memory#agents-md) from v2.1.277 onward, so on a current version the import is redundant. It is kept because the native path is unavailable in several ordinary cases: versions older than v2.1.277, sessions that cannot fetch feature flags (Amazon Bedrock and other third-party providers, or telemetry disabled), and the first session after an install or upgrade. It also makes the guidance visible in `/memory` and `/context`.

The import is what makes this file safe rather than harmful. Claude Code stops reading `AGENTS.md` as soon as any `CLAUDE.md` exists at or above the working directory, so a wrapper that omitted the `@AGENTS.md` line would silently hide every rule in it.

Operator note: personal tooling (PAI sub-agents, custom skills, voice routing, ElevenLabs voice IDs) stays in your global `~/.claude/CLAUDE.md` (or PAI's `USER/` tree), not in this repo. Anything in this repo's tree must work for any Claude Code user, not just one operator's configuration.
