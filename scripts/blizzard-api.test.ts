import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBlizzardToken, getQuestArea, questAreaIndex, validateQuestArea } from './blizzard-api.ts';

test('quest area responses are accepted and malformed quest lists are rejected', () => {
  const sample = {
    id: 331,
    area: 'Sample Area',
    quests: [
      { id: 2, name: 'Example', key: { href: 'https://eu.api.blizzard.com/data/wow/quest/2' } },
      { id: 23, name: null, key: { href: 'https://eu.api.blizzard.com/data/wow/quest/23' } },
    ],
  };
  assert.doesNotThrow(() => validateQuestArea(sample, 331));
  assert.throws(() => validateQuestArea({ ...sample, id: 1 }, 331));
  assert.throws(() => validateQuestArea({ ...sample, quests: [...sample.quests, sample.quests[0]] }, 331));
  assert.doesNotThrow(() => validateQuestArea({ id: 331, area: null, quests: [] }, 331));
});

test('OAuth and area requests send credentials only in headers', async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const request = (async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return Response.json(calls.length === 1 ? { access_token: 'test-token' } : { id: 14, area: 'Durotar', quests: [] });
  }) as typeof fetch;
  const token = await getBlizzardToken('client-id', 'client-secret', request);
  await getQuestArea('14', token, request);
  assert.equal(calls[0].url.href, 'https://oauth.battle.net/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'grant_type=client_credentials');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization,
    `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
  assert.equal(calls[1].url.pathname, '/data/wow/quest/area/14');
  assert.equal(calls[1].url.searchParams.get('namespace'), 'static-eu');
  assert.equal(calls[1].url.searchParams.get('locale'), 'de_DE');
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer test-token');
  assert.equal(calls[1].url.searchParams.has('access_token'), false);
});

test('index parser extracts area IDs and names', () => {
  assert.deepEqual(questAreaIndex({ areas: [{ id: 331, name: 'Zone B' }, { id: 1, name: 'Zone A' }] }),
    [{ id: 1, name: 'Zone A' }, { id: 331, name: 'Zone B' }]);
  assert.throws(() => questAreaIndex({ areas: [{ name: 'Missing ID' }] }));
  assert.deepEqual(questAreaIndex({ areas: [{ id: 14023, name: null }] }), [{ id: 14023, name: null }]);
  assert.throws(() => questAreaIndex({ areas: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }] }));
});
