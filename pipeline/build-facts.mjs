/**
 * Stage 3 — Rule-Based Pre-Summary
 * Builds deterministic, objective market facts from computed metrics.
 * No LLM involved — every value is directly derived from data.
 * Saves to data/YYYY-MM-DD/facts.json.
 *
 * Run standalone: node pipeline/build-facts.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function r(val, dec) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round(val * 10 ** dec) / 10 ** dec;
}

/** Sort items by a numeric key, descending (best first). */
function rankBy(items, key) {
  return [...items]
    .filter(i => i[key] !== null && i[key] !== undefined)
    .sort((a, b) => b[key] - a[key]);
}

function categorizeVix(level) {
  if (level === null) return 'unknown';
  if (level < 15) return 'low — risk-on';
  if (level < 20) return 'normal';
  if (level < 25) return 'elevated — caution warranted';
  if (level < 30) return 'high — risk-off';
  return 'extreme — fear';
}

function detectRegime(spyD1Pct, vixLevel, sectorDispersion) {
  if (spyD1Pct === null || vixLevel === null) return 'Mixed';
  if (spyD1Pct > 0.5 && vixLevel < 20) return 'Risk-On';
  if (spyD1Pct < -0.5 && vixLevel > 20) return 'Risk-Off';
  if (Math.abs(spyD1Pct) <= 0.3 && vixLevel < 18) return 'Neutral';
  return 'Mixed';
}

function buildYieldCurve(yields) {
  if (!yields || yields.length === 0) return null;
  const t3m  = yields.find(y => y.ticker === '^IRX');
  const t5y  = yields.find(y => y.ticker === '^FVX');
  const t10y = yields.find(y => y.ticker === '^TNX');
  const t30y = yields.find(y => y.ticker === '^TYX');

  const spread = (t10y && t3m) ? r(t10y.current - t3m.current, 2) : null;
  return {
    t3m_pct:  t3m?.current  ?? null,
    t5y_pct:  t5y?.current  ?? null,
    t10y_pct: t10y?.current ?? null,
    t30y_pct: t30y?.current ?? null,
    spread_3m_10y: spread,
    t10y_d1:    t10y?.d1    ?? null,
    t10y_d1Pct: t10y?.d1Pct ?? null,
    curve_shape: spread === null ? 'unknown'
      : spread < 0    ? 'inverted'
      : spread < 0.25 ? 'flat'
      : 'normal',
  };
}

export function buildFacts(metrics) {
  const { date, market_heatmap, vix, mag7 } = metrics;
  const { indices = [], sectors = [], commodities = [], yields = [], fx = [] } = market_heatmap;

  // --- Broad market ---
  const spy = indices.find(i => i.ticker === 'SPY');
  const qqq = indices.find(i => i.ticker === 'QQQ');
  const iwm = indices.find(i => i.ticker === 'IWM');
  const indicesByD1 = rankBy(indices, 'd1Pct');

  // --- Sectors ---
  const sectorsByD1 = rankBy(sectors, 'd1Pct');
  const d1Values = sectors.map(s => s.d1Pct).filter(v => v !== null);
  const sectorDispersion = d1Values.length > 1
    ? r(Math.max(...d1Values) - Math.min(...d1Values), 2)
    : null;

  // --- Regime ---
  const regime = detectRegime(spy?.d1Pct ?? null, vix?.current ?? null, sectorDispersion);

  // --- FX ---
  const dxy    = fx.find(f => f.ticker === 'DX-Y.NYB');
  const eurusd = fx.find(f => f.ticker === 'EURUSD=X');
  const usdjpy = fx.find(f => f.ticker === 'USDJPY=X');
  const gbpusd = fx.find(f => f.ticker === 'GBPUSD=X');

  // --- Commodities ---
  const gold = commodities.find(c => c.ticker === 'GC=F');
  const oil  = commodities.find(c => c.ticker === 'CL=F');

  // --- MAG7 ---
  const mag7ByD1 = rankBy(mag7, 'd1Pct');
  const mag7Avg  = mag7.length > 0
    ? r(mag7.reduce((s, m) => s + (m.d1Pct ?? 0), 0) / mag7.length, 2)
    : null;

  const facts = {
    date,
    regime,

    broad_market: {
      spy: spy  ? { current: spy.current,  d1Pct: spy.d1Pct,  ytdPct: spy.ytdPct }  : null,
      qqq: qqq  ? { current: qqq.current,  d1Pct: qqq.d1Pct,  ytdPct: qqq.ytdPct }  : null,
      iwm: iwm  ? { current: iwm.current,  d1Pct: iwm.d1Pct,  ytdPct: iwm.ytdPct }  : null,
      top_index:    indicesByD1[0]     ?? null,
      bottom_index: indicesByD1.at(-1) ?? null,
    },

    sectors: {
      leaders:    sectorsByD1.slice(0, 3),
      laggards:   sectorsByD1.slice(-3).reverse(),
      dispersion: sectorDispersion,
      note: sectorDispersion !== null
        ? (sectorDispersion > 2 ? 'high dispersion — selective rotation evident' : 'low dispersion — broad-based move')
        : 'dispersion unavailable',
    },

    volatility: vix ? {
      current:  vix.current,
      d1:       vix.d1,
      d1Pct:    vix.d1Pct,
      category: categorizeVix(vix.current),
    } : null,

    yield_curve: buildYieldCurve(yields),

    fx: {
      dxy:    dxy    ? { current: dxy.current,    d1Pct: dxy.d1Pct }    : null,
      eurusd: eurusd ? { current: eurusd.current, d1Pct: eurusd.d1Pct } : null,
      usdjpy: usdjpy ? { current: usdjpy.current, d1Pct: usdjpy.d1Pct } : null,
      gbpusd: gbpusd ? { current: gbpusd.current, d1Pct: gbpusd.d1Pct } : null,
    },

    commodities: {
      gold: gold ? { current: gold.current, d1Pct: gold.d1Pct, ytdPct: gold.ytdPct } : null,
      oil:  oil  ? { current: oil.current,  d1Pct: oil.d1Pct,  ytdPct: oil.ytdPct }  : null,
    },

    mag7: {
      avg_d1Pct: mag7Avg,
      leaders:   mag7ByD1.slice(0, 3),
      laggards:  mag7ByD1.slice(-3).reverse(),
    },
  };

  const dataDir = path.join(ROOT, 'data', date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'facts.json'), JSON.stringify(facts, null, 2));
  console.log(`Saved: data/${date}/facts.json`);
  return facts;
}

// Standalone execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'metrics.json'), 'utf8'));
  buildFacts(metrics);
}
