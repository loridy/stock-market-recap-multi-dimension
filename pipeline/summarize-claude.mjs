/**
 * Stage 4 — LLM Synthesis (Claude)
 * Calls Claude once per report section using focused prompt templates.
 * Each call receives only the data relevant to that section.
 * Every claim in the output is grounded in facts from build-facts.mjs.
 * Saves to data/YYYY-MM-DD/summary.json.
 *
 * Requires: ANTHROPIC_API_KEY in environment (via .env or shell).
 *
 * Run standalone: node pipeline/summarize-claude.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = process.cwd();
const MODEL = 'claude-sonnet-4-6';

function loadPrompt(name) {
  return fs.readFileSync(path.join(ROOT, 'configs', 'prompts', `${name}.txt`), 'utf8');
}

/**
 * Call Claude with a system prompt and structured data as the user message.
 * Extracts JSON from the response — works with both fenced and bare JSON.
 */
async function callSection(client, promptName, data, label) {
  console.log(`  → ${label}...`);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: loadPrompt(promptName),
    messages: [{ role: 'user', content: JSON.stringify(data, null, 2) }],
  });

  const text = response.content[0]?.text ?? '';

  // Try fenced JSON block first, then bare JSON object
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  const raw    = text.match(/(\{[\s\S]*\})/);
  const jsonStr = fenced?.[1] ?? raw?.[1] ?? null;

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

export async function summarizeClaude(facts, metrics, analystConfig) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set.\n' +
      'Copy .env.example to .env and add your key, then re-run.'
    );
  }

  const client = new Anthropic({ apiKey });
  console.log('Running Claude synthesis (6 sections)...');

  // Run sections sequentially to stay within rate limits and for clear logging
  const execResult = await callSection(
    client, 'executive-summary',
    { facts, regime: facts.regime },
    'executive summary'
  );

  const marketStateResult = await callSection(
    client, 'market-state',
    { broad_market: facts.broad_market, volatility: facts.volatility, sectors: facts.sectors },
    'market state'
  );

  const sectorResult = await callSection(
    client, 'sector-rotation',
    { sectors: facts.sectors, heatmap_sectors: metrics.market_heatmap.sectors },
    'sector rotation'
  );

  const macroResult = await callSection(
    client, 'macro-drivers',
    { yield_curve: facts.yield_curve, fx: facts.fx, commodities: facts.commodities },
    'macro drivers'
  );

  const flowResult = await callSection(
    client, 'flow-positioning',
    { volatility: facts.volatility, sectors: facts.sectors, broad_market: facts.broad_market },
    'flow/positioning'
  );

  const analystResult = await callSection(
    client, 'analyst-view',
    { facts, analyst: analystConfig, mag7: facts.mag7 },
    `analyst view (${analystConfig?.name ?? 'default'})`
  );

  // Assemble summary with safe fallbacks when a section fails to parse
  const summary = {
    date:    facts.date,
    regime:  facts.regime,

    executive_summary: execResult.bullets ?? [
      `Market closed in ${facts.regime} regime.`,
      `SPY: ${facts.broad_market?.spy?.d1Pct ?? 'N/A'}%  |  VIX: ${facts.volatility?.current ?? 'N/A'}`,
    ],
    top_risks:    execResult.risks        ?? [],
    next_actions: execResult.next_actions ?? [],

    sections: {
      market_state:     marketStateResult,
      sector_rotation:  sectorResult,
      flow_positioning: flowResult,
      macro_drivers:    macroResult,
      signal_factor:    {},   // populated by internal signal library (future stage)
    },

    analyst_views: analystResult.analyst
      ? [analystResult]
      : [],
  };

  const dataDir = path.join(ROOT, 'data', facts.date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Saved: data/${facts.date}/summary.json`);
  return summary;
}

// Standalone execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  import('dotenv/config').catch(() => {});
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const facts   = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'facts.json'),   'utf8'));
  const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', date, 'metrics.json'), 'utf8'));
  const analyst = { name: 'Default Analyst', focus: { style: 'balanced', horizon: 'daily' } };
  await summarizeClaude(facts, metrics, analyst);
}
