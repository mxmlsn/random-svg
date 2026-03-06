import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// List of available categories
const CATEGORIES = [
  'animals',
  'architecture',
  'backgrounds',
  'business',
  'flags',
  'food-and-drink',
  'health-medical',
  'nature',
  'objects',
  'people',
  'signs-symbols',
  'transportation'
];

export async function GET() {
  try {
    // Step 1: Select a random category
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const categoryUrl = `https://publicdomainvectors.org/en/free-clipart/${randomCategory}`;

    // Fetch the category page
    const pageResponse = await fetch(categoryUrl);

    if (!pageResponse.ok) {
      console.error('PDV category fetch error:', pageResponse.status, pageResponse.statusText);
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

    // Look for links to individual SVG pages
    $('a[href*="/en/free-clipart/"][href$=".html"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      // Find image within the link
      const img = $(element).find('img').first();
      const thumb = img.attr('src');
      const title = img.attr('alt') || img.attr('title') || '';

      if (thumb && !href.includes('/free-clipart/people') && !href.includes('/free-clipart/animals')) {
        // Exclude category links, only individual SVG pages
        items.push({
          href: href.startsWith('http') ? href : `https://publicdomainvectors.org${href}`,
          thumb: thumb.startsWith('http') ? thumb : `https://publicdomainvectors.org${thumb}`,
          title
        });
      }
    });

    if (items.length === 0) {
      return NextResponse.json({ error: 'No SVG images found in this category' }, { status: 404 });
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
