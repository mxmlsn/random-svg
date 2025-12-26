// Script to fetch a pool of SVG files from Wikimedia Commons
// Run with: npx tsx scripts/fetch-wikimedia-pool.ts

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const POOL_SIZE = 500;
const DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds to avoid rate limiting
const OUTPUT_FILE = './data/wikimedia-svg-pool.json';

interface SvgItem {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBatch(offset: number): Promise<SvgItem[]> {
  const results: SvgItem[] = [];

  // Get 50 files at once
  const searchUrl = new URL(WIKIMEDIA_API);
  searchUrl.searchParams.set('action', 'query');
  searchUrl.searchParams.set('list', 'search');
  searchUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
  searchUrl.searchParams.set('srnamespace', '6');
  searchUrl.searchParams.set('srlimit', '50');
  searchUrl.searchParams.set('sroffset', offset.toString());
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('origin', '*');

  console.log(`Fetching batch at offset ${offset}...`);

  const searchResponse = await fetch(searchUrl.toString());

  if (searchResponse.status === 429) {
    console.log('Rate limited, waiting 30 seconds...');
    await sleep(30000);
    return fetchBatch(offset); // Retry
  }

  if (!searchResponse.ok) {
    console.error(`Error: ${searchResponse.status}`);
    return [];
  }

  const searchData = await searchResponse.json();
  const files = searchData.query?.search || [];

  if (files.length === 0) {
    return [];
  }

  // Get image info for all files in batch
  const titles = files.map((f: { title: string }) => f.title).join('|');

  await sleep(DELAY_BETWEEN_REQUESTS);

  const imageInfoUrl = new URL(WIKIMEDIA_API);
  imageInfoUrl.searchParams.set('action', 'query');
  imageInfoUrl.searchParams.set('titles', titles);
  imageInfoUrl.searchParams.set('prop', 'imageinfo');
  imageInfoUrl.searchParams.set('iiprop', 'url|size|mime');
  imageInfoUrl.searchParams.set('iiurlwidth', '300');
  imageInfoUrl.searchParams.set('format', 'json');
  imageInfoUrl.searchParams.set('origin', '*');

  const imageInfoResponse = await fetch(imageInfoUrl.toString());

  if (imageInfoResponse.status === 429) {
    console.log('Rate limited on imageinfo, waiting 30 seconds...');
    await sleep(30000);
    return fetchBatch(offset); // Retry
  }

  if (!imageInfoResponse.ok) {
    console.error(`Error on imageinfo: ${imageInfoResponse.status}`);
    return [];
  }

  const imageInfoData = await imageInfoResponse.json();
  const pages = imageInfoData.query?.pages || {};

  for (const pageId of Object.keys(pages)) {
    const page = pages[pageId];
    const imageInfo = page?.imageinfo?.[0];

    if (!imageInfo || !imageInfo.url) continue;

    const cleanTitle = page.title.replace('File:', '');

    results.push({
      title: cleanTitle,
      previewImage: imageInfo.thumburl || imageInfo.url,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: `${imageInfo.url}?download`,
    });
  }

  return results;
}

async function main() {
  const pool: SvgItem[] = [];
  const offsets = Array.from({ length: Math.ceil(POOL_SIZE / 50) }, (_, i) => i * 100 + Math.floor(Math.random() * 50));

  for (const offset of offsets) {
    if (pool.length >= POOL_SIZE) break;

    const batch = await fetchBatch(offset);
    pool.push(...batch);
    console.log(`Pool size: ${pool.length}/${POOL_SIZE}`);

    await sleep(DELAY_BETWEEN_REQUESTS);
  }

  // Write to file
  const fs = await import('fs');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pool.slice(0, POOL_SIZE), null, 2));
  console.log(`\nSaved ${Math.min(pool.length, POOL_SIZE)} items to ${OUTPUT_FILE}`);
}

main().catch(console.error);
