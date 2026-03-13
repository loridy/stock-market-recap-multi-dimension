/**
 * Stage 2 — Metrics Engine
 * Reads raw-prices.json and computes standardized multi-period returns
 * for every tracked instrument.
 * Saves to data/YYYY-MM-DD/metrics.json.
 *
 * Return periods: d1, d5 (week), m1 (month), ytd, y1 (year)
 *
 * Run standalone: node pipeline/compute-metrics.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function r(val, dec) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round(val * 10 ** dec) / 10 ** dec;
}

function close(entry) {
  // yahoo-finance2 v3 returns adjClose (camelCase); v2 returned adjclose
  return entry?.adjClose ?? entry?.adjclose ?? entry?.close ?? null;
}

/** Return % change between history[0] and history[daysBack]. */
function periodReturn(history, daysBack) {
  if (!history || history.length < daysBack + 1) return null;
  const cur = close(history[0]);
  const past = close(history[Math.min(daysBack, history.length - 1)]);
  if (cur === null || past === null || past === 0) return null;
  return ((cur - past) / past) * 100;
}

/** Return % change from the first trading day of the target year to today. */
function ytdReturn(history, date) {
  if (!history || history.length < 2) return null;
  const year = new Date(date).getFullYear();
  const jan1 = new Date(`${year}-01-01`);
  const yearStart = history.filter(h => new Date(h.date) >= jan1).at(-1);
  if (!yearStart) return null;
  const cur = close(history[0]);
  const base = close(yearStart);
  if (cur === null || base === null || base === 0) return null;
  return ((cur - base) / base) * 100;
}

function computeItem(ticker, { name, history }, date) {
  if (!history || history.length === 0) return null;
  const cur = close(history[0]);
  const prev = close(history[1]);
  if (cur === null) return null;

  return {
    name,
    ticker,
    current: r(cur, 4),
    d1:      prev !== null ? r(cur - prev, 4) : null,
    d1Pct:   prev !== null && prev !== 0 ? r(((cur - prev) / prev) * 100, 2) : null,
    d5Pct:   r(periodReturn(history, 5), 2),
    m1Pct:   r(periodReturn(history, 21), 2),
    ytdPct:  r(ytdReturn(history, date), 2),
    y1Pct:   r(periodReturn(history, 252), 2),
  };
}

export function computeMetrics(rawData) {
  const { date, instruments } = rawData;
  const buckets = rawData.instrument_buckets || {};

  const bucketToHeatmap = {
    indices: 'indices',
    commodities: 'commodities',
    yields: 'yields',
    fx: 'fx',
    sectors: 'sectors',
  };

  const market_heatmap = {};
  for (const [bucket, heatmapKey] of Object.entries(bucketToHeatmap)) {
    const tickers = Array.isArray(buckets[bucket]) ? buckets[bucket] : [];
    market_heatmap[heatmapKey] = tickers
      .map(ticker => (instruments[ticker] ? computeItem(ticker, instruments[ticker], date) : null))
      .filter(Boolean);
  }

  // Optional custom watchlist bucket for UI if present in config
  const watchlistTickers = Array.isArray(buckets.watchlist) ? buckets.watchlist : [];
  market_heatmap.watchlist = watchlistTickers
    .map(ticker => (instruments[ticker] ? computeItem(ticker, instruments[ticker], date) : null))
    .filter(Boolean);

  const vixTicker = (buckets.volatility || [])[0] || '^VIX';
  const vixData = instruments[vixTicker];
  const vix = vixData ? computeItem(vixTicker, vixData, date) : null;

  const mag7Tickers = Array.isArray(buckets.mag7) ? buckets.mag7 : [];
  const mag7 = mag7Tickers
    .map(t => (instruments[t] ? computeItem(t, instruments[t], date) : null))
    .filter(Boolean);

  const metrics = { date, market_heatmap, vix, mag7 };

  const dataDir = path.join(ROOT, 'data', date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(`Saved: data/${date}/metrics.json`);
  return metrics;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'raw-prices.json'), 'utf8'));
  computeMetrics(raw);
}
