import * as cheerio from 'cheerio';

export const FREESVG_URL = 'https://freesvg.org';

function sourceUrl(value: string | undefined) {
  if (!value) return;

  try {
    const url = new URL(value, FREESVG_URL);
    if (url.origin === FREESVG_URL) return url;
  } catch {
    // Ignore malformed links in upstream HTML.
  }
}

export function parseFreeSvgListing(html: string) {
  const $ = cheerio.load(html);
  const items: { href: string; thumb: string; title: string }[] = [];
  const seen = new Set<string>();
  let maxPage = 1;

  // Pagination belongs to the actual catalog, not to the repeated Trending grid.
  $('a[href]').each((_, element) => {
    const link = sourceUrl($(element).attr('href'));
    if (!link) return;

    const page = Number(link.searchParams.get('page'));
    if (link.pathname === '/' && Number.isSafeInteger(page) && page > maxPage) {
      maxPage = page;
    }
  });

  const catalog = $('section').filter((_, section) =>
    $(section).find('a[href]').toArray().some(element => {
      const link = sourceUrl($(element).attr('href'));
      return link?.pathname === '/' && Number(link.searchParams.get('page')) >= 1;
    })).first();

  // Fail closed on an unknown redesign instead of sampling recommendations.
  const links = catalog.length ? catalog.find('a[href]') : $('.svg-image-box a[href]');
  links.each((_, element) => {
    const link = sourceUrl($(element).attr('href'));
    if (!link) return;

    const img = $(element).find('img').first();
    const thumb = sourceUrl(img.attr('src') || img.attr('data-src'));
    if (!thumb || !/^\/(?:thumbs|storage\/img\/thumb)\//.test(thumb.pathname)) return;
    if (link.pathname === '/' || seen.has(link.href)) return;

    seen.add(link.href);
    items.push({
      href: link.href,
      thumb: thumb.href,
      title: img.attr('alt') || img.attr('title') || '',
    });
  });

  return { items, maxPage };
}

export function parseFreeSvgDetail(html: string) {
  const $ = cheerio.load(html);
  let previewImage: string | undefined;
  let downloadId: string | undefined;

  // Current detail pages use a plain image instead of contentUrl/og:image metadata.
  $('meta[itemprop="contentUrl"], meta[property="og:image"], main img, img').each((_, element) => {
    const image = sourceUrl($(element).attr('content') || $(element).attr('src'));
    if (image && /^\/(?:img|storage\/img)\//.test(image.pathname)
      && !image.pathname.startsWith('/storage/img/thumb/')) {
      previewImage = image.href;
      return false;
    }
  });

  $('a[href]').each((_, element) => {
    const link = sourceUrl($(element).attr('href'));
    const match = link?.pathname.match(/^\/download\/(\d+)\/?$/);
    if (match) {
      downloadId = match[1];
      return false;
    }
  });

  return { title: $('h1').first().text().trim(), previewImage, downloadId };
}
