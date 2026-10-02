export class WowheadHttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`Wowhead returned HTTP ${status} for ${url}.`);
  }
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function requestGate(intervalMs: number, pause: (ms: number) => Promise<void> = wait, now = Date.now) {
  let nextAt = 0;
  return async () => {
    const current = now();
    const scheduled = Math.max(current, nextAt);
    nextAt = scheduled + intervalMs;
    if (scheduled > current) await pause(scheduled - current);
  };
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(delay) && delay >= 0) return Math.min(delay, 120_000);
  }
  return attempt * 2000;
}

export async function fetchQuestHtml(
  url: string,
  request: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = wait,
  beforeRetry?: () => Promise<void>,
): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await request(url, {
      headers: {
        'User-Agent': 'WowheadQuestComments/0.1 (+https://github.com/philarmino/wowhead-quest-comments)',
        'Accept-Language': 'en',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.text();
    const retryable = (response.status === 429 || response.status >= 500) && attempt < 3;
    if (!retryable) throw new WowheadHttpError(response.status, response.url || url);
    await response.body?.cancel();
    await pause(retryDelay(response, attempt));
    if (beforeRetry) await beforeRetry();
  }
  throw new Error('Wowhead request attempts exhausted.');
}
