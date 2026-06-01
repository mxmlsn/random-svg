import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://publicdomainvectors.org';
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
  'transportation',
] as const;

const PDV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Referer': `${BASE_URL}/en/`,
};

function absoluteUrl(url: string) {
  return new URL(url, BASE_URL).toString();
}

function extractItems($: cheerio.CheerioAPI) {
  const items: { href: string; thumb: string; title: string }[] = [];
  const seen = new Set<string>();

  $('a[href*="/en/free-clipart/"][href$=".html"]').each((_, element) => {
    const href = $(element).attr('href');
    const img = $(element).find('img').first();
    const thumb = img.attr('src');
    const title = img.attr('alt') || $(element).find('p').first().text().trim();

    if (!href || !thumb || seen.has(href)) {
      return;
    }

    seen.add(href);
    items.push({
      href: absoluteUrl(href),
      thumb: absoluteUrl(thumb),
      title,
    });
  });

  return items;
}

function extractMaxPage($: cheerio.CheerioAPI) {
  let maxPage = 1;

  $('a[href*="page="]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const page = Number(new URL(href, BASE_URL).searchParams.get('page'));
    if (Number.isFinite(page)) {
      maxPage = Math.max(maxPage, page);
    }
  });

  return maxPage;
}

export async function GET() {
  try {
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const categoryUrl = `${BASE_URL}/en/free-clipart/${randomCategory}`;

    const categoryResponse = await fetch(categoryUrl, { headers: PDV_HEADERS });

    if (!categoryResponse.ok) {
      console.error('PDV category fetch error:', categoryResponse.status, categoryResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch from publicdomainvectors.org',
        details: `HTTP ${categoryResponse.status}: ${categoryResponse.statusText}`
      }, { status: 502 });
    }

    const categoryHtml = await categoryResponse.text();
    const $category = cheerio.load(categoryHtml);
    const maxPage = extractMaxPage($category);
    const randomPage = Math.floor(Math.random() * maxPage) + 1;
    const pageUrl = randomPage === 1 ? categoryUrl : `${categoryUrl}?page=${randomPage}`;

    let $ = $category;
    if (randomPage !== 1) {
      const pageResponse = await fetch(pageUrl, { headers: PDV_HEADERS });
      if (pageResponse.ok) {
        $ = cheerio.load(await pageResponse.text());
      } else {
        console.error('PDV page fetch error:', pageResponse.status, pageResponse.statusText);
      }
    }

    const items = extractItems($);
    if (items.length === 0 && randomPage !== 1) {
      items.push(...extractItems($category));
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No SVG images found on this page' }, { status: 404 });
    }

    const randomItem = items[Math.floor(Math.random() * items.length)];
    const detailResponse = await fetch(randomItem.href, { headers: PDV_HEADERS });

    if (!detailResponse.ok) {
      console.error('PDV detail page fetch error:', detailResponse.status, detailResponse.statusText);
      return NextResponse.json({
        error: 'Failed to fetch detail page from publicdomainvectors.org',
        details: `HTTP ${detailResponse.status}: ${detailResponse.statusText}`
      }, { status: 502 });
    }

    const detailHtml = await detailResponse.text();
    const $detail = cheerio.load(detailHtml);

    const title = $detail('h1').first().text().trim() || randomItem.title;
    let previewImage = '';

    $detail('img').each((_, element) => {
      const src = $detail(element).attr('src');
      if (src && (src.includes('/photos/') || src.includes('/tn_img/') || src.includes('/png/'))) {
        previewImage = absoluteUrl(src);
        return false;
      }
    });

    if (!previewImage) {
      previewImage = randomItem.thumb;
    }

    let downloadUrl = '';
    $detail('a[href*="/download/"], a[href*="download.php"]').each((_, element) => {
      const href = $detail(element).attr('href');
      if (href) {
        downloadUrl = absoluteUrl(href);
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
