import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { atomicWrite, readJson, root } from './pipeline.ts';
import { getBlizzardToken, getQuestArea, questAreaIndex, validateQuestArea, type QuestArea } from './blizzard-api.ts';

const areaPath = (id: number) => resolve(root, 'data', 'quest-areas', `${id}.json`);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function cachedArea(id: number): Promise<QuestArea | undefined> {
  try {
    const data = await readJson(areaPath(id));
    validateQuestArea(data, id);
    return data;
  } catch { return undefined; }
}

async function fetchArea(id: number, token: string): Promise<QuestArea> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await getQuestArea(String(id), token);
      validateQuestArea(data, id);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 3 || !/HTTP (?:429|5\d\d)\b|fetch failed|timeout/i.test(message)) throw error;
      await wait(attempt * 1000);
    }
  }
  throw new Error(`Could not fetch area ${id}.`);
}

async function main() {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  const { values } = parseArgs({ options: {
    area: { type: 'string' },
    'list-areas': { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  }});
  const areaId = values.area === undefined ? undefined : Number(values.area);
  if (areaId !== undefined && (!Number.isSafeInteger(areaId) || areaId <= 0))
    throw new Error('--area must be a positive integer.');

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error('Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET before running this command.');

  const token = await getBlizzardToken(clientId, clientSecret);
  if (values['list-areas']) {
    const areas = questAreaIndex(await getQuestArea('index', token));
    for (const area of areas) console.log(`${area.id}\t${area.name ?? '(unnamed)'}`);
    return;
  }

  if (areaId !== undefined) {
    const data = (!values.refresh && await cachedArea(areaId)) || await fetchArea(areaId, token);
    await atomicWrite(areaPath(areaId), `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Saved ${data.quests.length} quest IDs for area ${areaId} to data/quest-areas/${areaId}.json.`);
    return;
  }

  const areas = questAreaIndex(await getQuestArea('index', token));
  await atomicWrite(resolve(root, 'data', 'quest-areas', 'index.json'),
    `${JSON.stringify(areas, null, 2)}\n`);
  const ids = new Set<number>();
  const failedAreaIds: number[] = [];
  let fetched = 0;
  for (const [index, area] of areas.entries()) {
    try {
      let data = values.refresh ? undefined : await cachedArea(area.id);
      if (!data) {
        data = await fetchArea(area.id, token);
        await atomicWrite(areaPath(area.id), `${JSON.stringify(data, null, 2)}\n`);
        fetched++;
        await wait(150);
      }
      for (const quest of data.quests) ids.add(quest.id);
    } catch (error) {
      failedAreaIds.push(area.id);
      console.error(`Area ${area.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((index + 1) % 25 === 0 || index + 1 === areas.length)
      console.log(`Areas ${index + 1}/${areas.length}; unique quest IDs ${ids.size}; failed ${failedAreaIds.length}.`);
  }
  const output = {
    schemaVersion: 1,
    region: 'eu', locale: 'de_DE', generatedAt: new Date().toISOString(),
    areaCount: areas.length,
    failedAreaIds,
    questIds: [...ids].sort((a, b) => a - b),
  };
  const destination = failedAreaIds.length
    ? resolve(root, 'data', 'quest-ids.partial.json')
    : resolve(root, 'scripts', 'quest-ids.json');
  await atomicWrite(destination, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Saved ${output.questIds.length} unique quest IDs to ${failedAreaIds.length ? 'data/quest-ids.partial.json' : 'scripts/quest-ids.json'} (${fetched} areas fetched).`);
  if (failedAreaIds.length) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
