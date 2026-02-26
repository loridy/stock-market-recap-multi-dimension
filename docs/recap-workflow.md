# Recap Workflow (Data-First, LLM-Second)

## Why the current app looked wrong

1. Frontend previously included placeholder fallback values and sample links (e.g., `example.com`) when report data was missing.
2. Pipeline currently generates a template report (`run-recap.mjs`) and does **not** ingest real market/news feeds yet.
3. Browser frontend is static; it cannot safely call paid APIs/LLMs directly with secrets.

So the issue is not "internet blocked"—it is missing backend ingestion + enrichment stages.

---

## Target architecture

### Stage 1 — Data ingestion (truth source)
Collect raw data into `data/YYYY-MM-DD/*.json`:

- Market prices/yields/FX (major indices, commodities, UST 2Y/10Y/30Y, USDJPY/EURUSD/GBPUSD)
- Econ calendar + key releases
- Company events (MAG7 earnings/events)
- Thematic signals (consumer, flows, alt data)
- Breaking headlines with URLs + source + timestamp

Output: normalized raw snapshots with source metadata.

### Stage 2 — Metrics engine
Compute required metrics per instrument:

- `current` (price or yield)
- `d1` (absolute change)
- `d1Pct`, `d5Pct`, `m1Pct`, `ytdPct`, `y1Pct`

Output goes into canonical `market_heatmap` object.

### Stage 3 — Rule-based pre-summary
Create deterministic facts (no LLM yet):

- top movers / laggards
- yield curve moves (front-end vs long-end)
- JP-sensitive events
- MAG7 event deltas
- commodity + related sector direction

### Stage 4 — LLM synthesis (Claude)
Use Claude to summarize only from structured evidence generated above.

**Important:** Claude should run server-side (pipeline job), not in frontend browser.

Prompt contract:
- Input: structured facts + links
- Output: constrained JSON fields (executive summary, analyst focus bullets, risks, actions)
- No invented values; every claim tied to evidence ID/link.

### Stage 5 — Validation & publish
- Validate against schema
- Write:
  - `reports/YYYY-MM-DD/report.json`
  - `reports/YYYY-MM-DD/report.md`
  - `reports/YYYY-MM-DD/email.html`
- Frontend renders only report fields; no fake fallback content.

---

## Canonical report extensions required

Add these fields to `report.json` generation:

- `market_heatmap`
  - `indices[]`, `commodities[]`, `yields[]`, `fx[]`
  - each item: `name`, `ticker`, `current`, `d1`, `d1Pct`, `d5Pct`, `m1Pct`, `ytdPct`, `y1Pct`
- `breaking_news[]`
  - `title`, `source`, `url`, `published_at`
- `analyst_focus`
  - `mark`, `alex`, `loridy`, `freya`
  - each: `title`, `subtitle`, `bullets[]`

---

## Analyst focus logic

- **Mark**: econ stats/calendar + UST (esp. 10Y, short/long end), JP-sensitive updates
- **Alex**: MAG7 earnings/events + extensible single-name watchlist
- **Loridy**: consumer theme + flow/alt-data signals
- **Freya**: commodities + related sectors/stocks

---

## Implementation checklist

1. Build `pipeline/fetch-data.mjs` (sources -> raw files)
2. Build `pipeline/compute-metrics.mjs` (raw -> heatmap metrics)
3. Build `pipeline/build-facts.mjs` (deterministic facts + evidence links)
4. Build `pipeline/summarize-claude.mjs` (facts -> summary JSON)
5. Update `pipeline/run-recap.mjs` to compose all steps
6. Extend schema (`reports/template/report.schema.json`)
7. Keep frontend read-only from `report.json`

---

## Security / correctness rules

- No API keys in frontend JavaScript.
- No fabricated links or prices.
- If data is missing, render explicit "No data".
- Summary claims must reference evidence links.
