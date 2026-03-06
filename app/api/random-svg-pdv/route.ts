import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Search for vintage vectors using tags from old OpenClipart project
// These are hand-drawn vectors from 2010-2015, avoiding AI-generated content
const VINTAGE_TAGS = [
  'openclipart',
  'svg',
  'clip art',
  'clipart',
  'retro',
  'vintage'
];

export async function GET() {
  try {
    // Step 1: Pick a random vintage tag
    const randomTag = VINTAGE_TAGS[Math.floor(Math.random() * VINTAGE_TAGS.length)];
    
    // Pick a random page (openclipart has ~1500 pages of results)
    const randomPage = Math.floor(Math.random() * 200) + 1;
    
    const searchUrl = `https://publicdomainvectors.org/search?q=${encodeURIComponent(randomTag)}&lang=en&page=${randomPage}`;

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
    const items: { href: string; thumb: string; title: string; id: number }[] = [];

    $('a[href*="/en/free-clipart/"][href$=".html"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      // Extract ID from URL
      const idMatch = href.match(/\/(\d+)\.html$/);
      if (!idMatch) return;
      
      const id = parseInt(idMatch[1]);
      
      // Only include vintage items (ID < 85000 to avoid AI-generated)
      if (id < 85000) {
        const img = $(element).find('img').first();
        const thumb = img.attr('src');
        const title = img.attr('alt') || img.attr('title') || '';

        if (thumb) {
          items.push({
            href: href.startsWith('http') ? href : `https://publicdomainvectors.org${href}`,
            thumb: thumb.startsWith('http') ? thumb : `https://publicdomainvectors.org${thumb}`,
            title,
            id
          });
        }
      }
    });

    if (items.length === 0) {
      // Fallback: try another tag or page
      return NextResponse.json({ 
        error: 'No vintage SVG images found on this page, try again',
        debug: { tag: randomTag, page: randomPage }
      }, { status: 404 });
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

    // Find the main preview image (in /photos/ directory or /png/)
    let previewImage = '';

    $detail('img').each((_, element) => {
      const src = $detail(element).attr('src');
      if (src && (src.includes('/photos/') || src.includes('/png/'))) {
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
    $detail('a[href*="/download/"]').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href) {
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
      _debug: { id: randomItem.id, tag: randomTag }
    });

  } catch (error) {
    console.error('Error fetching random SVG:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
