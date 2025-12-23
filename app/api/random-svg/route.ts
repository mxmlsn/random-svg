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

    // Find all SVG preview links
    const links: string[] = [];
    $('.svg-image-box a').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.startsWith('https://freesvg.org/')) {
        links.push(href);
      }
    });

    if (links.length === 0) {
      return NextResponse.json({ error: 'No SVG images found on this page' }, { status: 404 });
    }

    // Step 2: Select a random link from the page
    const randomLink = links[Math.floor(Math.random() * links.length)];

    // Fetch the detail page
    const detailResponse = await fetch(randomLink);
    const detailHtml = await detailResponse.text();

    // Parse the detail page to find the actual SVG download link
    const $detail = cheerio.load(detailHtml);

    // Look for the download link or SVG source
    let svgUrl = '';
    let title = '';

    // Get the title
    title = $detail('h1').first().text().trim() || $detail('title').text().trim();

    // Look for the download link (format: /download/{id})
    $detail('a').each((_, element) => {
      const href = $detail(element).attr('href');
      const text = $detail(element).text().trim();

      // Look for download link
      if (href && (href.includes('/download/') || text.toLowerCase().includes('download svg'))) {
        svgUrl = href.startsWith('http') ? href : `https://freesvg.org${href}`;
        return false; // break the loop
      }
    });

    // If still not found, try regex search
    if (!svgUrl) {
      const downloadMatch = detailHtml.match(/href="(\/download\/\d+)"/);
      if (downloadMatch) {
        svgUrl = `https://freesvg.org${downloadMatch[1]}`;
      }
    }

    if (!svgUrl) {
      return NextResponse.json({
        error: 'Could not find SVG download link',
        detailPage: randomLink
      }, { status: 404 });
    }

    // Fetch the actual SVG content
    const svgResponse = await fetch(svgUrl);
    const svgContent = await svgResponse.text();

    return NextResponse.json({
      svg: svgContent,
      title,
      source: 'freesvg.org',
      sourceUrl: randomLink,
      svgUrl
    });

  } catch (error) {
    console.error('Error fetching random SVG:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
