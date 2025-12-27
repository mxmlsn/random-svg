import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const svgLogoDir = path.join(process.cwd(), 'svg-logo');
    const files = fs.readdirSync(svgLogoDir).filter(f => f.endsWith('.svg'));

    if (files.length === 0) {
      return NextResponse.json({ error: 'No SVG files found' }, { status: 404 });
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const svgContent = fs.readFileSync(path.join(svgLogoDir, randomFile), 'utf-8');

    return new NextResponse(svgContent, {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    });
  } catch (error) {
    console.error('Error reading SVG:', error);
    return NextResponse.json({ error: 'Failed to read SVG' }, { status: 500 });
  }
}
