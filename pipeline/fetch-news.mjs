/**
 * Stage 1b — News Ingestion
 * Fetches and normalizes market headlines from:
 *   1) RSS feeds (primary, current baseline)
 *   2) newsfilter API (secondary/augmenting source)
 * Saves to data/YYYY-MM-DD/news.json.
 *
 * Run standalone: node pipeline/fetch-news.mjs [YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchNewsfilter } from './fetch-newsfilter.mjs';

const ROOT = process.cwd();

const FEEDS = [
  // Reuters / CNBC / MarketWatch baseline
  { source: 'Thomson Reuters IR News', url: 'https://ir.thomsonreuters.com/rss/news-releases.xml?items=30' },
  { source: 'CNBC Markets', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { source: 'CNBC World', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { source: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },

  // Additional broad financial sources
  { source: 'Financial Times - Home', url: 'https://www.ft.com/rss/home' },
  { source: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { source: 'Investing.com Markets', url: 'https://www.investing.com/rss/news_25.rss' },
  { source: 'SEC Press Releases', url: 'https://www.sec.gov/news/pressreleases.rss' },
];

function decodeXml(str = '') {
  return str
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
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
      _origin: 'rss',
    });
  }
  return items;
}

function scoreHeadline(item) {
  const title = (item.title || '').toLowerCase();
  let score = 0;

  const keywords = [
    'fed', 'inflation', 'treasury', 'yield', 'rate', 'jobs',
    'earnings', 'guidance', 'ai', 'chip', 'semiconductor',
    'oil', 'gold', 'dollar', 'vix', 's&p', 'nasdaq', 'dow'
  ];

  for (const kw of keywords) if (title.includes(kw)) score += 1;

  // Prefer newsfilter slightly during transition while keeping RSS fallback.
  if (item._origin === 'newsfilter') score += 1.5;

  if (item.published_at) {
    const ageHours = (Date.now() - new Date(item.published_at).getTime()) / 36e5;
    if (Number.isFinite(ageHours)) score += Math.max(0, 24 - ageHours) / 24;
  }

  return score;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const key = `${(i.title || '').toLowerCase()}|${i.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchRssItems() {
  const collected = [];

  await Promise.all(FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, {
        headers: { 'user-agent': 'market-recap-pipeline/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      collected.push(...parseRss(xml, feed.source));
    } catch (err) {
      console.warn(`  [warn] news feed failed (${feed.source}): ${err.message}`);
    }
  }));

  return collected;
}

export async function fetchNews(date, { limit = 20, newsDate = date } = {}) {
  const rssItems = await fetchRssItems();

  const fromIso = `${newsDate}T00:00:00.000Z`;
  const toIso = `${newsDate}T23:59:59.999Z`;

  let nfItems = [];
  try {
    nfItems = (await fetchNewsfilter({ fromIso, toIso, limit: 20 }))
      .map((i) => ({ ...i, _origin: 'newsfilter' }));
  } catch (err) {
    console.warn(`  [warn] newsfilter fetch failed: ${err.message}`);
  }

  const items = dedupe([...rssItems, ...nfItems])
    .sort((a, b) => scoreHeadline(b) - scoreHeadline(a))
    .slice(0, limit)
    .map(({ _origin, ...rest }) => rest);

  const out = {
    date,
    news_date: newsDate,
    fetched_at: new Date().toISOString(),
    sources: {
      rss_count: rssItems.length,
      newsfilter_count: nfItems.length,
      strategy: 'rss_baseline_plus_newsfilter_secondary',
    },
    items,
  };

  const dataDir = path.join(ROOT, 'data', date);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news.json'), JSON.stringify(out, null, 2));
  console.log(`Saved: data/${date}/news.json (${items.length} items)`);
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  await fetchNews(date);
}
