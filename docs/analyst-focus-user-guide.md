# Analyst Focus User Guide

This guide explains how analyst differentiation currently works in the market recap project, and how to modify or extend it safely.

## Where analyst focus is generated

Current implementation is **code-driven** in:
- `pipeline/build-analyst-focus.mjs`

Pipeline outputs:
- intermediate: `data/YYYY-MM-DD/analyst-focus.json`
- final report: `reports/YYYY-MM-DD/report.json` under `analyst_focus`

Frontend reads from `report.json`.

---

## Current differentiation model

Each analyst card is built from 3 layers:

1. **Lens** (what this analyst cares about)
2. **Data slice** (which facts/metrics fields are used)
3. **News relevance filter** (keyword matching)

### Current built-in analysts

- **mark** (Macro & Rates)
  - Yield curve, DXY, VIX, regime context
  - Macro/rates headlines (fed/inflation/treasury/yield/rate)

- **alex** (MAG7 & Growth)
  - MAG7 leadership + QQQ vs SPY signal
  - Growth/earnings headlines (mega-cap/earnings keywords)

- **loridy** (Consumer & Flows)
  - Sector leaders/laggards/dispersion
  - Consumer/retail/flow headlines

- **freya** (Commodities)
  - Gold/oil + cross-asset check
  - Commodity/energy headlines

---

## How to modify existing analyst focus

Edit `pipeline/build-analyst-focus.mjs`:

- Titles/subtitles for each analyst
- Bullet construction logic
- Headline matching keywords
- Ranking/selection logic

Then rerun recap:

```bash
npm run recap -- --date YYYY-MM-DD --analyst default --skip-fetch
```

Notes:
- Use `--skip-fetch` to speed up iteration when market data is unchanged.
- Keep outputs deterministic where possible (stable format helps frontend + QA).

---

## How to add a new analyst (current approach)

1. Add a new key in the `focus` object in `pipeline/build-analyst-focus.mjs`
   - Example: `nova: { title, subtitle, bullets }`

2. Update schema to allow the new analyst key:
   - `reports/template/report.schema.json`
   - Add property under `analyst_focus`

3. Update frontend to render the new key:
   - `index.html` → `renderFocus()` currently uses a fixed key list

4. Run recap and validate:

```bash
npm run recap -- --date YYYY-MM-DD --analyst default
```

---

## News and source extension

To add/change headline sources:
- edit `pipeline/fetch-news.mjs`
- update `FEEDS` list with new RSS endpoints

Recommended source ingestion priorities:
- market wrap / trading desk flow notes
- high-quality sellside summaries
- internal research emails (if policy allows)

Important:
- keep canonical fields: `title`, `source`, `url`, `published_at`
- dedupe aggressively
- avoid private source leakage in public outputs

---

## Recommended next step (config-driven v2)

Current model is hardcoded in JS. For better maintainability, move analyst definitions to YAML.

Suggested new config:
- `configs/analyst-focus/default.yaml`

Define per analyst:
- id, title, subtitle template
- key data fields
- news keyword sets
- bullet template/rules

Benefits:
- add/edit analysts without touching JS
- easier versioning + review
- safer delegation to non-engineering users

---

## Troubleshooting checklist

If analyst cards are missing in frontend:

1. Check pipeline output exists:
   - `data/YYYY-MM-DD/analyst-focus.json`
2. Check final report includes `analyst_focus`:
   - `reports/YYYY-MM-DD/report.json`
3. Check schema compatibility:
   - `reports/template/report.schema.json`
4. Check frontend key list includes your analyst id(s):
   - root `index.html`

---

## Quick command set

```bash
# full run
npm run recap -- --date YYYY-MM-DD --analyst default

# faster iteration (reuse market data)
npm run recap -- --date YYYY-MM-DD --analyst default --skip-fetch

# reuse cached news/focus during UI iteration
npm run recap -- --date YYYY-MM-DD --analyst default --skip-news --skip-focus
```
