import fs from 'fs';
import path from 'path';

const POOL_PATH = path.join(process.cwd(), 'data', 'wikimedia-svg-pool.json');
const CACHE_DIR = path.join(process.cwd(), 'public', 'wikimedia-cache');
const MAX_SIZE_KB = 100;
const DELAY_MS = 2000; // Delay between requests to avoid rate limiting
const RETRY_DELAY_MS = 30000; // Wait 30s after 429 before retrying
const MAX_RETRIES = 3;

interface PoolItem {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

interface CacheIndex {
  items: {
    id: string;
    title: string;
    sourceUrl: string;
    localFile: string;
  }[];
}

function convertThumbToSvg(url: string): string {
  const thumbMatch = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([a-f0-9]\/[a-f0-9]{2})\/([^/]+\.svg)\/\d+px-[^/]+\.png$/i);
  if (thumbMatch) {
    return `${thumbMatch[1]}/${thumbMatch[2]}/${thumbMatch[3]}`;
  }
  // Also handle downloadUrl format
  return url.replace('?download', '');
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/\.svg$/i, '') // Remove .svg extension if present
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

async function downloadSvg(url: string): Promise<{ content: string; size: number } | 'rate_limited' | null> {
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.status === 429) {
        if (retry < MAX_RETRIES - 1) {
          console.log(`  Rate limited, waiting ${RETRY_DELAY_MS / 1000}s...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        return 'rate_limited';
      }

      if (!response.ok) {
        console.log(`  Failed: HTTP ${response.status}`);
        return null;
      }

      const content = await response.text();
      const sizeKB = Buffer.byteLength(content, 'utf-8') / 1024;

      if (sizeKB > MAX_SIZE_KB) {
        console.log(`  Skipped: ${sizeKB.toFixed(1)}KB > ${MAX_SIZE_KB}KB`);
        return null;
      }

      // Verify it's actually SVG
      if (!content.includes('<svg') && !content.includes('<?xml')) {
        console.log(`  Skipped: Not valid SVG`);
        return null;
      }

      return { content, size: sizeKB };
    } catch (error) {
      console.log(`  Error: ${error}`);
      return null;
    }
  }
  return null;
}

async function main() {
  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Load pool
  const poolData = fs.readFileSync(POOL_PATH, 'utf-8');
  const pool: PoolItem[] = JSON.parse(poolData);

  console.log(`Found ${pool.length} items in pool`);
  console.log(`Downloading SVGs smaller than ${MAX_SIZE_KB}KB...\n`);

  const cacheIndex: CacheIndex = { items: [] };
  let downloaded = 0;
  let skipped = 0;
  let totalSizeKB = 0;

  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    const svgUrl = convertThumbToSvg(item.downloadUrl);
    const filename = sanitizeFilename(item.title);
    const localPath = path.join(CACHE_DIR, `${filename}.svg`);

    // Skip if already exists
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      cacheIndex.items.push({
        id: filename,
        title: item.title,
        sourceUrl: item.sourceUrl,
        localFile: `${filename}.svg`,
      });
      downloaded++;
      totalSizeKB += stat.size / 1024;
      continue;
    }

    console.log(`[${i + 1}/${pool.length}] ${item.title}`);

    const result = await downloadSvg(svgUrl);

    if (result === 'rate_limited') {
      console.log(`  Still rate limited after retries, skipping...`);
      skipped++;
    } else if (result) {
      fs.writeFileSync(localPath, result.content, 'utf-8');
      cacheIndex.items.push({
        id: filename,
        title: item.title,
        sourceUrl: item.sourceUrl,
        localFile: `${filename}.svg`,
      });
      downloaded++;
      totalSizeKB += result.size;
      console.log(`  Saved: ${result.size.toFixed(1)}KB`);
    } else {
      skipped++;
    }

    // Delay to avoid rate limiting
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Save index
  const indexPath = path.join(CACHE_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(cacheIndex, null, 2));

  console.log(`\n========== DONE ==========`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total size: ${(totalSizeKB / 1024).toFixed(2)}MB`);
  console.log(`Index saved to: ${indexPath}`);
}

main().catch(console.error);
