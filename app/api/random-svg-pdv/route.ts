import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Use old SVG IDs to avoid AI-generated corporate memphis style
// IDs below ~80000 are vintage/hand-drawn vectors (2010-2020)
// IDs above ~90000 are AI-generated (2024+)
const MIN_ID = 1000;
const MAX_ID = 80000;

export async function GET() {
  try {
    // Step 1: Generate a random ID from vintage range
    const randomId = Math.floor(Math.random() * (MAX_ID - MIN_ID + 1)) + MIN_ID;
    
    // Try to fetch the page directly by ID
    // We don't know the URL slug, so we need to search for it
    const searchUrl = `https://publicdomainvectors.org/search?lang=en&sort=oldest&page=${Math.floor(randomId / 20)}`;
    
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      console.error('PDV search error:', searchResponse.status, searchResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch from publicdomainvectors.org',
        details: `HTTP ${searchResponse.status}: ${searchResponse.statusText}`
      }, { status: 502 });
    }

    const searchHtml = await searchResponse.text();
    const $ = cheerio.load(searchHtml);

    // Find all SVG links on the page
    const items: { href: string; thumb: string; title: string }[] = [];

    $('a[href*="/en/free-clipart/"][href$=".html"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      // Extract ID from URL
      const idMatch = href.match(/\/(\d+)\.html$/);
      if (!idMatch) return;
      
      const id = parseInt(idMatch[1]);
      
      // Only include items in our vintage ID range
      if (id >= MIN_ID && id <= MAX_ID) {
        const img = $(element).find('img').first();
        const thumb = img.attr('src');
        const title = img.attr('alt') || img.attr('title') || '';

        if (thumb) {
          items.push({
            href: href.startsWith('http') ? href : `https://publicdomainvectors.org${href}`,
            thumb: thumb.startsWith('http') ? thumb : `https://publicdomainvectors.org${thumb}`,
            title
          });
        }
      }
    });

    if (items.length === 0) {
      // Fallback: try a different page
      return NextResponse.json({ error: 'No vintage SVG images found, try again' }, { status: 404 });
    }

    // Step 2: Select a random item from the page
    const randomItem = items[Math.floor(Math.random() * items.length)];

    // Fetch the detail page
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

    $detail('img').each((_, element) => {
      const src = $detail(element).attr('src');
      if (src && src.includes('/photos/')) {
        previewImage = src.startsWith('http') ? src : `https://publicdomainvectors.org${src}`;
        return false;
      }
    });

    // Fallback to thumbnail if no main image found
    if (!previewImage) {
      previewImage = randomItem.thumb;
    }

    // Find the download link
    let downloadUrl = '';
    $detail('.download a, a[href*="/download/"]').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href && (href.includes('download.php') || href.includes('/download/'))) {
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
