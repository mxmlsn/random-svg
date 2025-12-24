import { NextResponse } from 'next/server';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_OFFSET = 10000; // API limit

export async function GET() {
  try {
    // Step 1: Get total number of SVG files
    const totalHitsUrl = new URL(WIKIMEDIA_API);
    totalHitsUrl.searchParams.set('action', 'query');
    totalHitsUrl.searchParams.set('list', 'search');
    totalHitsUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    totalHitsUrl.searchParams.set('srnamespace', '6');
    totalHitsUrl.searchParams.set('srlimit', '1');
    totalHitsUrl.searchParams.set('format', 'json');
    totalHitsUrl.searchParams.set('origin', '*');

    const totalResponse = await fetch(totalHitsUrl.toString());
    const totalData = await totalResponse.json();

    const totalHits = totalData.query?.searchinfo?.totalhits || 0;

    if (totalHits === 0) {
      return NextResponse.json({ error: 'No SVG files found' }, { status: 404 });
    }

    // Step 2: Generate random offset (limited to MAX_OFFSET)
    const maxOffset = Math.min(totalHits - 1, MAX_OFFSET);
    const randomOffset = Math.floor(Math.random() * maxOffset);

    // Step 3: Get random file
    const searchUrl = new URL(WIKIMEDIA_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', 'filemime:image/svg+xml');
    searchUrl.searchParams.set('srnamespace', '6');
    searchUrl.searchParams.set('srlimit', '1');
    searchUrl.searchParams.set('sroffset', randomOffset.toString());
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json();

    const file = searchData.query?.search?.[0];

    if (!file) {
      return NextResponse.json({ error: 'No file found at offset' }, { status: 404 });
    }

    // Step 4: Get file title
    const title = file.title;

    // Step 5: Get image info with preview URL
    const imageInfoUrl = new URL(WIKIMEDIA_API);
    imageInfoUrl.searchParams.set('action', 'query');
    imageInfoUrl.searchParams.set('titles', title);
    imageInfoUrl.searchParams.set('prop', 'imageinfo');
    imageInfoUrl.searchParams.set('iiprop', 'url|size|mime');
    imageInfoUrl.searchParams.set('iiurlwidth', '300');
    imageInfoUrl.searchParams.set('format', 'json');
    imageInfoUrl.searchParams.set('origin', '*');

    const imageInfoResponse = await fetch(imageInfoUrl.toString());
    const imageInfoData = await imageInfoResponse.json();

    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];

    if (!imageInfo) {
      return NextResponse.json({ error: 'Could not get image info' }, { status: 404 });
    }

    // Extract title without "File:" prefix
    const cleanTitle = title.replace('File:', '');

    // Add ?download parameter to enable direct download
    const downloadUrl = imageInfo.url ? `${imageInfo.url}?download` : imageInfo.url;

    return NextResponse.json({
      title: cleanTitle,
      previewImage: imageInfo.thumburl || imageInfo.url,
      source: 'wikimedia.org',
      sourceUrl: imageInfo.descriptionurl,
      downloadUrl: downloadUrl,
    });

  } catch (error) {
    console.error('Error fetching random SVG from Wikimedia:', error);
    return NextResponse.json({
      error: 'Failed to fetch random SVG',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
