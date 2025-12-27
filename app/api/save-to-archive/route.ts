import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface ArchiveItem {
  filename: string;
  title: string;
  wikimediaUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { svgUrl, title, wikimediaUrl } = body;

    if (!svgUrl || !title || !wikimediaUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate filename from title
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    const filename = `${sanitizedTitle}.svg`;

    const archiveDir = path.join(process.cwd(), 'public', 'wikimedia-archive');
    const filePath = path.join(archiveDir, filename);
    const indexPath = path.join(archiveDir, 'index.json');

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File already exists in archive', filename }, { status: 409 });
    }

    // Fetch SVG content
    const response = await fetch(svgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch SVG' }, { status: response.status });
    }

    const svgContent = await response.text();

    // Verify it's actually SVG
    if (!svgContent.includes('<svg') && !svgContent.includes('<?xml')) {
      return NextResponse.json({ error: 'Not a valid SVG file' }, { status: 400 });
    }

    // Save SVG file
    fs.writeFileSync(filePath, svgContent, 'utf-8');

    // Update index.json
    let archive: ArchiveItem[] = [];
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      archive = JSON.parse(indexContent);
    }

    // Check if already in index
    const existingIndex = archive.findIndex(item => item.wikimediaUrl === wikimediaUrl);
    if (existingIndex === -1) {
      archive.push({
        filename,
        title,
        wikimediaUrl,
      });
      fs.writeFileSync(indexPath, JSON.stringify(archive, null, 2), 'utf-8');
    }

    return NextResponse.json({
      success: true,
      filename,
      message: 'SVG saved to archive'
    });

  } catch (error) {
    console.error('Error saving to archive:', error);
    return NextResponse.json({ error: 'Failed to save SVG' }, { status: 500 });
  }
}
