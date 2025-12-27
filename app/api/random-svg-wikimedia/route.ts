import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { wikimediaRateLimitedUntil } from '../proxy-image/route';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000;
const LIVE_TIMEOUT = 2000;

interface SvgItem {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

// Static pool as fallback
let svgPool: SvgItem[] = [];

function loadPool() {
  if (svgPool.length > 0) return;

  try {
    const poolPath = path.join(process.cwd(), 'data', 'wikimedia-svg-pool.json');
    const data = fs.readFileSync(poolPath, 'utf-8');
    svgPool = JSON.parse(data);
    console.log(`Loaded ${svgPool.length} SVGs from Wikimedia pool`);
  } catch (error) {
    console.error('Failed to load Wikimedia SVG pool:', error);
    svgPool = [];
  }
}

function getFromPool(): SvgItem | null {
  loadPool();
  if (svgPool.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * svgPool.length);
  return svgPool[randomIndex];
}

// Try live fetch with timeout
async function fetchLive(): Promise<SvgItem | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_TIMEOUT);

  try {
    const randomOffset = Math.floor(Math.random() * MAX_OFFSET);

    const searchUrl = new URL(WIKIMEDIA_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    searchUrl.searchParams.set('srnamespace', '6');
    searchUrl.searchParams.set('srlimit', '1');
    searchUrl.searchParams.set('sroffset', randomOffset.toString());
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await fetch(searchUrl.toString(), { signal: controller.signal });

    if (!searchResponse.ok) {
      return null;
    }

    const searchData = await searchResponse.json();
    const file = searchData.query?.search?.[0];
    if (!file) return null;

    const title = file.title;

    const imageInfoUrl = new URL(WIKIMEDIA_API);
    imageInfoUrl.searchParams.set('action', 'query');
    imageInfoUrl.searchParams.set('titles', title);
    imageInfoUrl.searchParams.set('prop', 'imageinfo');
    imageInfoUrl.searchParams.set('iiprop', 'url|size|mime');
    imageInfoUrl.searchParams.set('iiurlwidth', '300');
    imageInfoUrl.searchParams.set('format', 'json');
    imageInfoUrl.searchParams.set('origin', '*');

    const imageInfoResponse = await fetch(imageInfoUrl.toString(), { signal: controller.signal });

    if (!imageInfoResponse.ok) {
      return null;
    }

    const imageInfoData = await imageInfoResponse.json();
    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];

    if (!imageInfo) return null;

    const cleanTitle = title.replace('File:', '');

    return {
      title: cleanTitle,
      previewImage: imageInfo.thumburl || imageInfo.url,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: `${imageInfo.url}?download`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  // Skip live if rate limited
  if (Date.now() < wikimediaRateLimitedUntil) {
    const fromPool = getFromPool();
    if (fromPool) {
      // DEBUG_LABEL: источник данных
      return NextResponse.json({ ...fromPool, _debugSource: 'pool' });
    }
  }

  // Try live first
  const live = await fetchLive();

  if (live) {
    // DEBUG_LABEL: источник данных
    return NextResponse.json({ ...live, _debugSource: 'live' });
  }

  // Fallback to pool
  const fromPool = getFromPool();

  if (fromPool) {
    // DEBUG_LABEL: источник данных
    return NextResponse.json({ ...fromPool, _debugSource: 'pool' });
  }

  return NextResponse.json({
    error: 'No SVG available',
    details: 'Live fetch failed and pool is empty'
  }, { status: 503 });
}
