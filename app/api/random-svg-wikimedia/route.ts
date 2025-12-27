/**
 * WIKIMEDIA SVG API ROUTE
 * =======================
 *
 * This route fetches random SVGs from Wikimedia Commons with smart fallback:
 *
 * 1. LIVE MODE (default): Fetches random SVG from Wikimedia API
 *    - Returns fresh, random SVGs from Wikimedia Commons
 *    - Badge: green "LIVE"
 *
 * 2. ARCHIVE MODE (fallback): When rate-limited (429 error)
 *    - Returns SVG from local archive (/public/wikimedia-archive/)
 *    - Activates 30-second cooldown before trying LIVE again
 *    - Badge: gray "ARCHIVE"
 *
 * RATE LIMIT HANDLING:
 * - Wikimedia CDN blocks frequent requests (429 Too Many Requests)
 * - When 429 is detected, we switch to ARCHIVE mode
 * - After 30 seconds cooldown, we try LIVE mode again
 *
 * ARCHIVE STRUCTURE:
 * /public/wikimedia-archive/
 *   ├── index.json          - List of archived SVGs with metadata
 *   ├── example.svg         - Actual SVG file
 *   └── ...
 *
 * index.json format:
 * [
 *   {
 *     "filename": "example.svg",
 *     "title": "Example Title",
 *     "wikimediaUrl": "https://commons.wikimedia.org/wiki/File:Example.svg"
 *   }
 * ]
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isWikimediaRateLimited } from '../proxy-image/route';

// =============================================================================
// CONFIGURATION
// =============================================================================

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000;
const LIVE_TIMEOUT = 3000; // 3 seconds max for live request
const RATE_LIMIT_COOLDOWN = 40 * 1000; // 40 seconds cooldown after 429

// =============================================================================
// RATE LIMIT STATE
// =============================================================================

// Local rate limit tracking (from API responses)
// Exported so status endpoint can check it
export let apiRateLimitedUntil: number = 0;

function isRateLimited(): boolean {
  // Check both: local API rate limit AND proxy CDN rate limit
  return Date.now() < apiRateLimitedUntil || isWikimediaRateLimited();
}

function setRateLimited(): void {
  apiRateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
  console.log(`[wikimedia] API rate limited! Cooldown until ${new Date(apiRateLimitedUntil).toISOString()}`);
}

// =============================================================================
// TYPES
// =============================================================================

interface SvgItem {
  title: string;
  previewImage: string;      // URL for preview (local path for archive, wikimedia URL for live)
  originalSvgUrl?: string;   // Original wikimedia URL (for fallback)
  source: string;            // Always 'wikimedia.org'
  sourceUrl: string;         // Link to wikimedia page
  downloadUrl: string;       // Direct download link
}

interface ArchiveItem {
  filename: string;
  title: string;
  wikimediaUrl: string;
}

// =============================================================================
// ARCHIVE FUNCTIONS
// =============================================================================

let archiveIndex: ArchiveItem[] | null = null;

function loadArchive(): ArchiveItem[] {
  if (archiveIndex !== null) return archiveIndex;

  try {
    const indexPath = path.join(process.cwd(), 'public', 'wikimedia-archive', 'index.json');
    const data = fs.readFileSync(indexPath, 'utf-8');
    archiveIndex = JSON.parse(data);
    console.log(`[wikimedia] Loaded ${archiveIndex!.length} SVGs from archive`);
    return archiveIndex!;
  } catch (error) {
    console.error('[wikimedia] Failed to load archive:', error);
    archiveIndex = [];
    return [];
  }
}

function getFromArchive(): SvgItem | null {
  const archive = loadArchive();
  if (archive.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * archive.length);
  const item = archive[randomIndex];

  return {
    title: item.title,
    previewImage: `/wikimedia-archive/${item.filename}`, // Served from public folder
    source: 'wikimedia.org',
    sourceUrl: item.wikimediaUrl,
    downloadUrl: item.wikimediaUrl, // Download from original wikimedia
  };
}

// =============================================================================
// LIVE FETCH FUNCTIONS
// =============================================================================

async function fetchLive(): Promise<SvgItem | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_TIMEOUT);

  try {
    const randomOffset = Math.floor(Math.random() * MAX_OFFSET);

    // Step 1: Search for random SVG file
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
      if (searchResponse.status === 429) {
        setRateLimited();
      }
      return null;
    }

    const searchData = await searchResponse.json();
    const file = searchData.query?.search?.[0];
    if (!file) return null;

    const title = file.title;

    // Step 2: Get image info (URL, thumbnail, etc.)
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
      if (imageInfoResponse.status === 429) {
        setRateLimited();
      }
      return null;
    }

    const imageInfoData = await imageInfoResponse.json();
    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];

    if (!imageInfo) return null;

    const cleanTitle = title.replace('File:', '');
    const svgUrl = imageInfo.url;

    return {
      title: cleanTitle,
      previewImage: imageInfo.thumburl || svgUrl,
      originalSvgUrl: svgUrl,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: `${svgUrl}?download`,
    };
  } catch {
    // Timeout or network error
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function GET() {
  // Check if we're in cooldown from previous rate limit
  if (isRateLimited()) {
    console.log('[wikimedia] In cooldown, using archive');
    const fromArchive = getFromArchive();
    if (fromArchive) {
      return NextResponse.json({ ...fromArchive, _debug_source: 'archive' });
    }
  }

  // Try live fetch first
  const live = await fetchLive();

  if (live) {
    return NextResponse.json({ ...live, _debug_source: 'live' });
  }

  // Live failed - use archive as fallback
  console.log('[wikimedia] Live fetch failed, using archive');
  const fromArchive = getFromArchive();

  if (fromArchive) {
    return NextResponse.json({ ...fromArchive, _debug_source: 'archive' });
  }

  // Nothing available
  return NextResponse.json({
    error: 'No SVG available',
    details: 'Live fetch failed and archive is empty'
  }, { status: 503 });
}
