# Pipeline

Orchestrates the full 5-stage market recap generation.

## Quick start

```bash
# Install dependencies
npm install

# Copy and fill in your API key
cp .env.example .env

# Run the full pipeline for today
npm run recap

# Run for a specific date with a specific analyst profile
npm run recap -- --date 2026-02-26 --analyst analyst-tech-growth
```

## Stages

| # | Script | Output | Description |
|---|--------|--------|-------------|
| 1 | `fetch-data.mjs`          | `data/YYYY-MM-DD/raw-prices.json`    | Yahoo Finance — 1yr history per instrument |
| 1b| `fetch-news.mjs`          | `data/YYYY-MM-DD/news.json`          | Public RSS market headlines (normalized + deduped) |
| 2 | `compute-metrics.mjs`     | `data/YYYY-MM-DD/metrics.json`       | d1/d5/m1/ytd/y1 returns for every ticker |
| 3 | `build-facts.mjs`         | `data/YYYY-MM-DD/facts.json`         | Deterministic: regime, sector rankings, yield curve |
| 4 | `build-analyst-focus.mjs` | `data/YYYY-MM-DD/analyst-focus.json` | Deterministic analyst focus cards (mark/alex/loridy/freya) |
| 5 | `summarize-claude.mjs`    | `data/YYYY-MM-DD/summary.json`       | Claude synthesis — one prompt per section |
| 6 | `run-recap.mjs`           | `reports/YYYY-MM-DD/report.*`        | Validate + render JSON / Markdown / HTML |

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--date YYYY-MM-DD` | today | Target date |
| `--analyst NAME` | `default` | Analyst profile from `configs/analysts/` |
| `--skip-fetch` | off | Reuse cached `data/YYYY-MM-DD/` (skip stages 1–3) |
| `--skip-news` | off | Reuse cached `data/YYYY-MM-DD/news.json` |
| `--skip-focus` | off | Reuse cached `data/YYYY-MM-DD/analyst-focus.json` |
| `--skip-llm` | off | Skip Claude call; write placeholder narrative |

## Running stages individually

```bash
node pipeline/fetch-data.mjs 2026-02-26
node pipeline/compute-metrics.mjs 2026-02-26
node pipeline/build-facts.mjs 2026-02-26
node pipeline/summarize-claude.mjs 2026-02-26
```

## Output contract

For each run date `YYYY-MM-DD`:
- `reports/YYYY-MM-DD/report.json` — canonical data (validated against schema)
- `reports/YYYY-MM-DD/report.md`   — Markdown archive
- `reports/YYYY-MM-DD/email.html`  — distribution-ready HTML email

Intermediate data files in `data/YYYY-MM-DD/` are git-ignored.

## Configuration

- **Instruments:** `pipeline/fetch-data.mjs` → `INSTRUMENTS`
- **Prompt templates:** `configs/prompts/*.txt`
- **Analyst profiles:** `configs/analysts/*.yaml`
- **Report schema:** `reports/template/report.schema.json`

See `docs/METHODOLOGY.md` for the full design rationale.
