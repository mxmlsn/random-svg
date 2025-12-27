import { NextRequest, NextResponse } from 'next/server';

/**
 * PROXY IMAGE ROUTE
 * =================
 *
 * Proxies images from external sources (Wikimedia, FreeSVG, etc.)
 *
 * RATE LIMIT HANDLING:
 * When Wikimedia returns 429, this proxy:
 * 1. Sets wikimediaRateLimitedUntil timestamp
 * 2. Returns 429 to client
 * 3. Client should switch to ARCHIVE mode
 */

// In-memory cache to avoid hammering external servers
const imageCache = new Map<string, { buffer: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// Shared rate limit state for Wikimedia CDN
// Exported so wikimedia route can check it
export let wikimediaRateLimitedUntil: number = 0;
const RATE_LIMIT_COOLDOWN = 20 * 1000; // 20 seconds

export function isWikimediaRateLimited(): boolean {
  return Date.now() < wikimediaRateLimitedUntil;
}

function setWikimediaRateLimited(): void {
  wikimediaRateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
  console.log(`[proxy] Wikimedia rate limited! Cooldown until ${new Date(wikimediaRateLimitedUntil).toISOString()}`);
}

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of imageCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
  // If still too large, remove oldest entries
  if (imageCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(imageCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => imageCache.delete(key));
  }
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

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': urlObj.origin,
      },
    });

    if (!response.ok) {
      // Track rate limits for Wikimedia
      if (response.status === 429 && urlObj.hostname.includes('wikimedia.org')) {
        setWikimediaRateLimited();
      }
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();

    // Store in cache
    imageCache.set(url, { buffer, contentType, timestamp: Date.now() });

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
