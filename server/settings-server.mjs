import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import YAML from 'js-yaml';
import YahooFinance from 'yahoo-finance2';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4180);

const ANALYST_DIR = path.join(ROOT, 'configs', 'analysts');
const INSTRUMENTS_PATH = path.join(ROOT, 'configs', 'instruments.json');
const RUNTIME_DIR = path.join(ROOT, 'configs', 'runtime');
const SETTINGS_PATH = path.join(RUNTIME_DIR, 'settings.json');

const LIVE_INTERVAL_MS = 60_000;
const LIVE_NEWS_FEEDS = [
  { source: 'Thomson Reuters IR News', url: 'https://ir.thomsonreuters.com/rss/news-releases.xml?items=30' },
  { source: 'CNBC Markets', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { source: 'CNBC World', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { source: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'Financial Times - Home', url: 'https://www.ft.com/rss/home' },
  { source: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { source: 'Investing.com Markets', url: 'https://www.investing.com/rss/news_25.rss' },
  { source: 'SEC Press Releases', url: 'https://www.sec.gov/news/pressreleases.rss' }
];

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

const liveState = {
  updated_at: null,
  news: [],
  status: 'starting',
  error: null,
};

function json(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  }[ext] || 'text/plain; charset=utf-8';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      if (!b) return resolve({});
      try { resolve(JSON.parse(b)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function readRuntimeSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { watchlist: [] };
  }
  return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
}

function writeRuntimeSettings(next) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
}

function loadInstruments() {
  if (!fs.existsSync(INSTRUMENTS_PATH)) return {};
  return JSON.parse(fs.readFileSync(INSTRUMENTS_PATH, 'utf8'));
}

function saveInstruments(next) {
  fs.writeFileSync(INSTRUMENTS_PATH, JSON.stringify(next, null, 2));
}

function loadAnalysts() {
  const files = fs.readdirSync(ANALYST_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const analysts = [];
  for (const f of files) {
    const full = path.join(ANALYST_DIR, f);
    const obj = YAML.load(fs.readFileSync(full, 'utf8')) || {};
    analysts.push({ id: path.parse(f).name, ...obj });
  }
  analysts.sort((a, b) => a.id.localeCompare(b.id));
  return analysts;
}

function toList(str = '') {
  return String(str)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeAnalyst(input) {
  return {
    name: input.name || input.id,
    owner: input.owner || 'Loridy',
    coverage: {
      assets: toList(input.assets || 'equities,rates,fx,commodities'),
      sectors: toList(input.sectors || 'broad-market'),
    },
    focus: {
      horizon: input.horizon || 'daily',
      style: input.style || 'balanced',
      key_metrics: toList(input.key_metrics || 'index_return,sector_dispersion,volatility_regime'),
    },
    watchlist: {
      tickers: toList(input.tickers || ''),
      themes: toList(input.themes || ''),
    },
    output: {
      verbosity: input.verbosity || 'medium',
      sections: toList(input.sections || 'executive_summary,market_state,macro_drivers,next_actions'),
    },
  };
}

function sanitizeId(id = '') {
  return String(id).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

function classifyTicker(ticker = '') {
  const t = String(ticker).toUpperCase();
  if (t.endsWith('.HK')) return 'HK';
  if (t.includes('=X') || t.includes('=F') || t.startsWith('^')) return 'Macro/Index';
  return 'US/Global';
}

async function validateTicker(ticker) {
  const marketGuess = classifyTicker(ticker);
  try {
    const q = await yahooFinance.quote(ticker);
    const returned = String(q?.symbol || '').toUpperCase();
    const requested = String(ticker || '').toUpperCase();
    const exact = returned === requested;
    return {
      ticker,
      valid: !!exact,
      marketGuess,
      name: q?.shortName || q?.longName || ticker,
      currency: q?.currency || null,
      exchange: q?.fullExchangeName || q?.exchange || null,
      returnedSymbol: returned || null,
      note: exact ? null : `Resolved to ${returned || 'unknown'} instead of ${requested}`,
    };
  } catch (e) {
    return { ticker, valid: false, marketGuess, error: e.message };
  }
}

function decodeXml(str = '') {
  return str
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .trim();
}

function textBetween(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(m?.[1] ?? '');
}

function parseRss(xml, sourceFallback) {
  const items = [];
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const chunk of chunks) {
    const title = textBetween(chunk, 'title');
    const link = textBetween(chunk, 'link');
    const pubDate = textBetween(chunk, 'pubDate');
    const source = textBetween(chunk, 'source') || sourceFallback;
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    items.push({
      title,
      source,
      url: link,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }
  return items;
}

function dedupeNews(items) {
  const seen = new Set();
  return items.filter((i) => {
    const key = `${(i.title || '').toLowerCase()}|${i.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchLiveNews() {
  const collected = [];
  await Promise.all(LIVE_NEWS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, { headers: { 'user-agent': 'market-recap-live/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      collected.push(...parseRss(xml, feed.source));
    } catch {
      // ignore single feed failures for live panel
    }
  }));
  return dedupeNews(collected)
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
    .slice(0, 12);
}

async function refreshLiveSnapshot() {
  try {
    liveState.status = 'updating';
    const news = await fetchLiveNews();
    liveState.news = news;
    liveState.updated_at = new Date().toISOString();
    liveState.status = 'ok';
    liveState.error = null;
  } catch (e) {
    liveState.status = 'error';
    liveState.error = e.message;
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && u.pathname === '/api/settings') {
      return json(res, 200, {
        runtime: readRuntimeSettings(),
        instruments: loadInstruments(),
        analysts: loadAnalysts(),
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/live/snapshot') {
      return json(res, 200, { ok: true, ...liveState, interval_seconds: LIVE_INTERVAL_MS / 1000 });
    }

    if (req.method === 'POST' && u.pathname === '/api/live/refresh') {
      await refreshLiveSnapshot();
      return json(res, 200, { ok: true, ...liveState, interval_seconds: LIVE_INTERVAL_MS / 1000 });
    }

    if (req.method === 'POST' && u.pathname === '/api/settings/watchlist') {
      const body = await parseBody(req);
      const list = Array.isArray(body.watchlist) ? body.watchlist : [];
      writeRuntimeSettings({ watchlist: list });
      return json(res, 200, { ok: true, watchlist: list });
    }

    if (req.method === 'POST' && u.pathname === '/api/settings/instruments') {
      const body = await parseBody(req);
      const next = body.instruments && typeof body.instruments === 'object' ? body.instruments : null;
      if (!next) return json(res, 400, { ok: false, error: 'Missing instruments payload' });
      saveInstruments(next);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && u.pathname === '/api/settings/validate-tickers') {
      const body = await parseBody(req);
      const tickers = Array.isArray(body.tickers) ? body.tickers.slice(0, 80) : [];
      const out = [];
      for (const t of tickers) out.push(await validateTicker(t));
      return json(res, 200, { ok: true, results: out });
    }

    if (req.method === 'POST' && u.pathname === '/api/settings/analyst') {
      const body = await parseBody(req);
      const id = sanitizeId(body.id);
      if (!id) return json(res, 400, { ok: false, error: 'Missing analyst id' });

      const full = path.join(ANALYST_DIR, `${id}.yaml`);
      const analyst = normalizeAnalyst({ ...body, id });
      fs.writeFileSync(full, YAML.dump(analyst, { lineWidth: 120 }));
      return json(res, 200, { ok: true, id, path: full });
    }

    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      return sendFile(res, path.join(ROOT, 'index.html'));
    }
    if (req.method === 'GET' && u.pathname === '/live') {
      return sendFile(res, path.join(ROOT, 'live.html'));
    }

    const localPath = path.join(ROOT, u.pathname.replace(/^\/+/, ''));
    if (localPath.startsWith(ROOT) && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
      return sendFile(res, localPath);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Settings server running at http://localhost:${PORT}`);
  refreshLiveSnapshot().catch(() => {});
  setInterval(() => { refreshLiveSnapshot().catch(() => {}); }, LIVE_INTERVAL_MS);
});
