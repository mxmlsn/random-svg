import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFreeSvgListing, parseFreeSvgDetail } from '../app/lib/freesvg.ts';

test('redesigned listing extracts free cards, excluding adverts and duplicates', () => {
  const listing = parseFreeSvgListing(`
    <a href="https://stock.adobe.com/image/123"><img src="https://as2.ftcdn.net/stock.jpg"></a>
    <a href="/1544561650" class="aspect-square checkerboard-hover">
      <img src="https://freesvg.org/thumbs/1544561650.png?mode=contain" alt="Woman">
    </a>
    <a href="/1544561650"><img src="/thumbs/1544561650.png"></a>
    <a href="https://freesvg.org/polycyttaria1"><img src="/storage/img/thumb/Polycyttaria1.png" title="Polycyttaria1"></a>
    <a href="https://example.com/paid"><img src="/thumbs/paid.png"></a>
    <a href="/?page=2">2</a><a href="https://freesvg.org?page=5762">5,762</a>
    <a href="https://example.com/?page=99999">External</a>
    <a href="/?page=invalid">Invalid</a>
  `);
  assert.equal(listing.maxPage, 5762);
  assert.deepEqual(listing.items, [
    { href: 'https://freesvg.org/1544561650', thumb: 'https://freesvg.org/thumbs/1544561650.png?mode=contain', title: 'Woman' },
    { href: 'https://freesvg.org/polycyttaria1', thumb: 'https://freesvg.org/storage/img/thumb/Polycyttaria1.png', title: 'Polycyttaria1' },
  ]);
});

test('legacy listing and pages without pagination remain usable', () => {
  assert.deepEqual(parseFreeSvgListing(`
    <div class="svg-image-box"><a href="https://freesvg.org/woman">
      <img src="/thumbs/woman.png" alt="Woman"></a></div>
  `), {
    maxPage: 1,
    items: [{ href: 'https://freesvg.org/woman', thumb: 'https://freesvg.org/thumbs/woman.png', title: 'Woman' }],
  });
  assert.deepEqual(parseFreeSvgListing('<h1>No results</h1>'), { items: [], maxPage: 1 });
});

test('current detail exposes full-size preview without image meta tags', () => {
  assert.deepEqual(parseFreeSvgDetail(`
    <header><img src="/upload/free_svg-logo.png"></header>
    <main><section class="hero"><div class="stage"><img src="/img/1544561650.png"></div>
      <h1>Woman SVG – Free Vector Download</h1>
      <a href="https://freesvg.org/download/141563">Download SVG</a></section>
      <img src="/storage/img/thumb/related.png"></main>
  `), {
    title: 'Woman SVG – Free Vector Download',
    previewImage: 'https://freesvg.org/img/1544561650.png',
    downloadId: '141563',
  });
});

test('legacy metadata, relative downloads and missing detail fields', () => {
  assert.deepEqual(parseFreeSvgDetail(`
    <meta itemprop="contentUrl" content="https://freesvg.org/img/legacy.png">
    <h1>Legacy image</h1><a href="/download/95440">Download</a>
  `), { title: 'Legacy image', previewImage: 'https://freesvg.org/img/legacy.png', downloadId: '95440' });
  assert.deepEqual(parseFreeSvgDetail('<h1>Fallback</h1>'), {
    title: 'Fallback', previewImage: undefined, downloadId: undefined,
  });
});
