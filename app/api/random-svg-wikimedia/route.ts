import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fetchWikimediaLive, WikimediaError, type WikimediaItem } from '../../lib/wikimedia';
import { deferWikimediaApi, getWikimediaApiRetryAt } from '../../lib/wikimedia-server';

interface ArchiveItem {
  filename: string;
  title: string;
  wikimediaUrl: string;
}
let archive: ArchiveItem[] | undefined;

function getArchiveItems(count: number): WikimediaItem[] {
  archive ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/wikimedia-archive/index.json'), 'utf8'));
  const available = [...(archive || [])];
  const result: WikimediaItem[] = [];
  while (available.length && result.length < count) {
    const [item] = available.splice(Math.floor(Math.random() * available.length), 1);
    result.push({
      title: item.title,
      previewImage: `/wikimedia-archive/${item.filename}`,
      source: 'wikimedia.org',
      sourceUrl: item.wikimediaUrl,
      downloadUrl: item.wikimediaUrl,
      _debug_source: 'archive',
    });
  }
  return result;
}

export async function GET(request: NextRequest) {
  const batch = request.nextUrl.searchParams.has('count');
  const requestedCount = Number(request.nextUrl.searchParams.get('count') || 1);
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 6) {
    return NextResponse.json({ error: 'count must be between 1 and 6' }, { status: 400 });
  }
  let items: WikimediaItem[] = [];
  let reason: string | undefined;
  if (getWikimediaApiRetryAt() <= Date.now()) {
    try {
      items = await fetchWikimediaLive(requestedCount);
    } catch (error) {
      reason = error instanceof Error ? error.message : 'Wikimedia request failed';
      if (error instanceof WikimediaError && error.retryAfterSeconds > 0) {
        deferWikimediaApi(error.retryAfterSeconds);
      }
      console.warn('[wikimedia]', reason);
    }
  } else {
    reason = 'Server API cooldown';
  }
  if (items.length < requestedCount) {
    items.push(...getArchiveItems(requestedCount - items.length));
  }
  if (!items.length) {
    return NextResponse.json({ error: 'No SVG available' }, { status: 503 });
  }
  const metadata = {
    _fallback_reason: reason,
    _retry_after: Math.max(0, Math.ceil((getWikimediaApiRetryAt() - Date.now()) / 1000)),
  };
  return NextResponse.json(batch ? { items, ...metadata } : { ...items[0], ...metadata }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
