/**
 * newsfilter adapter (secondary source)
 *
 * Uses newsfilter Query API and returns normalized items:
 * { title, source, url, published_at }
 *
 * Env:
 * - NEWSFILTER_API_KEY (preferred)
 * - NEWSFILTER_API_TOKEN (alias)
 */

const ENDPOINT = 'https://api.newsfilter.io/public/actions';

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeArticle(a) {
  return {
    title: a?.title?.trim() || '',
    source: a?.source?.name || a?.source?.id || 'newsfilter',
    url: a?.url || '',
    published_at: isoOrNull(a?.publishedAt),
  };
}

function compact(items) {
  return items.filter((i) => i.title && /^https?:\/\//.test(i.url));
}

export async function fetchNewsfilter({
  fromIso,
  toIso,
  symbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA'],
  limit = 20,
} = {}) {
  const apiKey = process.env.NEWSFILTER_API_KEY || process.env.NEWSFILTER_API_TOKEN;
  if (!apiKey) {
    console.warn('  [warn] NEWSFILTER_API_KEY not set; skipping newsfilter source.');
    return [];
  }

  const start = fromIso || new Date(Date.now() - 36e5 * 24).toISOString();
  const end = toIso || new Date().toISOString();

  const symbolQuery = symbols.length ? `symbols:(${symbols.join(' OR ')})` : '';
  const timeQuery = `(publishedAt:[${start} TO ${end}])`;
  const queryString = [symbolQuery, timeQuery].filter(Boolean).join(' AND ');

  const body = {
    type: 'filterArticles',
    queryString,
    from: 0,
    size: Math.min(Math.max(limit, 1), 50),
    sort: [{ publishedAt: { order: 'desc' } }],
  };

  // newsfilter historically supports token either as query parameter or in payload.
  // We set both for compatibility.
  body.token = apiKey;
  const url = `${ENDPOINT}?token=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`newsfilter HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = Array.isArray(data) ? data : (data?.articles || data?.results || []);
  return compact(raw.map(normalizeArticle));
}
