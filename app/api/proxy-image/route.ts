import { NextRequest, NextResponse } from 'next/server';

const PROXY_TIMEOUT = 5000; // 5 seconds max for image fetch
const MAX_RETRIES = 2;
const CACHE_MAX_SIZE = 100; // Max cached images
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WIKIMEDIA_MIN_DELAY = 200; // Min ms between Wikimedia requests

// In-memory cache to avoid hitting Wikimedia rate limits
interface CacheEntry {
  buffer: ArrayBuffer;
  contentType: string;
  timestamp: number;
}
const imageCache = new Map<string, CacheEntry>();

// Rate limiting for Wikimedia
let lastWikimediaRequest = 0;
const wikimediaQueue: Array<() => void> = [];
let processingQueue = false;

async function waitForWikimediaSlot(): Promise<void> {
  return new Promise((resolve) => {
    wikimediaQueue.push(resolve);
    processWikimediaQueue();
  });
}

async function processWikimediaQueue() {
  if (processingQueue || wikimediaQueue.length === 0) return;
  processingQueue = true;

  while (wikimediaQueue.length > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastWikimediaRequest;

    if (timeSinceLastRequest < WIKIMEDIA_MIN_DELAY) {
      await new Promise(r => setTimeout(r, WIKIMEDIA_MIN_DELAY - timeSinceLastRequest));
    }

    lastWikimediaRequest = Date.now();
    const resolve = wikimediaQueue.shift();
    if (resolve) resolve();
  }

  processingQueue = false;
}

function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of imageCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
  // If still too big, remove oldest entries
  if (imageCache.size > CACHE_MAX_SIZE) {
    const entries = Array.from(imageCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, imageCache.size - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      imageCache.delete(key);
    }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Convert Wikimedia PNG thumbnail URL to original SVG URL
function getWikimediaSvgFallback(url: string): string | null {
  // Pattern: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Filename.svg/330px-Filename.svg.png
  // Original: https://upload.wikimedia.org/wikipedia/commons/c/c5/Filename.svg
  const thumbMatch = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([a-f0-9]\/[a-f0-9]{2})\/([^/]+\.svg)\/\d+px-[^/]+\.png$/i);
  if (thumbMatch) {
    return `${thumbMatch[1]}/${thumbMatch[2]}/${thumbMatch[3]}`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    // Only allow proxying from known domains
    const allowedDomains = ['publicdomainvectors.org', 'freesvg.org', 'upload.wikimedia.org', 'commons.wikimedia.org'];
    const urlObj = new URL(url);

    if (!allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    // Check cache first
    cleanCache();
    const cached = imageCache.get(url);
    if (cached) {
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      });
    }

    // Use standard browser User-Agent for all requests
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const fetchOptions: RequestInit = {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': urlObj.origin,
      },
    };

    // Rate limit Wikimedia requests
    const isWikimedia = urlObj.hostname.includes('wikimedia.org');
    if (isWikimedia) {
      await waitForWikimediaSlot();
    }

    let response: Response | null = null;
    let usedFallback = false;
    let lastError: Error | null = null;

    // Try fetching with retries
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await fetchWithTimeout(url, fetchOptions, PROXY_TIMEOUT);
        if (response.ok) break;
        lastError = new Error(`HTTP ${response.status}`);
        response = null;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error('Unknown error');
        response = null;
      }
      // Small delay before retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // If still failed, try SVG fallback for Wikimedia PNG thumbnails
    if (!response) {
      const svgFallback = getWikimediaSvgFallback(url);
      if (svgFallback) {
        console.log(`PNG thumbnail failed after ${MAX_RETRIES} retries, falling back to SVG: ${svgFallback}`);
        try {
          response = await fetchWithTimeout(svgFallback, fetchOptions, PROXY_TIMEOUT);
          if (response.ok) {
            usedFallback = true;
          } else {
            response = null;
          }
        } catch {
          response = null;
        }
      }
    }

    if (!response) {
      console.error('Proxy failed after all attempts:', lastError);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 504 });
    }

    const contentType = response.headers.get('content-type') || (usedFallback ? 'image/svg+xml' : 'image/png');
    const buffer = await response.arrayBuffer();

    // Save to cache
    imageCache.set(url, {
      buffer,
      contentType,
      timestamp: Date.now(),
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
