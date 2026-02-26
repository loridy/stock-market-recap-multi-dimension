# Pipeline (Workflow-first)

## Goal
Orchestrate multi-step recap generation instead of one-prompt generation.

## Proposed stages
1. `collect` → gather and normalize data
2. `analyze` → run module analyzers (market-state, sector-rotation, flow-positioning, macro-drivers, signal-factor)
3. `personalize` → apply analyst profiles from `configs/analysts/*.yaml`
4. `synthesize` → build canonical `report.json`
5. `publish` → render markdown, email HTML, and frontend JSON payload

## Output contract
For each run date `YYYY-MM-DD`, write to:
- `reports/YYYY-MM-DD/report.json`
- `reports/YYYY-MM-DD/report.md`
- `reports/YYYY-MM-DD/email.html`
