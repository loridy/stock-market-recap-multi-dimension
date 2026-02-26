# Pipeline (Workflow-first)

## Goal
Orchestrate multi-step recap generation instead of one-prompt generation.

## Current command
```bash
npm run recap -- --date YYYY-MM-DD --analyst default --regime Mixed
```

## Current behavior (v0)
1. Load analyst profile from `configs/analysts/*.yaml`
2. Load module definitions from `configs/modules/*.yaml`
3. Build canonical `report.json`
4. Validate against `reports/template/report.schema.json`
5. Render:
   - `report.md`
   - `email.html`

## Output contract
For each run date `YYYY-MM-DD`, write to:
- `reports/YYYY-MM-DD/report.json`
- `reports/YYYY-MM-DD/report.md`
- `reports/YYYY-MM-DD/email.html`

## Next implementation steps
- Replace placeholder summaries with real data ingestion (`data/`)
- Add evidence links/metrics per module
- Add multi-analyst batch generation in one run
- Add email sender and frontend API integration
