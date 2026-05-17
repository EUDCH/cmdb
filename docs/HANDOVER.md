# Handover

> This document is the **single source of truth** for running the CMDB. If another OPERAS sysadmin needs to take over (planned handover, holiday cover, bus-factor event), everything they need to deploy, operate, and recover the system must be here.

> Draft skeleton — populated as the system gains substance.

## TL;DR

CMDB is currently in design phase. No deployment exists yet.

## Deployment

> To fill in once the stack and target are confirmed (see [`adr/0001-stack.md`](adr/0001-stack.md)).

- Target host(s): TBD (likely PCSS once v1 lands)
- Build / install steps: TBD
- Configuration files + their canonical locations: TBD
- TLS / certificate handling: TBD
- Default branch / deployment branch contract: `main` is the default; deployment branch TBD

## Secrets

> No secrets ever live in this repo. The list below names **which** secrets the system needs, and **where** the canonical copy lives (credstore / systemd-creds / vault / similar) — never the values.

- Database credentials: TBD
- AAI / OIDC client secret: TBD
- Monitor integration tokens (HetrixTools, Pulsetic, Zabbix): TBD
- Backup target credentials: TBD

## Backup & Restore

- Backup target: TBD
- Backup frequency + retention: TBD
- Restore drill: must be tested before declaring v1 done — restoring to a fresh host from backup alone must reproduce a working instance.

## Runbook

> Common operational tasks with the exact commands to run.

- Add a new service entry: TBD
- Add a new host entry: TBD
- Link a service to a host: TBD
- Mark a service as retired: TBD
- Query "which services run on host X": TBD
- Query "which services does owner Y own": TBD

## Monitoring

- The CMDB itself is monitored via: TBD (HetrixTools probably; will follow OPERAS convention)
- Logs ship to: TBD (future LGTM stack)

## Contacts

- Primary maintainer: Baptiste Grenier (OPERAS Federated Infrastructure Manager, EDCH Technical Coordinator)
- Backup contact: TBD (the named successor / cover person)
- Escalation: OPERAS coordinator (currently Pierre Mounier, role transition in progress)

## Known Gotchas

> Add entries here as we encounter them. Each entry: short title, what went wrong, the fix.

(none yet)
