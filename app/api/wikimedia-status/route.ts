/**
 * WIKIMEDIA STATUS API
 * ====================
 * Returns the current rate limit status for Wikimedia CDN.
 * Used by frontend to show countdown timer.
 */

import { NextResponse } from 'next/server';
import { wikimediaRateLimitedUntil } from '../proxy-image/route';

export async function GET() {
  const now = Date.now();
  const isLimited = now < wikimediaRateLimitedUntil;
  const secondsRemaining = isLimited
    ? Math.ceil((wikimediaRateLimitedUntil - now) / 1000)
    : 0;

  return NextResponse.json({
    isLimited,
    secondsRemaining,
    limitedUntil: isLimited ? wikimediaRateLimitedUntil : null,
  });
}
