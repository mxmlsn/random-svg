/**
 * WIKIMEDIA STATUS API
 * ====================
 * Returns the current rate limit status for Wikimedia.
 * Combines both CDN rate limit (from proxy) and API rate limit (from wikimedia route).
 * Used by frontend to show countdown timer.
 */

import { NextResponse } from 'next/server';
import { wikimediaRateLimitedUntil } from '../proxy-image/route';
import { apiRateLimitedUntil } from '../random-svg-wikimedia/route';

export async function GET() {
  const now = Date.now();

  // Use the later of the two rate limits
  const effectiveLimitedUntil = Math.max(wikimediaRateLimitedUntil, apiRateLimitedUntil);
  const isLimited = now < effectiveLimitedUntil;
  const secondsRemaining = isLimited
    ? Math.ceil((effectiveLimitedUntil - now) / 1000)
    : 0;

  return NextResponse.json({
    isLimited,
    secondsRemaining,
    limitedUntil: isLimited ? effectiveLimitedUntil : null,
  });
}
