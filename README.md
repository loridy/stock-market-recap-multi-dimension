# Stock Market Recap (Multi-dimension)

A workflow-first project to generate buy-side market recaps in three outputs:
1. Markdown (record keeping)
2. Email HTML (distribution)
3. Canonical JSON (frontend consumption)

## Structure
- `index.html` canonical frontend entrypoint (serve repo root and open `/`)
- `frontend/index.html` legacy compatibility redirect to `/`
- `configs/analysts/` analyst-specific focus profiles
- `configs/modules/` module-level analysis criteria and sources
- `pipeline/` orchestration scripts
- `reports/template/` schema and rendering templates
- `reports/YYYY-MM-DD/` generated daily outputs

## Quick Start
```bash
npm install
npm run recap -- --date 2026-02-26 --analyst default --regime Mixed
```

Outputs:
- `reports/2026-02-26/report.json`
- `reports/2026-02-26/report.md`
- `reports/2026-02-26/email.html`

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
