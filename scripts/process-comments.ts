import { atomicWrite, cachedQuestIds, dataPath, options, processComments, questIds, readJson, validateRaw } from './pipeline.ts';
import { areaIds, expansionId, selectAreaQuestIds } from './area-selection.ts';

async function main() {
  const { questId, limit, allAreas, areas, expansion } = options();
  if ([questId !== undefined, allAreas, areas.length > 0 || expansion !== undefined].filter(Boolean).length > 1)
    throw new Error('Use either --quest, --all-areas, or --area/--expansion.');
  const requestedAreas = areaIds(areas);
  const requestedExpansion = expansion === undefined ? undefined : expansionId(expansion);
  const selection = requestedAreas.length || requestedExpansion !== undefined
    ? await selectAreaQuestIds(requestedAreas, requestedExpansion) : undefined;
  const cached = await cachedQuestIds('raw');
  const availableRaw = new Set(cached);
  const ids = questId !== undefined ? [questId] : allAreas
    ? (await questIds(true)).filter(id => availableRaw.has(id))
    : selection ? selection.ids.filter(id => availableRaw.has(id)) : cached;
  let available = 0;
  for (const id of ids) {
    try {
      const raw = await readJson(dataPath('raw', id));
      validateRaw(raw, id);
      const processed = processComments(raw, limit);
      await atomicWrite(dataPath('processed', id), JSON.stringify(processed, null, 2) + '\n');
      if (!allAreas && !selection) console.log(`Quest ${id}: ${processed.comments.length} of ${raw.comments.length} comments selected.`);
      available++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') console.error(`Quest ${id}: no raw data; existing processed data has been preserved.`);
      else console.error(`Quest ${id}: ${(error as Error).message} Existing processed data has been preserved.`);
    }
  }
  if (!available) throw new Error('No raw data found to process.');
  console.log(`Processed ${available}/${ids.length} quests with available raw data.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
