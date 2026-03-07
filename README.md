# Stock Market Recap (Multi-dimension)

A workflow-first project to generate buy-side market recaps in three outputs:
1. Markdown (record keeping)
2. Email HTML (distribution)
3. Canonical JSON (frontend consumption)

Design principle:
- Minimize human interaction in the workflow (reduce manual drag/drop/download and maximize automated ingestion + processing).

## Structure
- `index.html` canonical frontend entrypoint (serve repo root and open `/`)
- `configs/analysts/` analyst-specific focus profiles
- `configs/modules/` module-level analysis criteria and sources
- `pipeline/` orchestration scripts
- `scripts/` operational scripts (including scheduler runner)
- `reports/template/` schema and rendering templates
- `reports/YYYY-MM-DD/` generated daily outputs
- `docs/news-sources-strategy.md` source priority and migration strategy

## Quick Start
```bash
npm install
npm run recap -- --date 2026-02-26 --analyst default --regime Mixed
```

Outputs:
- `reports/2026-02-26/report.json`
- `reports/2026-02-26/report.md`
- `reports/2026-02-26/email.html`

## Automated local scheduling (macOS launchd)
This project supports unattended local runs via:
- Runner script: `scripts/run-recap-scheduled.sh`
- LaunchAgent: `~/Library/LaunchAgents/com.loridy.marketrecap.weekday.plist`

Current schedule:
- Monday–Friday at **08:00 HKT**
- Date logic:
  - Monday run targets previous **Friday**
  - Tuesday–Friday runs target previous calendar day

Useful commands:
```bash
# Reload job
UID=$(id -u)
launchctl bootout gui/$UID ~/Library/LaunchAgents/com.loridy.marketrecap.weekday.plist 2>/dev/null || true
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.loridy.marketrecap.weekday.plist
launchctl enable gui/$UID/com.loridy.marketrecap.weekday

# Trigger immediately (manual test)
launchctl kickstart -k gui/$UID/com.loridy.marketrecap.weekday

# Inspect status
launchctl print gui/$UID/com.loridy.marketrecap.weekday
```

Logs:
- `logs/recap-scheduled-*.log`
- `logs/launchd.out.log`
- `logs/launchd.err.log`

## Available analyst profiles
- `default`
- `analyst-tech-growth`
- `analyst-macro-risk`

## Correctness-first workflow
See `docs/recap-workflow.md` for the production workflow:
- data ingestion first
- metrics computation
- deterministic fact building
- Claude summarization (server-side)
- schema validation and publish

## Analyst focus documentation
- `docs/analyst-focus-user-guide.md` — how analyst differentiation works, where it is stored, and how to modify/extend it.
