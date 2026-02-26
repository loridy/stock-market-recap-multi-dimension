# Pipeline Methodology: Data-First, LLM-Second

## Philosophy

The core principle of this system is **data-first, LLM-second**:

1. **Never ask an LLM to invent numbers.** All market data (prices, returns, yields, VIX) is fetched from real sources and validated before any LLM is invoked.
2. **Separate what is objective from what is interpretive.** Stages 1–3 are fully deterministic — no model, no randomness. Only Stage 4 (narrative synthesis) involves Claude.
3. **Every LLM claim must be traceable to input data.** Prompts explicitly instruct Claude to cite specific metrics and not hallucinate events or prices.
4. **One focused prompt per section.** Rather than one large prompt for the whole report, each section has its own focused system prompt and receives only the data relevant to that section.

---

## Pipeline Stages

### Stage 1 — Data Ingestion (`pipeline/fetch-data.mjs`)

**Input:** Date string (YYYY-MM-DD)
**Output:** `data/YYYY-MM-DD/raw-prices.json`

Fetches 1 year + 15-day buffer of daily OHLCV history from Yahoo Finance for:

| Category       | Instruments |
|----------------|-------------|
| US Indices     | SPY, QQQ, IWM, DIA, EFA, EEM |
| US Sectors     | XLK, XLC, XLY, XLP, XLF, XLV, XLI, XLE, XLB, XLRE, XLU |
| Commodities    | GC=F (Gold), CL=F (WTI), SI=F (Silver), NG=F (Nat Gas) |
| Yields         | ^IRX (3M), ^FVX (5Y), ^TNX (10Y), ^TYX (30Y) |
| FX             | EURUSD=X, USDJPY=X, GBPUSD=X, DX-Y.NYB (DXY) |
| Volatility     | ^VIX |
| MAG7           | AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA |

Failures per ticker are logged as warnings and skipped — a partial dataset is still usable.

---

### Stage 2 — Metrics Engine (`pipeline/compute-metrics.mjs`)

**Input:** `raw-prices.json`
**Output:** `data/YYYY-MM-DD/metrics.json`

Computes standardized return metrics for every instrument:

| Field    | Description |
|----------|-------------|
| `current` | Latest close price |
| `d1`      | 1-day absolute change |
| `d1Pct`   | 1-day % return |
| `d5Pct`   | 5-day (weekly) % return |
| `m1Pct`   | 21-trading-day (monthly) % return |
| `ytdPct`  | Year-to-date % return (from first trading day of the year) |
| `y1Pct`   | 1-year (252 trading days) % return |

Outputs a structured `market_heatmap` object with categories: `indices`, `sectors`, `commodities`, `yields`, `fx`, plus standalone `vix` and `mag7` arrays.

---

### Stage 3 — Rule-Based Pre-Summary (`pipeline/build-facts.mjs`)

**Input:** `metrics.json`
**Output:** `data/YYYY-MM-DD/facts.json`

Builds deterministic, objective facts with no LLM:

- **Regime detection** — based on SPY 1-day return + VIX level: `Risk-On / Risk-Off / Neutral / Mixed`
- **Sector ranking** — top 3 leaders and bottom 3 laggards by 1-day return
- **Sector dispersion** — spread between best and worst sector (flags selective vs broad moves)
- **Yield curve** — t3m, t5y, t10y, t30y levels; 3M–10Y spread; curve shape (normal/flat/inverted)
- **FX snapshot** — DXY, EUR/USD, USD/JPY, GBP/USD with 1-day change
- **Commodity snapshot** — Gold and Oil with 1-day and YTD change
- **MAG7 summary** — average 1-day return, top 3 and bottom 3 performers

These facts are the **ground truth** passed to all LLM prompts.

---

### Stage 4 — LLM Synthesis (`pipeline/summarize-claude.mjs`)

**Input:** `facts.json` + `metrics.json` + analyst profile
**Output:** `data/YYYY-MM-DD/summary.json`

Calls Claude (`claude-sonnet-4-6`) once per report section. Each call receives a focused system prompt and only the data relevant to that section:

| Section          | Prompt file                           | Input data |
|------------------|---------------------------------------|------------|
| Executive summary | `configs/prompts/executive-summary.txt` | Full facts + regime |
| Market state      | `configs/prompts/market-state.txt`      | Broad market + VIX + sectors |
| Sector rotation   | `configs/prompts/sector-rotation.txt`   | Sector rankings + heatmap |
| Macro drivers     | `configs/prompts/macro-drivers.txt`     | Yields + FX + commodities |
| Flow/positioning  | `configs/prompts/flow-positioning.txt`  | VIX + sector dispersion + breadth proxies |
| Analyst view      | `configs/prompts/analyst-view.txt`      | Full facts + analyst profile + MAG7 |

**Prompt design principles:**
- System prompt states the analyst role and output rules
- User message is the raw JSON data (no preamble)
- Every prompt instructs Claude to output **only valid JSON** in a defined schema
- Every prompt explicitly forbids inventing data not present in the input
- Sections run sequentially (not in parallel) for rate-limit safety and clear logging

If a section fails to produce parseable JSON, the raw text is preserved and execution continues — a partial report is written rather than crashing.

---

### Stage 5 — Validate & Render (`pipeline/run-recap.mjs`)

**Input:** `summary.json` + `metrics.json` + analyst profile
**Output:** `reports/YYYY-MM-DD/report.json`, `report.md`, `email.html`

- Assembles the canonical `report.json` merging all pipeline outputs
- Validates against JSON Schema (`reports/template/report.schema.json`) — fails fast on invalid structure
- Renders Markdown and HTML email via Handlebars templates

---

## Running the Pipeline

```bash
# Full run (fetches live data + calls Claude)
npm run recap -- --date 2026-02-26 --analyst default

# Re-run narrative only (reuses cached data, skips Yahoo Finance fetch)
npm run recap -- --date 2026-02-26 --skip-fetch

# Test pipeline without Claude API key
npm run recap -- --date 2026-02-26 --skip-llm

# Run individual stages
node pipeline/fetch-data.mjs 2026-02-26
node pipeline/compute-metrics.mjs 2026-02-26
node pipeline/build-facts.mjs 2026-02-26
node pipeline/summarize-claude.mjs 2026-02-26
```

---

## Configuration

### Environment variables
Copy `.env.example` to `.env` and set:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Analyst profiles
Stored in `configs/analysts/*.yaml`. Each profile defines:
- `name`, `owner`
- `coverage.assets` and `coverage.sectors`
- `focus.horizon`, `focus.style`, `focus.key_metrics`
- `watchlist.tickers` and `watchlist.themes`

The active profile is passed as structured data to the analyst-view prompt.

### Prompt templates
Stored in `configs/prompts/*.txt`. Each file is a system prompt for one report section. Modify these to change the tone, output schema, or analytical focus without touching pipeline code.

---

## Security Rules

- **No API keys in frontend JavaScript.** All LLM and data API calls run server-side in the pipeline.
- **No fabricated data.** If a ticker fails to fetch, its metrics are `null` — never filled with invented values.
- **No hallucinated links.** The current pipeline does not generate news URLs; that field (`breaking_news`) is reserved for a dedicated news-fetching stage.
- **Render "No data" explicitly** in the frontend when a field is `null`.

---

## Extending the System

| Goal | Where to change |
|------|----------------|
| Add a new instrument | `pipeline/fetch-data.mjs` → `INSTRUMENTS` + `pipeline/compute-metrics.mjs` → `HEATMAP_BUCKETS` |
| Change narrative tone | Edit the relevant file in `configs/prompts/` |
| Add a new analyst profile | Create `configs/analysts/my-analyst.yaml` |
| Add news/events data | New `pipeline/fetch-news.mjs` stage; output to `data/YYYY-MM-DD/news.json` |
| Add email delivery | New `pipeline/send-email.mjs` stage reading the rendered `email.html` |
| Add GitHub Actions scheduling | `.github/workflows/daily-recap.yml` with cron `0 21 * * 1-5` (4 PM ET) |
| Switch LLM model | Change `MODEL` constant in `pipeline/summarize-claude.mjs` |
