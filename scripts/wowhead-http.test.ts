import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchQuestHtml, requestGate, WowheadHttpError } from './wowhead-http.ts';

test('403 stops immediately without retrying a denied request', async () => {
  let calls = 0;
  const pauses: number[] = [];
  const request = (async () => { calls++; return new Response('', { status: 403 }); }) as typeof fetch;
  await assert.rejects(fetchQuestHtml('https://www.wowhead.com/quest=1', request,
    async ms => { pauses.push(ms); }),
    (error: unknown) => error instanceof WowheadHttpError && error.status === 403);
  assert.equal(calls, 1);
  assert.deepEqual(pauses, []);
});

test('403 and 404 are not retried', async () => {
  for (const status of [403, 404]) {
    let calls = 0;
    const request = (async () => { calls++; return new Response('', { status }); }) as typeof fetch;
    await assert.rejects(fetchQuestHtml('https://www.wowhead.com/quest=1', request, async () => {}),
      (error: unknown) => error instanceof WowheadHttpError && error.status === status);
    assert.equal(calls, 1);
  }
});

test('request gate spaces starts across concurrent workers', async () => {
  const pauses: number[] = [];
  const takeSlot = requestGate(2000, async ms => { pauses.push(ms); }, () => 1000);
  await Promise.all([takeSlot(), takeSlot(), takeSlot()]);
  assert.deepEqual(pauses, [2000, 4000]);
});

test('429 honors Retry-After before retrying', async () => {
  let calls = 0;
  let retrySlots = 0;
  const pauses: number[] = [];
  const request = (async () => ++calls === 1
    ? new Response('', { status: 429, headers: { 'Retry-After': '3' } })
    : new Response('ok')) as typeof fetch;
  assert.equal(await fetchQuestHtml('https://www.wowhead.com/quest=1', request,
    async ms => { pauses.push(ms); }, async () => { retrySlots++; }), 'ok');
  assert.deepEqual(pauses, [3000]);
  assert.equal(retrySlots, 1);
});
