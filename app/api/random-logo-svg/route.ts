import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const svgLogoDir = path.join(process.cwd(), 'svg-logo');
    const files = fs.readdirSync(svgLogoDir).filter(f => f.endsWith('.svg'));

    if (files.length === 0) {
      return NextResponse.json({ error: 'No SVG files found' }, { status: 404 });
    }

    // Get count and exclude list from query params
    const count = parseInt(request.nextUrl.searchParams.get('count') || '1');
    const excludeParam = request.nextUrl.searchParams.get('exclude') || '';
    const exclude = excludeParam ? excludeParam.split(',') : [];

    // Filter out excluded files
    const availableFiles = files.filter(f => !exclude.includes(f));

    if (availableFiles.length === 0) {
      return NextResponse.json({ error: 'No available SVG files' }, { status: 404 });
    }

    // Shuffle and pick unique files
    const shuffled = [...availableFiles].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    // Return multiple SVGs as JSON array
    const svgContents = selected.map(file => ({
      filename: file,
      content: fs.readFileSync(path.join(svgLogoDir, file), 'utf-8')
    }));

    return NextResponse.json(svgContents);
  } catch (error) {
    console.error('Error reading SVG:', error);
    return NextResponse.json({ error: 'Failed to read SVG' }, { status: 500 });
  }
}
