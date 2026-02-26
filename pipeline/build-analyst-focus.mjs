/**
 * Stage 3b — Deterministic Analyst Focus Builder
 * Converts facts/metrics/news into analyst_focus cards used by frontend.
 * Saves to data/YYYY-MM-DD/analyst-focus.json.
 *
 * Run standalone: node pipeline/build-analyst-focus.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function take(items, n = 2) {
  return Array.isArray(items) ? items.slice(0, n) : [];
}

function findNews(newsItems, terms = []) {
  return (newsItems || []).find((n) => {
    const t = `${n.title || ''}`.toLowerCase();
    return terms.some((x) => t.includes(x));
  });
}

export function buildAnalystFocus({ facts, metrics, news }) {
  const sectorLeaders = take(facts?.sectors?.leaders, 2).map((s) => `${s.name} ${fmtPct(s.d1Pct)}`);
  const sectorLaggards = take(facts?.sectors?.laggards, 2).map((s) => `${s.name} ${fmtPct(s.d1Pct)}`);

  const mag7Leaders = take(facts?.mag7?.leaders, 2).map((m) => `${m.ticker} ${fmtPct(m.d1Pct)}`);

  const markNews = findNews(news?.items, ['fed', 'inflation', 'treasury', 'yield', 'rate']);
  const alexNews = findNews(news?.items, ['earnings', 'apple', 'microsoft', 'nvidia', 'amazon', 'meta', 'alphabet', 'tesla']);
  const loridyNews = findNews(news?.items, ['consumer', 'retail', 'spending', 'flow']);
  const freyaNews = findNews(news?.items, ['oil', 'gold', 'commodity', 'energy', 'opec']);

  const focus = {
    mark: {
      title: 'Mark — Macro & Rates',
      subtitle: `10Y ${facts?.yield_curve?.t10y_pct ?? 'N/A'} | Curve ${facts?.yield_curve?.curve_shape ?? 'unknown'} | DXY ${fmtPct(facts?.fx?.dxy?.d1Pct)}`,
      bullets: [
        `Regime: ${facts?.regime ?? 'Mixed'} | VIX ${facts?.volatility?.current ?? 'N/A'} (${facts?.volatility?.category ?? 'unknown'})`,
        `3M-10Y spread: ${facts?.yield_curve?.spread_3m_10y ?? 'N/A'} pts | 10Y d1: ${facts?.yield_curve?.t10y_d1 ?? 'N/A'}`,
        markNews ? `Headline: ${markNews.title}` : 'No macro/rates headline matched today feeds.',
      ],
    },
    alex: {
      title: 'Alex — MAG7 & Growth',
      subtitle: `MAG7 avg ${fmtPct(facts?.mag7?.avg_d1Pct)} | QQQ ${fmtPct(facts?.broad_market?.qqq?.d1Pct)}`,
      bullets: [
        `Leaders: ${mag7Leaders.join(', ') || 'N/A'}`,
        `SPY ${fmtPct(facts?.broad_market?.spy?.d1Pct)} vs QQQ ${fmtPct(facts?.broad_market?.qqq?.d1Pct)} rotation check`,
        alexNews ? `Headline: ${alexNews.title}` : 'No MAG7-specific headline matched today feeds.',
      ],
    },
    loridy: {
      title: 'Loridy — Consumer & Flows',
      subtitle: `Dispersion ${facts?.sectors?.dispersion ?? 'N/A'} | Move quality: ${(metrics?.flow_positioning?.move_quality || facts?.regime || 'mixed').toString()}`,
      bullets: [
        `Leaders: ${sectorLeaders.join(', ') || 'N/A'}`,
        `Laggards: ${sectorLaggards.join(', ') || 'N/A'}`,
        loridyNews ? `Headline: ${loridyNews.title}` : 'No consumer/flow headline matched today feeds.',
      ],
    },
    freya: {
      title: 'Freya — Commodities',
      subtitle: `Gold ${fmtPct(facts?.commodities?.gold?.d1Pct)} | Oil ${fmtPct(facts?.commodities?.oil?.d1Pct)}`,
      bullets: [
        `Gold YTD: ${fmtPct(facts?.commodities?.gold?.ytdPct)} | Oil YTD: ${fmtPct(facts?.commodities?.oil?.ytdPct)}`,
        `Energy sector (XLE) check in heatmap for cross-asset confirmation.`,
        freyaNews ? `Headline: ${freyaNews.title}` : 'No commodities-specific headline matched today feeds.',
      ],
    },
  };

  return focus;
}

export function buildAndSaveAnalystFocus(date, { facts, metrics, news }) {
  const focus = buildAnalystFocus({ facts, metrics, news });
  const dataDir = path.join(ROOT, 'data', date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'analyst-focus.json'), JSON.stringify(focus, null, 2));
  console.log(`Saved: data/${date}/analyst-focus.json`);
  return focus;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'facts.json'), 'utf8'));
  const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'metrics.json'), 'utf8'));
  const newsPath = path.join(ROOT, 'data', date, 'news.json');
  const news = fs.existsSync(newsPath)
    ? JSON.parse(fs.readFileSync(newsPath, 'utf8'))
    : { date, items: [] };
  buildAndSaveAnalystFocus(date, { facts, metrics, news });
}
