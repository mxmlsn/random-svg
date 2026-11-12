import { NextResponse } from 'next/server';
import { getWikimediaApiRetryAt } from '../../lib/wikimedia-server';

export async function GET() {
  const limitedUntil = getWikimediaApiRetryAt();
  const secondsRemaining = Math.max(0, Math.ceil((limitedUntil - Date.now()) / 1000));
  return NextResponse.json({
    isLimited: secondsRemaining > 0,
    secondsRemaining,
    limitedUntil: secondsRemaining > 0 ? limitedUntil : null,
    scope: 'server-api',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
