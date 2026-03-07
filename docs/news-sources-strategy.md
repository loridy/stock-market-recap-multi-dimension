# News Sources Strategy (Market Recap)

Last updated: 2026-03-07

## Goal
Build a reliable, low-maintenance news ingestion layer for daily market recap generation.

---

## Source Priority

### Tier 1 (Primary Backbone)
- **newsfilter.io**
  - Role: primary aggregated news source.
  - Why: broad coverage across many publishers, normalized output, ticker mapping support.
  - Expected impact: reduce custom scraping complexity and speed up implementation.

### Tier 2 (Secondary/Fallback Sources)
- **AASTOCKS** (HK market signal coverage)
- **WallstreetCN** (CN macro/news context)
- **Earnings calendar source(s)** (for event confirmation/fallback)

Role:
- Keep recap resilient if Tier 1 has quota/auth/outage issues.
- Add regional/contextual depth where needed.

### Tier 3 (Optional Enhancers)
- NewsMinimalist (enrichment/fallback only)
- Additional curated feeds based on observed coverage gaps

---

## Coverage Notes for Current Watchlist

The following names are considered **covered via newsfilter** (subject to the vendor’s source set and plan limits):
- WSJ
- Bloomberg
- CNBC
- Reuters
- Seeking Alpha
- BusinessWire

Important:
- We should treat this as **“covered through aggregator ingestion”**, not direct first-party API integration.
- We should still monitor daily source presence and freshness in pipeline health checks.

---

## Implementation Plan

1. Add a `newsfilter` adapter in pipeline ingestion.
2. Normalize all sources into one schema (`title`, `source`, `url`, `published_at`, `symbols`, `source_id`).
3. Add deduplication + ranking logic (URL hash/title similarity + source confidence).
4. Add failover flow:
   - if primary source fails/degrades, continue with fallback sources.
5. Add daily source health report:
   - success/failure counts
   - latency
   - empty-response detection

---

## Reliability Rules

- Pipeline must not fail hard because one source fails.
- No fabricated links/content.
- Preserve source attribution in final report.
- Log warnings explicitly when source coverage degrades.

---

## Cost Direction

- Keep **newsfilter as single paid backbone** (if adopted).
- Use low-cost/free fallback feeds for resilience.
- Re-evaluate monthly based on:
  - effective coverage
  - recap quality
  - cost per useful article
