import { NextResponse } from 'next/server';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000; // API limit

// Cache configuration
const CACHE_SIZE = 30; // Keep 30 items in cache
const MIN_CACHE_SIZE = 5; // Start refilling when below this
const REFILL_DELAY = 2000; // 2s between API calls when refilling

interface CachedSvg {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

// In-memory cache
const svgCache: CachedSvg[] = [];
let isRefilling = false;
let lastApiCall = 0;

// Fetch single SVG from Wikimedia (internal use)
async function fetchSingleSvg(): Promise<CachedSvg | null> {
  // Rate limit: wait at least REFILL_DELAY between calls
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < REFILL_DELAY) {
    await new Promise(resolve => setTimeout(resolve, REFILL_DELAY - timeSinceLastCall));
  }
  lastApiCall = Date.now();

  try {
    // Step 1: Generate random offset
    const randomOffset = Math.floor(Math.random() * MAX_OFFSET);

    // Step 2: Get random file
    const searchUrl = new URL(WIKIMEDIA_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    searchUrl.searchParams.set('srnamespace', '6');
    searchUrl.searchParams.set('srlimit', '1');
    searchUrl.searchParams.set('sroffset', randomOffset.toString());
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await fetch(searchUrl.toString());

    if (searchResponse.status === 429) {
      console.log('Wikimedia 429 - backing off');
      return null;
    }

    if (!searchResponse.ok) {
      console.error('Wikimedia search API error:', searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    const file = searchData.query?.search?.[0];

    if (!file) {
      return null;
    }

    const title = file.title;

    // Step 3: Get image info with preview URL
    const imageInfoUrl = new URL(WIKIMEDIA_API);
    imageInfoUrl.searchParams.set('action', 'query');
    imageInfoUrl.searchParams.set('titles', title);
    imageInfoUrl.searchParams.set('prop', 'imageinfo');
    imageInfoUrl.searchParams.set('iiprop', 'url|size|mime');
    imageInfoUrl.searchParams.set('iiurlwidth', '300');
    imageInfoUrl.searchParams.set('format', 'json');
    imageInfoUrl.searchParams.set('origin', '*');

    // Wait before second request
    await new Promise(resolve => setTimeout(resolve, REFILL_DELAY));
    lastApiCall = Date.now();

    const imageInfoResponse = await fetch(imageInfoUrl.toString());

    if (imageInfoResponse.status === 429) {
      console.log('Wikimedia 429 on imageinfo - backing off');
      return null;
    }

    if (!imageInfoResponse.ok) {
      console.error('Wikimedia imageinfo API error:', imageInfoResponse.status);
      return null;
    }

    const imageInfoData = await imageInfoResponse.json();
    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];

    if (!imageInfo) {
      return null;
    }

    const cleanTitle = title.replace('File:', '');
    const downloadUrl = imageInfo.url ? `${imageInfo.url}?download` : imageInfo.url;

    return {
      title: cleanTitle,
      previewImage: imageInfo.thumburl || imageInfo.url,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: downloadUrl,
    };
  } catch (error) {
    console.error('Error fetching SVG:', error);
    return null;
  }
}

// Background refill of cache
async function refillCache() {
  if (isRefilling) return;
  isRefilling = true;

  console.log(`Cache refill started. Current size: ${svgCache.length}`);

  while (svgCache.length < CACHE_SIZE) {
    const svg = await fetchSingleSvg();
    if (svg) {
      svgCache.push(svg);
      console.log(`Cache refilled: ${svgCache.length}/${CACHE_SIZE}`);
    }
    // Extra delay between fetches to avoid 429
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  isRefilling = false;
  console.log('Cache refill complete');
}

export async function GET() {
  try {
    // If cache has items, return from cache immediately
    if (svgCache.length > 0) {
      // Get random item from cache
      const randomIndex = Math.floor(Math.random() * svgCache.length);
      const svg = svgCache.splice(randomIndex, 1)[0];

      console.log(`Served from cache. Remaining: ${svgCache.length}`);

      // Trigger background refill if running low
      if (svgCache.length < MIN_CACHE_SIZE) {
        refillCache(); // Don't await - run in background
      }

      return NextResponse.json(svg);
    }

    // Cache empty - fetch directly with retries
    console.log('Cache empty - fetching directly');

    let svg: CachedSvg | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      svg = await fetchSingleSvg();
      if (svg) break;
      // Wait longer on each retry: 3s, 5s, 7s
      const delay = 3000 + attempt * 2000;
      console.log(`Direct fetch failed, retry ${attempt + 1}/3 in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!svg) {
      return NextResponse.json({
        error: 'Failed to fetch from Wikimedia API',
        details: 'Rate limited or API error'
      }, { status: 502 });
    }

    // Start background refill
    refillCache();

    return NextResponse.json(svg);

  } catch (error) {
    console.error('Error fetching random SVG from Wikimedia:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
