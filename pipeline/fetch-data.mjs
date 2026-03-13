/**
 * Stage 1 — Data Ingestion
 * Fetches raw market data from Yahoo Finance for all tracked instruments.
 * Saves to data/YYYY-MM-DD/raw-prices.json (1 year of daily history per ticker).
 *
 * Run standalone: node pipeline/fetch-data.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';
import YahooFinance from 'yahoo-finance2';

const ROOT = process.cwd();
const INSTRUMENTS_PATH = path.join(ROOT, 'configs', 'instruments.json');

// v3 API requires instantiation; suppress the deprecation notice for historical()
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

function readInstrumentConfig() {
  if (!fs.existsSync(INSTRUMENTS_PATH)) {
    throw new Error('Missing configs/instruments.json');
  }
  return JSON.parse(fs.readFileSync(INSTRUMENTS_PATH, 'utf8'));
}

async function fetchTickerHistory(ticker, period1) {
  try {
    const history = await yahooFinance.historical(ticker, {
      period1,
      period2: new Date().toISOString().slice(0, 10),
      interval: '1d',
    });
    // Sort descending: most recent first
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    console.warn(`  [warn] ${ticker}: ${err.message}`);
    return null;
  }
}

export async function fetchData(date) {
  const instrumentConfig = readInstrumentConfig();

  // Fetch 1 year + 15 day buffer for ytd/y1 return calculations
  const period1 = new Date(date);
  period1.setFullYear(period1.getFullYear() - 1);
  period1.setDate(period1.getDate() - 15);
  const period1Str = period1.toISOString().slice(0, 10);

  const allTickers = Object.values(instrumentConfig).flat();
  const bucketTickers = {};
  for (const [k, arr] of Object.entries(instrumentConfig)) {
    bucketTickers[k] = (arr || []).map(x => x.ticker);
  }

  const rawData = {
    date,
    fetched_at: new Date().toISOString(),
    instrument_buckets: bucketTickers,
    instruments: {},
  };

  console.log(`Fetching ${allTickers.length} instruments from ${period1Str} to ${date}...`);

  // Batch fetches (5 at a time) to stay within rate limits
  const BATCH = 5;
  for (let i = 0; i < allTickers.length; i += BATCH) {
    const batch = allTickers.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ ticker, name }) => {
      const history = await fetchTickerHistory(ticker, period1Str);
      rawData.instruments[ticker] = { name, history };
      process.stdout.write('.');
    }));
  }
  console.log(' done.');

  const dataDir = path.join(ROOT, 'data', date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'raw-prices.json'), JSON.stringify(rawData, null, 2));
  console.log(`Saved: data/${date}/raw-prices.json`);
  return rawData;
}

// Standalone execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  await fetchData(date);
}
