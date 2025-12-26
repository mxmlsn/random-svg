import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SvgItem {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

// Load pool once at startup
let svgPool: SvgItem[] = [];

function loadPool() {
  if (svgPool.length > 0) return;

  try {
    const poolPath = path.join(process.cwd(), 'data', 'wikimedia-svg-pool.json');
    const data = fs.readFileSync(poolPath, 'utf-8');
    svgPool = JSON.parse(data);
    console.log(`Loaded ${svgPool.length} SVGs from Wikimedia pool`);
  } catch (error) {
    console.error('Failed to load Wikimedia SVG pool:', error);
    svgPool = [];
  }
}

export async function GET() {
  loadPool();

  if (svgPool.length === 0) {
    return NextResponse.json({
      error: 'SVG pool not available',
      details: 'Run: npx tsx scripts/fetch-wikimedia-pool.ts'
    }, { status: 503 });
  }

  // Return random item from pool
  const randomIndex = Math.floor(Math.random() * svgPool.length);
  const svg = svgPool[randomIndex];

  return NextResponse.json(svg);
}
