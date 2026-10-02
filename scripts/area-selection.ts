import { resolve } from 'node:path';
import { readJson, root, isObject } from './pipeline.ts';
import { validateQuestArea } from './blizzard-api.ts';

export const expansions = [
  'classic', 'burning-crusade', 'wrath', 'cataclysm', 'mists-of-pandaria',
  'warlords-of-draenor', 'legion', 'battle-for-azeroth', 'shadowlands',
  'dragonflight', 'the-war-within', 'midnight',
] as const;

const aliases: Record<string, number> = {
  vanilla: 0, classic: 0, tbc: 1, 'burning-crusade': 1,
  wotlk: 2, wrath: 2, cata: 3, cataclysm: 3,
  mop: 4, 'mists-of-pandaria': 4, wod: 5, 'warlords-of-draenor': 5,
  legion: 6, bfa: 7, 'battle-for-azeroth': 7,
  shadowlands: 8, dragonflight: 9, tww: 10, 'the-war-within': 10,
  midnight: 11,
};

export function expansionId(value: string): number {
  const id = aliases[value.trim().toLowerCase().replace(/[\s_]+/g, '-')];
  if (id === undefined) throw new Error(`Unknown expansion "${value}". Use: ${expansions.join(', ')}.`);
  return id;
}

export function areaIds(values: string[]): number[] {
  const ids = values.flatMap(value => value.split(',')).map(value => Number(value.trim()));
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0))
    throw new Error('--area requires positive area IDs (repeat it or separate IDs with commas).');
  return [...new Set(ids)].sort((a, b) => a - b);
}

interface AreaIndexEntry { id: number; name: string | null }
interface AreaCatalog {
  areas: AreaIndexEntry[];
  expansionByArea: Map<number, number>;
  unmapped: AreaIndexEntry[];
}

export async function areaCatalog(): Promise<AreaCatalog> {
  const index = await readJson(resolve(root, 'data/quest-areas/index.json'));
  const mapping = await readJson(resolve(root, 'scripts/area-expansions.json'));
  if (!Array.isArray(index) || !index.every(area => isObject(area) &&
      Number.isSafeInteger(area.id) && (area.id as number) > 0 &&
      (area.name === null || typeof area.name === 'string')) ||
      !isObject(mapping) || mapping.schemaVersion !== 1 ||
      !isObject(mapping.areaExpansionIds))
    throw new Error('Invalid area index or expansion catalog. Run npm run fetch:quests to refresh the area index.');
  const areas = index as AreaIndexEntry[];
  const expansionByArea = new Map<number, number>();
  for (const [key, value] of Object.entries(mapping.areaExpansionIds)) {
    const id = Number(key);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(value) ||
        (value as number) < 0 || (value as number) >= expansions.length)
      throw new Error('Invalid area expansion catalog entry.');
    expansionByArea.set(id, value as number);
  }
  return { areas, expansionByArea,
    unmapped: areas.filter(area => !expansionByArea.has(area.id)) };
}

export async function selectAreaQuestIds(requestedAreas: number[], requestedExpansion?: number):
  Promise<{ ids: number[]; selectedAreas: AreaIndexEntry[]; unmappedCount: number }> {
  const catalog = await areaCatalog();
  const known = new Map(catalog.areas.map(area => [area.id, area]));
  for (const id of requestedAreas)
    if (!known.has(id)) throw new Error(`Area ${id} is not in data/quest-areas/index.json.`);
  const selectedAreas = requestedAreas.length
    ? requestedAreas.map(id => known.get(id)!)
    : catalog.areas.filter(area => catalog.expansionByArea.get(area.id) === requestedExpansion);
  if (requestedExpansion !== undefined) {
    for (const area of selectedAreas) {
      const actual = catalog.expansionByArea.get(area.id);
      if (actual !== requestedExpansion)
        throw new Error(`Area ${area.id} (${area.name ?? 'unnamed'}) has ${actual === undefined ? 'no known expansion' : expansions[actual]}; requested ${expansions[requestedExpansion]}.`);
    }
  }
  if (!selectedAreas.length) throw new Error('No areas match this expansion.');
  const ids = new Set<number>();
  for (const area of selectedAreas) {
    let data: unknown;
    try { data = await readJson(resolve(root, 'data/quest-areas', `${area.id}.json`)); }
    catch { throw new Error(`Area ${area.id} is not cached. Run npm run fetch:quests -- --area ${area.id}.`); }
    validateQuestArea(data, area.id);
    for (const quest of data.quests) ids.add(quest.id);
  }
  return { ids: [...ids].sort((a, b) => a - b), selectedAreas,
    unmappedCount: catalog.unmapped.length };
}
