/**
 * Stage 5 — LLM Synthesis (DeepSeek Chat)
 * Uses DeepSeek chat completions (OpenAI-compatible endpoint).
 * Saves to data/YYYY-MM-DD/summary.json.
 *
 * Requires: DEEPSEEK_API_KEY in environment.
 *
 * Run standalone: node pipeline/summarize-deepseek.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const ENDPOINT = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';

function loadPrompt(name) {
  return fs.readFileSync(path.join(ROOT, 'configs', 'prompts', `${name}.txt`), 'utf8');
}

function extractJson(text = '') {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = text.match(/(\{[\s\S]*\})/);
  return fenced?.[1] ?? raw?.[1] ?? null;
}

async function callSection(apiKey, promptName, data, label) {
  console.log(`  → ${label}...`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.2),
      max_tokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 700),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${loadPrompt(promptName)}\n\nReturn JSON only. No markdown fences.`,
        },
        {
          role: 'user',
          content: JSON.stringify(data, null, 2),
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const out = await res.json();
  const text = out?.choices?.[0]?.message?.content || '';
  const jsonStr = extractJson(text);

  if (!jsonStr) {
    console.warn(`  [warn] Could not extract JSON for "${label}". Raw response saved.`);
    return { _raw: text };
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn(`  [warn] JSON parse failed for "${label}": ${e.message}`);
    return { _raw: text };
  }
}

export async function summarizeDeepseek(facts, metrics, analystConfig) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPSEEK_API_KEY is not set.\n' +
      'Copy .env.example to .env and add your key, then re-run.'
    );
  }

  console.log(`Running DeepSeek synthesis (6 sections) with model: ${MODEL}...`);

  const execResult = await callSection(
    apiKey, 'executive-summary',
    { facts, regime: facts.regime },
    'executive summary'
  );

  const marketStateResult = await callSection(
    apiKey, 'market-state',
    { broad_market: facts.broad_market, volatility: facts.volatility, sectors: facts.sectors },
    'market state'
  );

  const sectorResult = await callSection(
    apiKey, 'sector-rotation',
    { sectors: facts.sectors, heatmap_sectors: metrics.market_heatmap.sectors },
    'sector rotation'
  );

  const macroResult = await callSection(
    apiKey, 'macro-drivers',
    { yield_curve: facts.yield_curve, fx: facts.fx, commodities: facts.commodities },
    'macro drivers'
  );

  const flowResult = await callSection(
    apiKey, 'flow-positioning',
    { volatility: facts.volatility, sectors: facts.sectors, broad_market: facts.broad_market },
    'flow/positioning'
  );

  const analystResult = await callSection(
    apiKey, 'analyst-view',
    { facts, analyst: analystConfig, mag7: facts.mag7 },
    `analyst view (${analystConfig?.name ?? 'default'})`
  );

  const summary = {
    date: facts.date,
    regime: facts.regime,

    executive_summary: execResult.bullets ?? [
      `Market closed in ${facts.regime} regime.`,
      `SPY: ${facts.broad_market?.spy?.d1Pct ?? 'N/A'}%  |  VIX: ${facts.volatility?.current ?? 'N/A'}`,
      `Sector dispersion: ${facts.sectors?.dispersion ?? 'N/A'} with top leader ${facts.sectors?.leaders?.[0]?.ticker ?? 'N/A'}.`,
    ],
    top_risks: execResult.risks ?? [],
    next_actions: execResult.next_actions ?? [],

    sections: {
      market_state: marketStateResult,
      sector_rotation: sectorResult,
      flow_positioning: flowResult,
      macro_drivers: macroResult,
      signal_factor: {},
    },

    analyst_views: analystResult.analyst ? [analystResult] : [],
  };

  const dataDir = path.join(ROOT, 'data', facts.date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Saved: data/${facts.date}/summary.json`);
  return summary;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  import('dotenv/config').catch(() => {});
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'facts.json'), 'utf8'));
  const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'metrics.json'), 'utf8'));
  const analyst = { name: 'Default Analyst', focus: { style: 'balanced', horizon: 'daily' } };
  await summarizeDeepseek(facts, metrics, analyst);
}
