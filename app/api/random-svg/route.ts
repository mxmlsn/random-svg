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

    // Try to find the download button/link
    $detail('a').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href && href.endsWith('.svg')) {
        svgUrl = href.startsWith('http') ? href : `https://freesvg.org${href}`;
      }
    });

    // Get the title
    title = $detail('h1').first().text().trim() || $detail('title').text().trim();

    // If we still don't have an SVG URL, look for it in the page content
    if (!svgUrl) {
      const svgMatch = detailHtml.match(/href="([^"]*\.svg)"/);
      if (svgMatch) {
        svgUrl = svgMatch[1].startsWith('http') ? svgMatch[1] : `https://freesvg.org${svgMatch[1]}`;
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
