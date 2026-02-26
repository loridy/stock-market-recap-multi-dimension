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

// v3 API requires instantiation; suppress the deprecation notice for historical()
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export const INSTRUMENTS = {
  indices: [
    { ticker: 'SPY',  name: 'S&P 500' },
    { ticker: 'QQQ',  name: 'Nasdaq 100' },
    { ticker: 'IWM',  name: 'Russell 2000' },
    { ticker: 'DIA',  name: 'Dow Jones' },
    { ticker: 'EFA',  name: 'MSCI EAFE' },
    { ticker: 'EEM',  name: 'MSCI EM' },
  ],
  sectors: [
    { ticker: 'XLK',  name: 'Technology' },
    { ticker: 'XLC',  name: 'Communication Services' },
    { ticker: 'XLY',  name: 'Consumer Discretionary' },
    { ticker: 'XLP',  name: 'Consumer Staples' },
    { ticker: 'XLF',  name: 'Financials' },
    { ticker: 'XLV',  name: 'Health Care' },
    { ticker: 'XLI',  name: 'Industrials' },
    { ticker: 'XLE',  name: 'Energy' },
    { ticker: 'XLB',  name: 'Materials' },
    { ticker: 'XLRE', name: 'Real Estate' },
    { ticker: 'XLU',  name: 'Utilities' },
  ],
  commodities: [
    { ticker: 'GC=F', name: 'Gold' },
    { ticker: 'CL=F', name: 'WTI Crude Oil' },
    { ticker: 'SI=F', name: 'Silver' },
    { ticker: 'NG=F', name: 'Natural Gas' },
  ],
  yields: [
    { ticker: '^IRX', name: 'US 3M T-Bill' },
    { ticker: '^FVX', name: 'US 5Y Treasury' },
    { ticker: '^TNX', name: 'US 10Y Treasury' },
    { ticker: '^TYX', name: 'US 30Y Treasury' },
  ],
  fx: [
    { ticker: 'EURUSD=X', name: 'EUR/USD' },
    { ticker: 'USDJPY=X', name: 'USD/JPY' },
    { ticker: 'GBPUSD=X', name: 'GBP/USD' },
    { ticker: 'DX-Y.NYB', name: 'DXY (USD Index)' },
  ],
  volatility: [
    { ticker: '^VIX', name: 'VIX' },
  ],
  mag7: [
    { ticker: 'AAPL',  name: 'Apple' },
    { ticker: 'MSFT',  name: 'Microsoft' },
    { ticker: 'NVDA',  name: 'NVIDIA' },
    { ticker: 'AMZN',  name: 'Amazon' },
    { ticker: 'META',  name: 'Meta' },
    { ticker: 'GOOGL', name: 'Alphabet' },
    { ticker: 'TSLA',  name: 'Tesla' },
  ],
};

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
  // Fetch 1 year + 15 day buffer for ytd/y1 return calculations
  const period1 = new Date(date);
  period1.setFullYear(period1.getFullYear() - 1);
  period1.setDate(period1.getDate() - 15);
  const period1Str = period1.toISOString().slice(0, 10);

  const allTickers = Object.values(INSTRUMENTS).flat();
  const rawData = {
    date,
    fetched_at: new Date().toISOString(),
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
