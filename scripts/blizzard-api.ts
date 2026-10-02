import { isObject } from './pipeline.ts';

export interface QuestArea {
  id: number;
  area: string | null;
  quests: Array<{ id: number; name: string | null; key: { href: string } }>;
  [key: string]: unknown;
}

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export function validateQuestArea(value: unknown, areaId: number): asserts value is QuestArea {
  if (!isObject(value) || value.id !== areaId ||
      (value.area !== null && typeof value.area !== 'string') || !Array.isArray(value.quests))
    throw new Error(`Invalid quest area response for area ${areaId}.`);
  const ids = new Set<number>();
  for (const quest of value.quests) {
    if (!isObject(quest) || !positiveId(quest.id) || ids.has(quest.id) ||
        (quest.name !== null && typeof quest.name !== 'string') ||
        !isObject(quest.key) || typeof quest.key.href !== 'string' || !quest.key.href)
      throw new Error(`Invalid or duplicate quest in area ${areaId}.`);
    ids.add(quest.id);
  }
}

export function questAreaIndex(value: unknown): Array<{ id: number; name: string | null }> {
  if (!isObject(value) || !Array.isArray(value.areas))
    throw new Error('Invalid quest area index response.');
  const areas = value.areas.map((area: unknown) => {
    if (!isObject(area) || !positiveId(area.id) ||
        (area.name !== null && typeof area.name !== 'string'))
      throw new Error('Invalid entry in quest area index.');
    return { id: area.id as number, name: area.name };
  });
  areas.sort((a, b) => a.id - b.id);
  if (areas.some((area, index) => index > 0 && area.id === areas[index - 1].id))
    throw new Error('Duplicate area ID in quest area index.');
  return areas;
}

async function responseJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status} ${response.statusText}`.trim());
  try { return await response.json(); }
  catch { throw new Error(`${label} did not return valid JSON.`); }
}

export async function getBlizzardToken(clientId: string, clientSecret: string, request: typeof fetch = fetch): Promise<string> {
  const response = await request('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  const data = await responseJson(response, 'Battle.net OAuth');
  if (!isObject(data) || typeof data.access_token !== 'string' || !data.access_token)
    throw new Error('Battle.net OAuth response has no access token.');
  return data.access_token;
}

export async function getQuestArea(path: string, token: string, request: typeof fetch = fetch): Promise<unknown> {
  const url = new URL(`https://eu.api.blizzard.com/data/wow/quest/area/${path}`);
  url.searchParams.set('namespace', 'static-eu');
  url.searchParams.set('locale', 'de_DE');
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  return responseJson(response, 'Battle.net quest area request');
}
