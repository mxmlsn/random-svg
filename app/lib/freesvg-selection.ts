export interface FreeSvgItem {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

export const FREESVG_HISTORY_KEY = 'random-svg:freesvg:seen:v1';

// A distinct catalog band for every slot avoids drawing a whole upload series.
export function sampleFreeSvgPages(totalPages: number, count: number, random = Math.random) {
  const slots = Math.min(totalPages, count);
  const plans = Array.from({ length: slots }, (_, index) => {
    const first = Math.floor(index * totalPages / slots) + 1;
    const last = Math.floor((index + 1) * totalPages / slots);
    return { first, last, page: first + Math.floor(random() * (last - first + 1)) };
  });
  // Shuffle the bands so old/new portions of the library rotate between slots.
  for (let i = plans.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plans[i], plans[j]] = [plans[j], plans[i]];
  }
  return plans;
}

export function freeSvgAssetKey(url: string) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    return `asset:${path.replace(/^\/(?:storage\/img\/thumb|storage\/img|thumbs|img)\//, '')}`;
  } catch {
    return `asset:${url.split('?')[0]}`;
  }
}

export function freeSvgKeys(item: FreeSvgItem): string[] {
  const id = item.downloadUrl.match(/[?&]id=(\d+)(?:&|$)/)?.[1];
  return [id ? `id:${id}` : `url:${item.sourceUrl}`, freeSvgAssetKey(item.previewImage)];
}

export function readFreeSvgHistory(storage: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const data: unknown = JSON.parse(storage.getItem(FREESVG_HISTORY_KEY) || '[]');
    if (Array.isArray(data)) return new Set(data.filter((key): key is string =>
      typeof key === 'string' && /^(id|asset|url):/.test(key)));
  } catch {
    // Private browsing or invalid storage must not break live discovery.
  }
  return new Set();
}

export function saveFreeSvgHistory(storage: Pick<Storage, 'setItem'>, seen: Set<string>) {
  try {
    storage.setItem(FREESVG_HISTORY_KEY, JSON.stringify([...seen]));
  } catch {
    // Keep the full in-memory history if browser storage is unavailable or full.
  }
}

export async function loadFreeSvgBatch(count: number, seen: Set<string>, fetcher: typeof fetch = fetch) {
  const reserved = new Set(seen);
  const items: FreeSvgItem[] = [];
  for (let attempt = 0; attempt < 3 && items.length < count; attempt++) {
    const response = await fetcher('/api/random-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      // Bound request size; the full browser history is still checked below.
      body: JSON.stringify({ count: count - items.length, exclude: [...reserved].slice(-10000) }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) continue;
    const data: { items: FreeSvgItem[] } = await response.json();
    for (const item of data.items) {
      const keys = freeSvgKeys(item);
      if (keys.some(key => reserved.has(key))) continue;
      keys.forEach(key => reserved.add(key));
      items.push(item);
      if (items.length === count) break;
    }
  }
  // Never refill a shortage with an already-seen image or the latest home grid.
  if (items.length < count) throw new Error('Could not find enough unseen FreeSVG images. Please try again.');
  for (const item of items) freeSvgKeys(item).forEach(key => seen.add(key));
  return items;
}
