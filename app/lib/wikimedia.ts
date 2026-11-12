export const WIKIMEDIA_USER_AGENT = 'RandomSVG/1.1 (https://random-svg.com; https://github.com/mxmlsn/random-svg)';
const API_URL = 'https://commons.wikimedia.org/w/api.php';

export interface WikimediaItem {
  title: string;
  previewImage: string;
  originalSvgUrl?: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
  _debug_source: 'live' | 'archive';
}

interface ImageInfo {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  size?: number;
}

interface ApiData {
  error?: { code: string; info?: string };
  query?: { pages?: { title: string; imageinfo?: ImageInfo[] }[] };
}

export class WikimediaError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 0) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number {
  if (!value) return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - now) / 1000)) : 60;
}

function trustedUrl(value: string | undefined, host: string): URL | undefined {
  try {
    const url = new URL(value || '');
    if (url.protocol === 'https:' && url.hostname === host) return url;
  } catch {
    // Ignore deleted files and incomplete imageinfo records.
  }
}

export function parseWikimediaItems(data: ApiData): WikimediaItem[] {
  const seen = new Set<string>();
  return (data.query?.pages || []).flatMap(page => {
    const info = page.imageinfo?.[0];
    const svg = trustedUrl(info?.url, 'upload.wikimedia.org');
    const description = trustedUrl(info?.descriptionurl, 'commons.wikimedia.org');
    // Render the original SVG: no thumbnail conversion requests, and no huge files.
    if (!svg || !description || info?.mime !== 'image/svg+xml'
      || !info.size || info.size > 2_000_000 || seen.has(svg.href)) return [];
    seen.add(svg.href);
    const download = new URL(svg);
    download.searchParams.set('download', '');
    return [{
      title: page.title.replace(/^File:/, ''),
      previewImage: svg.href,
      originalSvgUrl: svg.href,
      source: 'wikimedia.org',
      sourceUrl: description.href,
      downloadUrl: download.href,
      _debug_source: 'live' as const,
    }];
  });
}

export async function fetchWikimediaLive(count: number, options: {
  browser?: boolean;
  fetcher?: typeof fetch;
} = {}): Promise<WikimediaItem[]> {
  const fetcher = options.fetcher || fetch;
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: 'filemime:image/svg+xml',
    gsrnamespace: '6',
    gsrsort: 'random',
    gsrlimit: String(Math.max(12, count * 2)),
    gsroffset: String(Math.floor(Math.random() * 1000)),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString();

  const response = await fetcher(url.toString(), {
    headers: options.browser
      ? { 'Api-User-Agent': WIKIMEDIA_USER_AGENT }
      : { 'User-Agent': WIKIMEDIA_USER_AGENT },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new WikimediaError(`Wikimedia HTTP ${response.status}`,
      response.status === 429 || response.status === 503
        ? retryAfterSeconds(response.headers.get('retry-after')) : 0);
  }
  const data: ApiData = await response.json();
  if (data.error) {
    throw new WikimediaError(`Wikimedia ${data.error.code}`,
      ['ratelimited', 'maxlag', 'readonly'].includes(data.error.code)
        ? retryAfterSeconds(response.headers.get('retry-after')) : 0);
  }
  const items = parseWikimediaItems(data);
  if (items.length === 0) throw new WikimediaError('Wikimedia returned no usable SVG files');
  return items.slice(0, count);
}

// Browser and server IPs have independent limits. A server failure must never
// prevent a browser from querying Commons directly on the next update.
export async function loadWikimediaBatch(count: number, options: {
  browserRetryAt?: number;
  fetcher?: typeof fetch;
  now?: number;
} = {}) {
  const fetcher = options.fetcher || fetch;
  const now = options.now ?? Date.now();
  let browserRetryAt = options.browserRetryAt || 0;
  let items: WikimediaItem[] = [];
  if (browserRetryAt <= now) {
    try {
      items = await fetchWikimediaLive(count, { browser: true, fetcher });
      browserRetryAt = 0;
    } catch (error) {
      if (error instanceof WikimediaError && error.retryAfterSeconds > 0) {
        browserRetryAt = Date.now() + error.retryAfterSeconds * 1000;
      }
    }
  }
  if (items.length < count) {
    let fallback: WikimediaItem[];
    try {
      const response = await fetcher(`/api/random-svg-wikimedia?count=${count - items.length}`, {
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Wikimedia fallback unavailable');
      const data: { items: WikimediaItem[] } = await response.json();
      fallback = data.items;
    } catch {
      fallback = await loadWikimediaArchive(count - items.length, fetcher);
    }
    const seen = new Set(items.map(item => item.sourceUrl));
    for (const item of fallback) {
      if (!seen.has(item.sourceUrl)) {
        items.push(item);
        seen.add(item.sourceUrl);
      }
    }
    // Overlap between a partial browser batch and the server must not leave holes.
    if (items.length < count) {
      const saved = await loadWikimediaArchive(count, fetcher);
      for (const item of saved) {
        if (!seen.has(item.sourceUrl)) {
          items.push(item);
          seen.add(item.sourceUrl);
        }
      }
    }
  }
  return { items: items.slice(0, count), browserRetryAt };
}

export async function loadWikimediaArchive(count: number, fetcher: typeof fetch = fetch,
  exclude = new Set<string>()): Promise<WikimediaItem[]> {
  const response = await fetcher('/wikimedia-archive/index.json', { cache: 'force-cache' });
  if (!response.ok) return [];
  const archive: { filename: string; title: string; wikimediaUrl: string }[] = await response.json();
  let available = archive.filter(item => !exclude.has(item.filename));
  if (!available.length) {
    exclude.clear();
    available = [...archive];
  }
  const items: WikimediaItem[] = [];
  while (available.length && items.length < count) {
    const [item] = available.splice(Math.floor(Math.random() * available.length), 1);
    exclude.add(item.filename);
    items.push({ title: item.title, previewImage: `/wikimedia-archive/${item.filename}`,
      source: 'wikimedia.org', sourceUrl: item.wikimediaUrl, downloadUrl: item.wikimediaUrl,
      _debug_source: 'archive' });
  }
  return items;
}
