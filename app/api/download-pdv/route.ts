import { NextRequest, NextResponse } from 'next/server';

function getFilename(url: string, contentDisposition: string | null) {
  const headerMatch = contentDisposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (headerMatch?.[1]) {
    return decodeURIComponent(headerMatch[1]);
  }

  const parsedUrl = new URL(url);
  const queryFilename = parsedUrl.searchParams.get('file');
  if (queryFilename) {
    return queryFilename.endsWith('.svg') ? queryFilename : `${queryFilename}.svg`;
  }

  const pathName = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'download');
  return pathName.includes('.') ? pathName : `${pathName}.zip`;
}

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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch SVG' }, { status: response.status });
    }

    const svgContent = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const filename = getFilename(url, response.headers.get('content-disposition'));

    return new NextResponse(svgContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading SVG:', error);
    return NextResponse.json({ error: 'Failed to download SVG' }, { status: 500 });
  }
}
