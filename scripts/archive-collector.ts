/**
 * WIKIMEDIA ARCHIVE COLLECTOR
 *
 * Фоновый скрипт для автоматического сбора SVG с Wikimedia в архив.
 * Работает в цикле: собирает SVG пока не получит rate limit (429),
 * потом ждёт 2 минуты и продолжает.
 *
 * Запуск: npx tsx scripts/archive-collector.ts
 * Остановка: Ctrl+C
 */

import fs from 'fs';
import path from 'path';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000;
const ARCHIVE_DIR = path.join(process.cwd(), 'public', 'wikimedia-archive');
const INDEX_PATH = path.join(ARCHIVE_DIR, 'index.json');
const COOLDOWN_MS = 2 * 60 * 1000; // 2 минуты
const DELAY_BETWEEN_FETCHES_MS = 3000; // 3 секунды между запросами

// Слова для фильтрации (в нижнем регистре)
const BLOCKED_WORDS = ['sans', 'noto', 'plex', 'map', 'mono'];

interface ArchiveItem {
  filename: string;
  title: string;
  wikimediaUrl: string;
}

function loadArchive(): ArchiveItem[] {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading archive:', e);
  }
  return [];
}

function saveArchive(archive: ArchiveItem[]): void {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(archive, null, 2), 'utf-8');
}

function isBlockedTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return BLOCKED_WORDS.some(word => lowerTitle.includes(word));
}

// Step 1: Get random SVG info (FREE - no rate limit)
async function fetchRandomSvgInfo(): Promise<{
  title: string;
  svgUrl: string;
  wikimediaUrl: string;
} | null> {
  const randomOffset = Math.floor(Math.random() * MAX_OFFSET);

  // Search for random SVG (API request - free)
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

  if (!searchResponse.ok) {
    throw new Error(`Search failed: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  const file = searchData.query?.search?.[0];
  if (!file) return null;

  const title = file.title;
  const cleanTitle = title.replace('File:', '');

  // Check if title contains blocked words BEFORE getting image info
  if (isBlockedTitle(cleanTitle)) {
    console.log(`  🚫 Blocked: "${cleanTitle}" (contains filtered word)`);
    return null;
  }

  // Get image info (API request - free)
  const imageInfoUrl = new URL(WIKIMEDIA_API);
  imageInfoUrl.searchParams.set('action', 'query');
  imageInfoUrl.searchParams.set('titles', title);
  imageInfoUrl.searchParams.set('prop', 'imageinfo');
  imageInfoUrl.searchParams.set('iiprop', 'url');
  imageInfoUrl.searchParams.set('format', 'json');
  imageInfoUrl.searchParams.set('origin', '*');

  const imageInfoResponse = await fetch(imageInfoUrl.toString());

  if (!imageInfoResponse.ok) {
    throw new Error(`Image info failed: ${imageInfoResponse.status}`);
  }

  const imageInfoData = await imageInfoResponse.json();
  const pages = imageInfoData.query?.pages || {};
  const pageId = Object.keys(pages)[0];
  const imageInfo = pages[pageId]?.imageinfo?.[0];

  if (!imageInfo) return null;

  return {
    title: cleanTitle,
    svgUrl: imageInfo.url,
    wikimediaUrl: imageInfo.descriptionurl,
  };
}

// Step 2: Download SVG file (RATE LIMITED - this is the expensive call)
async function downloadAndSaveSvg(info: {
  title: string;
  svgUrl: string;
  wikimediaUrl: string;
}): Promise<'success' | 'skip' | 'rate_limited' | 'error'> {
  const archive = loadArchive();

  // Check if already exists (FREE check - no download needed)
  if (archive.some(item => item.wikimediaUrl === info.wikimediaUrl)) {
    console.log(`  ⏭️  Already in archive: ${info.title}`);
    return 'skip';
  }

  // Generate filename
  const sanitizedTitle = info.title
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  const filename = `${sanitizedTitle}.svg`;
  const filePath = path.join(ARCHIVE_DIR, filename);

  if (fs.existsSync(filePath)) {
    console.log(`  ⏭️  File exists: ${filename}`);
    return 'skip';
  }

  // Download SVG (THIS IS THE RATE LIMITED CALL)
  console.log(`  📥 Downloading: ${info.title}`);
  const response = await fetch(info.svgUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (response.status === 429) {
    return 'rate_limited';
  }

  if (!response.ok) {
    console.log(`  ❌ Failed to download: ${response.status}`);
    return 'error';
  }

  const svgContent = await response.text();

  // Verify it's SVG
  if (!svgContent.includes('<svg') && !svgContent.includes('<?xml')) {
    console.log(`  ❌ Not a valid SVG`);
    return 'error';
  }

  // Save file
  fs.writeFileSync(filePath, svgContent, 'utf-8');

  // Update index
  archive.push({
    filename,
    title: info.title,
    wikimediaUrl: info.wikimediaUrl,
  });
  saveArchive(archive);

  console.log(`  ✅ Saved: ${filename} (${svgContent.length} bytes)`);
  return 'success';
}

async function collectOne(): Promise<'success' | 'skip' | 'rate_limited' | 'error'> {
  try {
    // Step 1: Get info (FREE)
    const info = await fetchRandomSvgInfo();
    if (!info) {
      return 'skip';
    }

    // Step 2: Download (RATE LIMITED)
    return await downloadAndSaveSvg(info);
  } catch (e) {
    console.error('  ❌ Error:', e);
    return 'error';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Wikimedia Archive Collector started');
  console.log(`📁 Archive directory: ${ARCHIVE_DIR}`);
  console.log(`⏱️  Delay between fetches: ${DELAY_BETWEEN_FETCHES_MS / 1000}s`);
  console.log(`⏱️  Cooldown after rate limit: ${COOLDOWN_MS / 1000}s`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  let totalCollected = 0;
  let sessionCollected = 0;

  while (true) {
    const archive = loadArchive();
    console.log(`\n📊 Archive size: ${archive.length} SVGs | Session: +${sessionCollected} | Total: +${totalCollected}`);
    console.log('🔄 Fetching random SVG...');

    const result = await collectOne();

    if (result === 'rate_limited') {
      console.log(`\n⚠️  Rate limited! Waiting ${COOLDOWN_MS / 1000} seconds...`);
      sessionCollected = 0;
      await sleep(COOLDOWN_MS);
      console.log('🔄 Resuming...');
    } else {
      if (result === 'success') {
        totalCollected++;
        sessionCollected++;
      }
      await sleep(DELAY_BETWEEN_FETCHES_MS);
    }
  }
}

main().catch(console.error);
