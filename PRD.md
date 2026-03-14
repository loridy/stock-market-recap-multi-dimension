# PRD — Market Recap v2

Last updated: 2026-03-14
Owner: Loridy
Product shorthand: PM

## 1) Objective
Build a reliable, analyst-friendly market recap web app that supports:
- Daily recap output (stable report artifact)
- In-page settings management (tickers + analysts)
- Live market/news monitoring (1-minute updates)

## 2) Problem Statement
The current project is usable for daily reports, but there is user friction:
- Config changes are not always obvious to users
- Users expect “save = reflected quickly”
- Live and daily modes can be confused

## 3) Target Users
- Primary: Loridy (operator + analyst)
- Secondary: internal collaborators consuming recap + live checks

## 4) Product Scope (In)
### 4.1 Main Page
- Load and render daily report from `reports/YYYY-MM-DD/report.json`
- Keep clean, low-friction dashboard UX

### 4.2 In-Page Settings (⚙️)
- Edit ticker buckets (indices/sectors/commodities/yields/fx/volatility/mag7/watchlist)
- Edit existing analyst profiles
- Create new analyst profiles
- Validate tickers before save (validity + market/exchange hints)

### 4.3 Live Page (/live)
- Live prices + live news panel
- Backend refresh interval: 60 seconds
- Clearly visible `last fetch time`, status, and error state
- Easy navigation between Main and Live

## 5) Non-Goals (Current Phase)
- Full DB migration for recap workflow
- Multi-user auth/permission model
- Institutional low-latency streaming stack
- Full quant backtesting feature set

## 6) Success Metrics
- Settings save success rate > 95%
- Config-to-visible-update cycle < 2 minutes (after recap run)
- Live page freshness: `updated_at` lag < 90s
- Daily recap run success rate > 95%
- User-facing error clarity: no silent failures for save/validate/live fetch

## 7) Functional Requirements
- FR1: User can add/remove tickers by category and save to config
- FR2: System validates tickers and returns structured preview
- FR3: User can create/update analyst profiles from UI
- FR4: Live page auto-refreshes every 60s and shows clear timestamps
- FR5: Main page remains recap-focused; settings and live are easy to access

## 8) UX Requirements
- Distinct button styles/colors for primary actions
- Inline status feedback for Save / Validate / Refresh
- Explicit guidance after config save (e.g., run recap to update daily snapshot)
- One-click navigation between main recap and live monitoring

## 9) Technical Requirements
- Source-of-truth ticker config in `configs/instruments.json`
- Analyst config in `configs/analysts/*.yaml`
- Daily artifact in `reports/YYYY-MM-DD/report.json`
- Live API endpoints from backend server:
  - `GET /api/live/snapshot`
  - `POST /api/live/refresh`
- Failure-tolerant feed fetch (partial failures should not crash live page)

## 10) Constraints
- Keep architecture lightweight (file-based pipeline remains valid)
- Respect source/API rate limits
- Prioritize reliability over visual complexity
- Avoid introducing heavy infra unless necessary

## 11) Risks and Mitigations
### Risk A: Source/API instability or rate limits
- Mitigation: retry/backoff, partial-failure tolerance, source health indicators

### Risk B: Confusion between “Live” and “Daily Report”
- Mitigation: explicit labels + timestamp semantics + UI guidance

### Risk C: Invalid or ambiguous ticker symbols
- Mitigation: validation endpoint with returned-symbol and exchange checks

## 12) Rollout Plan
### Phase 1 — Stabilize Current UX (Done/In Progress)
- In-page settings for ticker buckets + analyst profiles
- Validation preview
- Live page + clear timestamp/status

### Phase 2 — Reduce Manual Friction
- Add “Save + Run Recap + Reload” flow
- Improve error diagnostics and feedback
- Add source health widget to live page

### Phase 3 — Analyst Depth
- Add analyst preset quick switch
- Add lightweight news tagging / relevance scoring
- Add “what changed since last report” summary block

## 13) Open Questions
1. Should settings save trigger recap automatically by default?
2. Should live page include optional per-source on/off switches?
3. Should analyst profiles support version history in-app?
4. Do we need role-based edit controls for future collaborators?

## 14) Definition of Done (for v2 baseline)
- Ticker + analyst settings editable from UI
- Live page updates every minute and shows trustworthy timestamps
- Daily report pipeline remains stable and reproducible
- Users can operate without manual file editing
- Clear docs for operation and troubleshooting
