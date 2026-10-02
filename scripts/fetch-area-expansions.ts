import { decodeHTML } from 'entities';
import { resolve } from 'node:path';
import { areaCatalog, expansions } from './area-selection.ts';
import { atomicWrite, isObject, readJson, root } from './pipeline.ts';

const sourceUrl = 'https://www.wowhead.com/zones';

async function main() {
  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Wowhead zones request failed: HTTP ${response.status}.`);
  const html = await response.text();
  const match = html.match(/<script\b[^>]*\bid="data\.page\.listPage\.listviews"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Wowhead zones page has no listview data. Existing catalog was preserved.');
  const views: unknown = JSON.parse(decodeHTML(match[1]));
  if (!Array.isArray(views)) throw new Error('Invalid Wowhead zones listview. Existing catalog was preserved.');
  const zones = views.find(view => isObject(view) && view.id === 'zones');
  if (!isObject(zones) || !Array.isArray(zones.data))
    throw new Error('Wowhead zones list is missing. Existing catalog was preserved.');

  const index = await readJson(resolve(root, 'data/quest-areas/index.json'));
  if (!Array.isArray(index) || !index.every(area => isObject(area) &&
      Number.isSafeInteger(area.id) && (area.id as number) > 0))
    throw new Error('Invalid Blizzard area index. Run npm run fetch:quests first.');
  const knownIds = new Set(index.map(area => area.id as number));
  const entries = new Map<number, number>();
  for (const zone of zones.data) {
    if (!isObject(zone) || !Number.isSafeInteger(zone.id) || !knownIds.has(zone.id as number)) continue;
    if (!Number.isInteger(zone.expansion) || (zone.expansion as number) < 0 ||
        (zone.expansion as number) >= expansions.length)
      throw new Error(`Invalid expansion for area ${zone.id}. Existing catalog was preserved.`);
    const previous = entries.get(zone.id as number);
    if (previous !== undefined && previous !== zone.expansion)
      throw new Error(`Conflicting expansion for area ${zone.id}. Existing catalog was preserved.`);
    entries.set(zone.id as number, zone.expansion as number);
  }
  if (entries.size < 300) throw new Error('Wowhead zones list is unexpectedly incomplete. Existing catalog was preserved.');
  const catalog = { schemaVersion: 1, sourceUrl,
    areaExpansionIds: Object.fromEntries([...entries].sort((a, b) => a[0] - b[0])) };
  await atomicWrite(resolve(root, 'scripts/area-expansions.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const loaded = await areaCatalog();
  console.log(`Mapped ${entries.size}/${loaded.areas.length} Blizzard areas to their Wowhead zone expansion; ${loaded.unmapped.length} remain unknown.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
