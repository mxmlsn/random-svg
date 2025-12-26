import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    // Step 1: Get a random page from publicdomainvectors.org (38-788)
    const randomPage = Math.floor(Math.random() * (788 - 38 + 1)) + 38;
    const pageUrl = `https://publicdomainvectors.org/en/free-clipart/${randomPage}/`;

    // Fetch the page
    const pageResponse = await fetch(pageUrl);

    if (!pageResponse.ok) {
      console.error('PDV page fetch error:', pageResponse.status, pageResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch from publicdomainvectors.org',
        details: `HTTP ${pageResponse.status}: ${pageResponse.statusText}`
      }, { status: 502 });
    }

    const pageHtml = await pageResponse.text();

    // Parse the HTML
    const $ = cheerio.load(pageHtml);

    // Find all SVG preview items with their thumbnails
    const items: { href: string; thumb: string; title: string }[] = [];

    $('.vector').each((_, element) => {
      const link = $(element).find('a').first();
      const href = link.attr('href');
      const img = $(element).find('img').first();
      const thumb = img.attr('src');
      const title = img.attr('alt') || img.attr('title') || '';

      if (href && href.includes('/en/free-clipart/') && thumb) {
        items.push({
          href: href.startsWith('http') ? href : `https://publicdomainvectors.org${href}`,
          thumb: thumb.startsWith('http') ? thumb : `https://publicdomainvectors.org${thumb}`,
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

    if (!detailResponse.ok) {
      console.error('PDV detail page fetch error:', detailResponse.status, detailResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch detail page from publicdomainvectors.org',
        details: `HTTP ${detailResponse.status}: ${detailResponse.statusText}`
      }, { status: 502 });
    }

    const detailHtml = await detailResponse.text();
    const $detail = cheerio.load(detailHtml);

    // Get the title from the detail page
    const title = $detail('h1').first().text().trim() || randomItem.title;

    // Find the main preview image (in /photos/ directory)
    let previewImage = '';

    // Try multiple selectors to find the main preview image
    // Images can be .png, .jpg, or other formats
    $detail('img').each((_, element) => {
      const src = $detail(element).attr('src');
      if (src && src.includes('/photos/')) {
        previewImage = src.startsWith('http') ? src : `https://publicdomainvectors.org${src}`;
        return false; // Stop after finding first match
      }
    });

    // Fallback to thumbnail if no main image found
    if (!previewImage) {
      previewImage = randomItem.thumb;
    }

    // Find the download link
    let downloadUrl = '';
    $detail('.download a').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href && href.includes('download.php')) {
        downloadUrl = href.startsWith('http') ? href : `https://publicdomainvectors.org${href}`;
        return false;
      }
    });

    return NextResponse.json({
      title,
      previewImage,
      source: 'publicdomainvectors.org',
      sourceUrl: randomItem.href,
      downloadUrl: downloadUrl || randomItem.href,
    });

  } catch (error) {
    console.error('Error fetching random SVG:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
