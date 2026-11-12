import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchWikimediaLive, parseWikimediaItems, loadWikimediaBatch, retryAfterSeconds, WikimediaError } from '../app/lib/wikimedia.ts';

function page(name, overrides = {}) {
  return { title: `File:${name}.svg`, imageinfo: [{
    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.svg?utm_source=commons`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}.svg`,
    mime: 'image/svg+xml', size: 1000, ...overrides,
  }] };
}
const liveData = { query: { pages: Array.from({ length: 12 }, (_, i) => page(`Image${i}`)) } };
const json = (data, init) => new Response(JSON.stringify(data), init);
const archiveItem = { title: 'Saved.svg', previewImage: '/wikimedia-archive/Saved.svg',
  source: 'wikimedia.org', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Saved.svg',
  downloadUrl: '/wikimedia-archive/Saved.svg', _debug_source: 'archive' };

test('one search supplies six live originals without requesting thumbnail conversions', async () => {
  const calls = [];
  const items = await fetchWikimediaLive(6, { browser: true, fetcher: async (input, init) => {
    calls.push(input);
    const u = new URL(input);
    assert.equal(u.searchParams.get('generator'), 'search');
    assert.equal(u.searchParams.get('gsrsort'), 'random');
    assert.equal(u.searchParams.get('prop'), 'imageinfo');
    assert.equal(u.searchParams.has('iiurlwidth'), false);
    assert.match(init.headers['Api-User-Agent'], /RandomSVG.*github.com/);
    assert.equal(init.headers['User-Agent'], undefined);
    return json(liveData);
  } });
  assert.equal(calls.length, 1);
  assert.equal(items.length, 6);
  assert(items.every(item => item._debug_source === 'live' && item.previewImage === item.originalSvgUrl));
  assert.equal(new Set(items.map(item => item.sourceUrl)).size, 6);
  assert.equal(new URL(items[0].downloadUrl).searchParams.has('download'), true);
  assert.equal(new URL(items[0].downloadUrl).searchParams.get('utm_source'), 'commons');
});

test('deleted files, wrong MIME, huge SVGs, duplicate and foreign URLs are excluded', () => {
  const items = parseWikimediaItems({ query: { pages: [
    page('OK'), page('OK'), { title: 'Deleted' }, page('PNG', { mime: 'image/png' }),
    page('Large', { size: 3_000_000 }), page('Foreign', { url: 'https://example.com/file.svg' }),
    page('ForeignPage', { descriptionurl: 'https://example.com/file' }),
  ] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'OK.svg');
});

test('HTTP and API-level rate limits honor numeric and date Retry-After', async () => {
  assert.equal(retryAfterSeconds('120'), 120);
  assert.equal(retryAfterSeconds('Thu, 12 Nov 2026 00:01:30 GMT', Date.parse('2026-11-12T00:00:00Z')), 90);
  assert.equal(retryAfterSeconds(null), 60);
  for (const response of [
    json({}, { status: 429, headers: { 'Retry-After': '90' } }),
    json({ error: { code: 'maxlag' } }, { headers: { 'Retry-After': '90' } }),
  ]) {
    await assert.rejects(fetchWikimediaLive(1, { fetcher: async () => response }),
      error => error instanceof WikimediaError && error.retryAfterSeconds === 90);
  }
});

test('working browser API never calls the potentially blocked server', async () => {
  const result = await loadWikimediaBatch(6, { fetcher: async input => {
    assert(String(input).startsWith('https://commons.wikimedia.org/'));
    return json(liveData);
  } });
  assert.equal(result.items.length, 6);
  assert.equal(result.browserRetryAt, 0);
});

test('network timeout uses the server, then retries direct API on the next update', async () => {
  let directCalls = 0;
  const fetcher = async input => {
    if (String(input).startsWith('https:')) {
      directCalls++;
      if (directCalls === 1) throw new DOMException('timeout', 'TimeoutError');
      return json(liveData);
    }
    return json({ items: [archiveItem] });
  };
  const first = await loadWikimediaBatch(1, { fetcher });
  assert.equal(first.items[0]._debug_source, 'archive');
  assert.equal(first.browserRetryAt, 0);
  const second = await loadWikimediaBatch(1, { fetcher, browserRetryAt: first.browserRetryAt });
  assert.equal(second.items[0]._debug_source, 'live');
  assert.equal(directCalls, 2);
});

test('real browser 429 delays only direct API while server live results still work', async () => {
  let directCalls = 0;
  const fetcher = async input => {
    if (String(input).startsWith('https:')) {
      directCalls++;
      return json({}, { status: 429, headers: { 'Retry-After': '120' } });
    }
    return json({ items: parseWikimediaItems(liveData).slice(0, 2) });
  };
  const first = await loadWikimediaBatch(2, { fetcher });
  assert(first.browserRetryAt > Date.now() + 110_000);
  assert(first.items.every(item => item._debug_source === 'live'));
  const second = await loadWikimediaBatch(2, { fetcher, browserRetryAt: first.browserRetryAt });
  assert.equal(directCalls, 1);
  assert(second.items.every(item => item._debug_source === 'live'));
});

test('static archive remains available if direct API and server both fail', async () => {
  const result = await loadWikimediaBatch(2, { fetcher: async input => {
    if (input === '/wikimedia-archive/index.json') return json([
      { filename: 'One.svg', title: 'One', wikimediaUrl: 'https://commons.wikimedia.org/wiki/File:One.svg' },
      { filename: 'Two.svg', title: 'Two', wikimediaUrl: 'https://commons.wikimedia.org/wiki/File:Two.svg' },
    ]);
    throw new TypeError('Failed to fetch');
  } });
  assert.equal(result.items.length, 2);
  assert(result.items.every(item => item._debug_source === 'archive'));
  assert.equal(new Set(result.items.map(item => item.sourceUrl)).size, 2);
  assert.equal(result.browserRetryAt, 0);
});

test('partial live batch survives an overlapping server batch without empty slots', async () => {
  const partial = { query: { pages: [page('One')] } };
  const result = await loadWikimediaBatch(2, { fetcher: async input => {
    if (String(input).startsWith('https:')) return json(partial);
    if (input === '/wikimedia-archive/index.json') return json([
      { filename: 'Saved.svg', title: 'Saved', wikimediaUrl: archiveItem.sourceUrl },
    ]);
    return json({ items: parseWikimediaItems(partial) });
  } });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]._debug_source, 'live');
  assert.equal(result.items[1]._debug_source, 'archive');
});
