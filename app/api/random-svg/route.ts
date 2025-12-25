import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    // Step 1: Get a random page from freesvg.org (1-2132)
    const randomPage = Math.floor(Math.random() * 2132) + 1;
    const pageUrl = `https://freesvg.org/?page=${randomPage}`;

    // Fetch the page
    const pageResponse = await fetch(pageUrl);
    const pageHtml = await pageResponse.text();

    // Parse the HTML
    const $ = cheerio.load(pageHtml);

    // Find all SVG preview items with their thumbnails
    const items: { href: string; thumb: string; title: string }[] = [];

    $('.svg-image-box').each((_, element) => {
      const link = $(element).find('a').first();
      const href = link.attr('href');
      const img = $(element).find('img').first();
      const thumb = img.attr('src');
      const title = img.attr('alt') || img.attr('title') || '';

      if (href && href.startsWith('https://freesvg.org/') && thumb) {
        items.push({
          href,
          thumb: thumb.startsWith('http') ? thumb : `https://freesvg.org${thumb}`,
          title
        });
      }
    });

    if (items.length === 0) {
      return NextResponse.json({ error: 'No SVG images found on this page' }, { status: 404 });
    }

    // Step 2: Select a random item from the page
    const randomItem = items[Math.floor(Math.random() * items.length)];

    // Fetch the detail page to get higher quality preview and download link
    const detailResponse = await fetch(randomItem.href);
    const detailHtml = await detailResponse.text();
    const $detail = cheerio.load(detailHtml);

    // Get the title from the detail page
    const title = $detail('h1').first().text().trim() || randomItem.title;

    // Find the main preview image (higher quality PNG)
    let previewImage = '';

    // Look for the main image in /img/ directory (higher quality than thumb)
    const mainImgMatch = detailHtml.match(/content="https:\/\/freesvg\.org\/(img\/[^"]+\.png)"/);
    if (mainImgMatch) {
      previewImage = `https://freesvg.org/${mainImgMatch[1]}`;
    }

    // Fallback: look for contentUrl meta tag
    if (!previewImage) {
      const contentUrl = $detail('meta[itemprop="contentUrl"]').attr('content');
      if (contentUrl) {
        previewImage = contentUrl.startsWith('http') ? contentUrl : `https://freesvg.org${contentUrl}`;
      }
    }

    // Fallback to thumbnail
    if (!previewImage) {
      previewImage = randomItem.thumb;
    }

    // Find the download ID from the page
    let downloadId = '';
    $detail('a').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href && href.includes('/download/')) {
        const match = href.match(/\/download\/(\d+)/);
        if (match) {
          downloadId = match[1];
        }
        return false;
      }
    });

    // Use our proxy endpoint for downloading (adds required Referer header)
    const downloadUrl = downloadId
      ? `/api/download-freesvg?id=${downloadId}`
      : randomItem.href;

    return NextResponse.json({
      title,
      previewImage,
      source: 'freesvg.org',
      sourceUrl: randomItem.href,
      downloadUrl,
    });

  } catch (error) {
    console.error('Error fetching random SVG:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
