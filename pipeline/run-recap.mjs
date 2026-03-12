/**
 * Main Orchestrator
 * Runs the full pipeline:
 *   1. fetch-data       → data/YYYY-MM-DD/raw-prices.json
 *   1b. fetch-news      → data/YYYY-MM-DD/news.json
 *   2. compute-metrics  → data/YYYY-MM-DD/metrics.json
 *   3. build-facts      → data/YYYY-MM-DD/facts.json
 *   4. analyst-focus    → data/YYYY-MM-DD/analyst-focus.json
 *   5. summarize-llm    → data/YYYY-MM-DD/summary.json
 *   6. validate + render → reports/YYYY-MM-DD/{report.json, report.md, email.html}
 *
 * Usage:
 *   npm run recap -- [options]
 *
 * Options:
 *   --date YYYY-MM-DD   Target date (default: today)
 *   --analyst NAME      Analyst profile from configs/analysts/ (default: default)
 *   --market-date YYYY-MM-DD  Trading reference date for market context metadata
 *   --news-date YYYY-MM-DD    Date window used for news ingestion
 *   --skip-fetch        Reuse cached data/YYYY-MM-DD/ files (skip stages 1-3)
 *   --skip-news         Reuse cached data/YYYY-MM-DD/news.json
 *   --skip-focus        Reuse cached data/YYYY-MM-DD/analyst-focus.json
 *   --llm-provider NAME LLM provider: gemini|claude|deepseek (default: gemini)
 *   --skip-llm          Skip LLM call; use placeholder narrative (stage 5)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'js-yaml';
import Handlebars from 'handlebars';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { fetchData }       from './fetch-data.mjs';
import { fetchNews }       from './fetch-news.mjs';
import { computeMetrics }  from './compute-metrics.mjs';
import { buildFacts }      from './build-facts.mjs';
import { buildAndSaveAnalystFocus } from './build-analyst-focus.mjs';
import { summarizeClaude } from './summarize-claude.mjs';
import { summarizeGemini } from './summarize-gemini.mjs';
import { summarizeDeepseek } from './summarize-deepseek.mjs';

Handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2));

const ROOT = process.cwd();

// ── Helpers ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key  = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function readText(p) { return fs.readFileSync(p, 'utf8'); }
function readJson(p) { return JSON.parse(readText(p)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function loadAnalystConfig(name) {
  const dir   = path.join(ROOT, 'configs', 'analysts');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const exact = files.find(f => path.parse(f).name === name);
  if (exact) return YAML.load(readText(path.join(dir, exact)));
  if (name === 'default') {
    const d = files.find(f => path.parse(f).name === 'default');
    if (d) return YAML.load(readText(path.join(dir, d)));
  }
  throw new Error(`Analyst profile not found: ${name}. Available: ${files.join(', ')}`);
}

/** Load or run a stage, using a cached file when --skip-fetch is set. */
async function loadOrRun(cachePath, skipFetch, runFn) {
  if (skipFetch && fs.existsSync(cachePath)) {
    console.log(`  (cached) ${path.relative(ROOT, cachePath)}`);
    return readJson(cachePath);
  }
  return runFn();
}

/** Build a placeholder summary when --skip-llm is used. */
function placeholderSummary(facts) {
  return {
    date:    facts.date,
    regime:  facts.regime,
    executive_summary: [
      `Regime: ${facts.regime}. SPY ${facts.broad_market?.spy?.d1Pct ?? 'N/A'}%, VIX ${facts.volatility?.current ?? 'N/A'}.`,
      `Sector leaders: ${(facts.sectors?.leaders ?? []).map(s => s.name).join(', ') || 'N/A'}.`,
      `10Y yield: ${facts.yield_curve?.t10y_pct ?? 'N/A'}%. DXY ${facts.fx?.dxy?.d1Pct ?? 'N/A'}%.`,
    ],
    top_risks:    ['[LLM skipped — run without --skip-llm for narrative]'],
    next_actions: ['Run full pipeline with ANTHROPIC_API_KEY set.'],
    sections: {
      market_state:     { objective: '[placeholder]', regime_tag: facts.regime.toLowerCase() },
      sector_rotation:  { leadership: '[placeholder]' },
      flow_positioning: { move_quality: 'unclear', confidence: 'low' },
      macro_drivers:    { dominant_theme: '[placeholder]' },
      signal_factor:    {},
    },
    analyst_views: [],
  };
}

// ── Assemble final report ──────────────────────────────────────────────────

function assembleReport(date, project, summary, metrics, analyst, news, analystFocus, context = {}) {
  return {
    date,
    trading_day: context.marketDate || date,
    news_date: context.newsDate || date,
    project,
    current_regime: summary.regime,
    executive_summary: summary.executive_summary,

    sections: summary.sections,

    market_heatmap: metrics.market_heatmap,
    breaking_news: (news?.items ?? []).slice(0, 5),
    analyst_focus: analystFocus,

    analyst_views: summary.analyst_views.length > 0
      ? summary.analyst_views
      : [{
          analyst:    analyst.name,
          focus:      `${analyst.focus?.style ?? 'balanced'} | ${analyst.focus?.horizon ?? 'daily'}`,
          highlights: [`Coverage: ${(analyst.coverage?.assets ?? []).join(', ')}`],
          risks:      summary.top_risks ?? [],
          actions:    summary.next_actions ?? [],
        }],

    next_actions: summary.next_actions ?? [],
    top_risks:    summary.top_risks    ?? [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args        = parseArgs(process.argv);
  const date        = args.date    || new Date().toISOString().slice(0, 10);
  const analystName = args.analyst || 'default';
  const marketDate  = args['market-date'] || date;
  const newsDate    = args['news-date'] || marketDate;
  const llmProvider = (args['llm-provider'] || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const skipFetch   = !!args['skip-fetch'];
  const skipNews    = !!args['skip-news'];
  const skipFocus   = !!args['skip-focus'];
  const skipLlm     = !!args['skip-llm'];
  const project     = 'Stock Market Recap (Multi-dimension)';

  console.log(`\n=== Market Recap: ${date} | analyst: ${analystName} ===\n`);

  const analyst    = loadAnalystConfig(analystName);
  const dataDir    = path.join(ROOT, 'data', date);

  // Stage 1 — Fetch
  console.log('[1/5] Fetching market data...');
  const rawData = await loadOrRun(
    path.join(dataDir, 'raw-prices.json'), skipFetch,
    () => fetchData(date)
  );

  // Stage 1b — News
  console.log('[1b/5] Fetching market news...');
  const news = await loadOrRun(
    path.join(dataDir, 'news.json'), skipNews,
    () => fetchNews(date, { newsDate })
  );

  // Stage 2 — Metrics
  console.log('[2/5] Computing metrics...');
  const metrics = await loadOrRun(
    path.join(dataDir, 'metrics.json'), skipFetch,
    () => computeMetrics(rawData)
  );

  // Stage 3 — Facts
  console.log('[3/5] Building deterministic facts...');
  const facts = await loadOrRun(
    path.join(dataDir, 'facts.json'), skipFetch,
    () => buildFacts(metrics)
  );

  // Stage 4 — Analyst focus (deterministic)
  console.log('[4/5] Building analyst focus cards...');
  const analystFocus = await loadOrRun(
    path.join(dataDir, 'analyst-focus.json'), skipFocus,
    () => buildAndSaveAnalystFocus(date, { facts, metrics, news })
  );

  // Stage 5 — LLM synthesis
  console.log(`[5/5] Synthesizing with ${llmProvider}...`);
  let summary;
  if (skipLlm) {
    summary = placeholderSummary(facts);
  } else {
    try {
      if (llmProvider === 'claude') {
        summary = await summarizeClaude(facts, metrics, analyst);
      } else if (llmProvider === 'deepseek') {
        summary = await summarizeDeepseek(facts, metrics, analyst);
      } else {
        summary = await summarizeGemini(facts, metrics, analyst);
      }
    } catch (err) {
      console.warn(`  [warn] LLM synthesis failed (${llmProvider}): ${err.message}`);
      console.warn('  [warn] Falling back to placeholder summary.');
      summary = placeholderSummary(facts);
    }
  }

  // Assemble, validate, render
  const report = assembleReport(date, project, summary, metrics, analyst, news, analystFocus, { marketDate, newsDate });

  const schema   = readJson(path.join(ROOT, 'reports', 'template', 'report.schema.json'));
  const ajv      = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(report)) {
    console.error('\nSchema validation failed:');
    validate.errors?.forEach(e => console.error(' •', e.instancePath, e.message));
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'reports', date);
  ensureDir(outDir);

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const mdTpl    = Handlebars.compile(readText(path.join(ROOT, 'reports', 'template', 'report-template.md')), { noEscape: true });
  fs.writeFileSync(path.join(outDir, 'report.md'), mdTpl(report));

  const emailTpl = Handlebars.compile(readText(path.join(ROOT, 'reports', 'template', 'email-template.html')), { noEscape: true });
  fs.writeFileSync(path.join(outDir, 'email.html'), emailTpl(report));

  console.log(`\nGenerated:`);
  console.log(`  reports/${date}/report.json`);
  console.log(`  reports/${date}/report.md`);
  console.log(`  reports/${date}/email.html`);
  console.log('\nDone.\n');
}

main().catch(err => { console.error(err.message); process.exit(1); });
