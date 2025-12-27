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

interface LocalCacheItem {
  id: string;
  title: string;
  sourceUrl: string;
  localFile: string;
}

interface LocalCacheIndex {
  items: LocalCacheItem[];
}

// Static pool as fallback (remote URLs)
let svgPool: SvgItem[] = [];

// Local cache (files in public/wikimedia-cache)
let localCache: LocalCacheItem[] = [];

// Convert PNG thumbnail URL to original SVG URL
function convertThumbToSvg(url: string): string {
  // Pattern: .../thumb/c/c5/Filename.svg/330px-Filename.svg.png -> .../c/c5/Filename.svg
  const thumbMatch = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([a-f0-9]\/[a-f0-9]{2})\/([^/]+\.svg)\/\d+px-[^/]+\.png$/i);
  if (thumbMatch) {
    return `${thumbMatch[1]}/${thumbMatch[2]}/${thumbMatch[3]}`;
  }
  return url;
}

function loadPool() {
  if (svgPool.length > 0) return;

  try {
    const poolPath = path.join(process.cwd(), 'data', 'wikimedia-svg-pool.json');
    const data = fs.readFileSync(poolPath, 'utf-8');
    const rawPool = JSON.parse(data);
    // Convert PNG thumbnails to SVG URLs - they don't get rate limited
    svgPool = rawPool.map((item: SvgItem) => ({
      ...item,
      previewImage: convertThumbToSvg(item.previewImage)
    }));
    console.log(`Loaded ${svgPool.length} SVGs from Wikimedia pool (converted to SVG URLs)`);
  } catch (error) {
    console.error('Failed to load Wikimedia SVG pool:', error);
    svgPool = [];
  }
}

function loadLocalCache() {
  if (localCache.length > 0) return;

  try {
    const indexPath = path.join(process.cwd(), 'public', 'wikimedia-cache', 'index.json');
    const data = fs.readFileSync(indexPath, 'utf-8');
    const index: LocalCacheIndex = JSON.parse(data);
    localCache = index.items;
    console.log(`Loaded ${localCache.length} SVGs from local cache`);
  } catch (error) {
    console.error('Failed to load local cache:', error);
    localCache = [];
  }
}

// Get from LOCAL cache - no network requests needed
function getFromLocalCache(): SvgItem | null {
  loadLocalCache();
  if (localCache.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * localCache.length);
  const item = localCache[randomIndex];

  return {
    title: item.title,
    // Local file served from public folder - no proxy needed!
    previewImage: `/wikimedia-cache/${item.localFile}`,
    source: 'wikimedia.org',
    sourceUrl: item.sourceUrl,
    downloadUrl: `/wikimedia-cache/${item.localFile}`,
  };
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
      // Always use original SVG URL - PNG thumbnails get rate limited
      previewImage: imageInfo.url,
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
  // Skip live if rate limited - use LOCAL cache (no network!)
  if (Date.now() < wikimediaRateLimitedUntil) {
    const fromLocal = getFromLocalCache();
    if (fromLocal) {
      // DEBUG_LABEL: источник данных
      return NextResponse.json({ ...fromLocal, _debugSource: 'local' });
    }
  }

  // Try live first
  const live = await fetchLive();

  if (live) {
    // DEBUG_LABEL: источник данных
    return NextResponse.json({ ...live, _debugSource: 'live' });
  }

  // Fallback to LOCAL cache first (no network)
  const fromLocal = getFromLocalCache();
  if (fromLocal) {
    // DEBUG_LABEL: источник данных
    return NextResponse.json({ ...fromLocal, _debugSource: 'local' });
  }

  // Last resort - remote pool (will still hit rate limits)
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
