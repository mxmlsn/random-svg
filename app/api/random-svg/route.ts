import { NextRequest, NextResponse } from 'next/server';
import { FREESVG_URL, parseFreeSvgDetail, parseFreeSvgListing } from '../../lib/freesvg';
import { freeSvgAssetKey, freeSvgKeys, sampleFreeSvgPages, type FreeSvgItem } from '../../lib/freesvg-selection';

const FREESVG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': `${FREESVG_URL}/`,
};

async function getBatch(count: number, exclude: string[], batch: boolean) {
  const controller = new AbortController();
  const budget = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
  try {
    const homeResponse = await fetch(`${FREESVG_URL}/`, {
      headers: FREESVG_HEADERS,
      next: { revalidate: 3600 },
      signal: AbortSignal.any([budget, AbortSignal.timeout(8000)]),
    });
    if (!homeResponse.ok) throw new Error(`FreeSVG catalog HTTP ${homeResponse.status}`);
    const home = parseFreeSvgListing(await homeResponse.text());
    // No fixed page cap: sample every part of the current library equally.
    const plans = sampleFreeSvgPages(home.maxPage, count);
    if (plans.length < count) throw new Error('FreeSVG catalog pagination unavailable');
    const seen = new Set(exclude);
    const results: { item: FreeSvgItem; page: number }[] = Array(count);
    let next = 0;

    async function fillSlot(index: number) {
      const plan = plans[index];
      for (let attempt = 0; attempt < 3; attempt++) {
        const pageNumber = attempt === 0 ? plan.page
          : plan.first + Math.floor(Math.random() * (plan.last - plan.first + 1));
        let listing = home;
        if (pageNumber !== 1) {
          const response = await fetch(`${FREESVG_URL}/?page=${pageNumber}`, {
            headers: FREESVG_HEADERS, cache: 'no-store', signal: AbortSignal.any([budget, AbortSignal.timeout(6000)]),
          });
          if (!response.ok) continue;
          listing = parseFreeSvgListing(await response.text());
        }
        // Never silently replace a failed deep catalog page with the home page.
        const candidates = [...listing.items];
        let detailAttempts = 0;
        while (candidates.length && detailAttempts < 3) {
          const [candidate] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
          const assetKey = freeSvgAssetKey(candidate.thumb);
          if (seen.has(assetKey)) continue;
          // Reserve synchronously before fetching details, including across workers.
          seen.add(assetKey);
          detailAttempts++;
          const response = await fetch(candidate.href, {
            headers: FREESVG_HEADERS, cache: 'no-store', signal: AbortSignal.any([budget, AbortSignal.timeout(6000)]),
          });
          if (!response.ok) continue;
          const detail = parseFreeSvgDetail(await response.text());
          if (!detail.downloadId) continue;
          const item: FreeSvgItem = {
            title: detail.title || candidate.title,
            previewImage: detail.previewImage || candidate.thumb,
            source: 'freesvg.org', sourceUrl: candidate.href,
            downloadUrl: `/api/download-freesvg?id=${detail.downloadId}`,
          };
          const keys = freeSvgKeys(item);
          if (seen.has(keys[0]) || (keys[1] !== assetKey && seen.has(keys[1]))) continue;
          keys.forEach(key => seen.add(key));
          results[index] = { item, page: pageNumber };
          return;
        }
      }
      throw new Error('No unseen SVG found in this part of the FreeSVG catalog');
    }

    // Keep upstream concurrency bounded even when six FreeSVG slots are selected.
    await Promise.all(Array.from({ length: Math.min(3, count) }, async () => {
      while (next < count) await fillSlot(next++);
    }));

    return NextResponse.json(batch ? {
      items: results.map(result => result.item),
      sampling: { pages: results.map(result => result.page), totalPages: home.maxPage },
    } : results[0].item, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    controller.abort();
    console.error('Error fetching FreeSVG:', error);
    return NextResponse.json({ error: 'Failed to fetch unseen FreeSVG images' }, { status: 502 });
  }
}

export async function GET() {
  return getBatch(1, [], false);
}

export async function POST(request: NextRequest) {
  let body: { count?: unknown; exclude?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const count = body.count ?? 1;
  const exclude = body.exclude ?? [];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 6
    || !Array.isArray(exclude) || exclude.length > 10000
    || exclude.some(key => typeof key !== 'string' || key.length > 2048)) {
    return NextResponse.json({ error: 'Invalid count or exclusion history' }, { status: 400 });
  }
  return getBatch(count, exclude, true);
}
