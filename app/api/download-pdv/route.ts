import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Fetch SVG from publicdomainvectors.org
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://publicdomainvectors.org/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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
