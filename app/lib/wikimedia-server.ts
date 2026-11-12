// API backoff applies only to this server instance, never to image delivery or
// to direct browser requests, which have separate Wikimedia rate limits.
let limitedUntil = 0;

export function getWikimediaApiRetryAt() {
  return limitedUntil;
}

export function deferWikimediaApi(seconds: number) {
  limitedUntil = Math.max(limitedUntil, Date.now() + seconds * 1000);
}
