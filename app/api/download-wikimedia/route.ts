import { NextRequest, NextResponse } from 'next/server';
import { WIKIMEDIA_USER_AGENT } from '../../lib/wikimedia';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const source = new URL(url);
    if (source.protocol !== 'https:' || source.hostname !== 'upload.wikimedia.org'
      || !source.pathname.startsWith('/wikipedia/commons/') || !source.pathname.toLowerCase().endsWith('.svg')) {
      return NextResponse.json({ error: 'Invalid Wikimedia SVG URL' }, { status: 400 });
    }

    // Fetch SVG from Wikimedia only when the direct browser download is unavailable.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch SVG' }, { status: response.status });
    }

    const svgContent = await response.arrayBuffer();

    // Extract filename from URL
    const urlPath = new URL(url).pathname;
    const filename = decodeURIComponent(urlPath.split('/').pop() || 'download.svg');

    return new NextResponse(svgContent, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading SVG:', error);
    return NextResponse.json({ error: 'Failed to download SVG' }, { status: 500 });
  }
}
