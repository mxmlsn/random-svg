import { NextResponse } from 'next/server';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000; // API limit

// Rate limiting with retry logic for 429 errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second base delay for retries

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url);

    if (response.status === 429) {
      // Exponential backoff: 1s, 2s, 4s
      const retryDelay = BASE_DELAY * Math.pow(2, attempt);
      console.log(`Wikimedia 429 - retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      lastRequestTime = Date.now();
      continue;
    }

    return response;
  }

  // All retries exhausted, return a 429 response
  return new Response(JSON.stringify({ error: 'Rate limited after retries' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function GET() {
  try {
    // Step 1: Get total number of SVG files
    const totalHitsUrl = new URL(WIKIMEDIA_API);
    totalHitsUrl.searchParams.set('action', 'query');
    totalHitsUrl.searchParams.set('list', 'search');
    totalHitsUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    totalHitsUrl.searchParams.set('srnamespace', '6');
    totalHitsUrl.searchParams.set('srlimit', '1');
    totalHitsUrl.searchParams.set('format', 'json');
    totalHitsUrl.searchParams.set('origin', '*');

    const totalResponse = await throttledFetch(totalHitsUrl.toString());

    if (!totalResponse.ok) {
      console.error('Wikimedia API error:', totalResponse.status, totalResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch from Wikimedia API',
        details: `HTTP ${totalResponse.status}: ${totalResponse.statusText}`
      }, { status: 502 });
    }

    const contentType = totalResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Wikimedia returned non-JSON response:', contentType);
      return NextResponse.json({
        error: 'Invalid response from Wikimedia API',
        details: 'Expected JSON, got ' + contentType
      }, { status: 502 });
    }

    const totalData = await totalResponse.json();

    const totalHits = totalData.query?.searchinfo?.totalhits || 0;

    if (totalHits === 0) {
      return NextResponse.json({ error: 'No SVG files found' }, { status: 404 });
    }

    // Step 2: Generate random offset (limited to MAX_OFFSET)
    const maxOffset = Math.min(totalHits - 1, MAX_OFFSET);
    const randomOffset = Math.floor(Math.random() * maxOffset);

    // Step 3: Get random file
    const searchUrl = new URL(WIKIMEDIA_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    searchUrl.searchParams.set('srnamespace', '6');
    searchUrl.searchParams.set('srlimit', '1');
    searchUrl.searchParams.set('sroffset', randomOffset.toString());
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await throttledFetch(searchUrl.toString());

    if (!searchResponse.ok) {
      console.error('Wikimedia search API error:', searchResponse.status, searchResponse.statusText);
      return NextResponse.json({
        error: 'Failed to search Wikimedia API',
        details: `HTTP ${searchResponse.status}: ${searchResponse.statusText}`
      }, { status: 502 });
    }

    const searchContentType = searchResponse.headers.get('content-type');
    if (!searchContentType || !searchContentType.includes('application/json')) {
      console.error('Wikimedia search returned non-JSON response:', searchContentType);
      return NextResponse.json({
        error: 'Invalid search response from Wikimedia API',
        details: 'Expected JSON, got ' + searchContentType
      }, { status: 502 });
    }

    const searchData = await searchResponse.json();

    const file = searchData.query?.search?.[0];

    if (!file) {
      return NextResponse.json({ error: 'No file found at offset' }, { status: 404 });
    }

    // Step 4: Get file title
    const title = file.title;

    // Step 5: Get image info with preview URL
    const imageInfoUrl = new URL(WIKIMEDIA_API);
    imageInfoUrl.searchParams.set('action', 'query');
    imageInfoUrl.searchParams.set('titles', title);
    imageInfoUrl.searchParams.set('prop', 'imageinfo');
    imageInfoUrl.searchParams.set('iiprop', 'url|size|mime');
    imageInfoUrl.searchParams.set('iiurlwidth', '300');
    imageInfoUrl.searchParams.set('format', 'json');
    imageInfoUrl.searchParams.set('origin', '*');

    const imageInfoResponse = await throttledFetch(imageInfoUrl.toString());

    if (!imageInfoResponse.ok) {
      console.error('Wikimedia imageinfo API error:', imageInfoResponse.status, imageInfoResponse.statusText);
      return NextResponse.json({
        error: 'Failed to get image info from Wikimedia API',
        details: `HTTP ${imageInfoResponse.status}: ${imageInfoResponse.statusText}`
      }, { status: 502 });
    }

    const imageInfoContentType = imageInfoResponse.headers.get('content-type');
    if (!imageInfoContentType || !imageInfoContentType.includes('application/json')) {
      console.error('Wikimedia imageinfo returned non-JSON response:', imageInfoContentType);
      return NextResponse.json({
        error: 'Invalid imageinfo response from Wikimedia API',
        details: 'Expected JSON, got ' + imageInfoContentType
      }, { status: 502 });
    }

    const imageInfoData = await imageInfoResponse.json();

    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];

    if (!imageInfo) {
      return NextResponse.json({ error: 'Could not get image info' }, { status: 404 });
    }

    // Extract title without "File:" prefix
    const cleanTitle = title.replace('File:', '');

    // Add ?download parameter to enable direct download
    const downloadUrl = imageInfo.url ? `${imageInfo.url}?download` : imageInfo.url;

    return NextResponse.json({
      title: cleanTitle,
      previewImage: imageInfo.thumburl || imageInfo.url,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: downloadUrl,
    });

  } catch (error) {
    console.error('Error fetching random SVG from Wikimedia:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
