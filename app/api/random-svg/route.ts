import { NextResponse } from 'next/server';
import { FREESVG_URL, parseFreeSvgDetail, parseFreeSvgListing } from '../../lib/freesvg';

const FREESVG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': `${FREESVG_URL}/`,
};

export async function GET() {
  try {
    // Discover the current page range, cached across requests for an hour.
    const homeResponse = await fetch(`${FREESVG_URL}/`, {
      headers: FREESVG_HEADERS,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });

    if (!homeResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch from freesvg.org' }, { status: 502 });
    }

    const home = parseFreeSvgListing(await homeResponse.text());
    const randomPage = Math.floor(Math.random() * home.maxPage) + 1;
    let items = home.items;

    if (randomPage !== 1) {
      const pageResponse = await fetch(`${FREESVG_URL}/?page=${randomPage}`, {
        headers: FREESVG_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });

      if (pageResponse.ok) {
        const page = parseFreeSvgListing(await pageResponse.text());
        // An empty/out-of-range page must not discard a usable home listing.
        if (page.items.length > 0) items = page.items;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No SVG images found on freesvg.org' }, { status: 502 });
    }

    const item = items[Math.floor(Math.random() * items.length)];
    const detailResponse = await fetch(item.href, {
      headers: FREESVG_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!detailResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch detail page from freesvg.org' }, { status: 502 });
    }

    const detail = parseFreeSvgDetail(await detailResponse.text());

    return NextResponse.json({
      title: detail.title || item.title,
      previewImage: detail.previewImage || item.thumb,
      source: 'freesvg.org',
      sourceUrl: item.href,
      downloadUrl: detail.downloadId
        ? `/api/download-freesvg?id=${detail.downloadId}`
        : item.href,
    });
  } catch (error) {
    console.error('Error fetching random SVG:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 502 });
  }
}
