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
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

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
      for (const t of tickers) {
        // sequential to stay polite with source API
        out.push(await validateTicker(t));
      }
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

    // static routes
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      return sendFile(res, path.join(ROOT, 'index.html'));
    }
    if (req.method === 'GET' && u.pathname === '/settings') {
      return sendFile(res, path.join(ROOT, 'settings.html'));
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
});
