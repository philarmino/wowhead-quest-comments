import { atomicWrite, cachedQuestIds, dataPath, isNotFoundRaw, options, processComments, questIds, readJson, validateRaw } from './pipeline.ts';
import { areaIds, expansionId, selectAreaQuestIds } from './area-selection.ts';

function progressInterval(total: number): number {
  if (total <= 25) return 1;
  if (total <= 200) return 25;
  return 100;
}

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
  const ids = questId !== undefined ? [questId]
    : selection ? selection.ids.filter(id => availableRaw.has(id))
    : allAreas ? (await questIds()).filter(id => availableRaw.has(id))
    : cached;
  const batchMode = ids.length > 25;
  const scope = questId !== undefined ? ` (quest ${questId})`
    : selection ? ' (area/expansion filter)'
    : allAreas ? ' (full quest list ∩ local raw)'
    : ' (all local raw files)';
  console.log(`Processing ${ids.length} quests with raw cache${scope}, keeping up to ${limit} comments each.`);

  let available = 0;
  let withComments = 0;
  let selectedComments = 0;
  let skippedNotFound = 0;
  let failed = 0;
  const interval = progressInterval(ids.length);
  const startedAt = Date.now();

  for (const id of ids) {
    try {
      const raw = await readJson(dataPath('raw', id));
      if (isNotFoundRaw(raw, id)) {
        skippedNotFound++;
        if (!batchMode) console.log(`Quest ${id}: skipped; missing on Wowhead.`);
      } else {
        validateRaw(raw, id);
        const processed = processComments(raw, limit);
        await atomicWrite(dataPath('processed', id), JSON.stringify(processed, null, 2) + '\n');
        if (!batchMode) console.log(`Quest ${id}: ${processed.comments.length} of ${raw.comments.length} comments selected.`);
        available++;
        if (processed.comments.length) {
          withComments++;
          selectedComments += processed.comments.length;
        }
      }
    } catch (error) {
      failed++;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') console.error(`Quest ${id}: no raw data; existing processed data has been preserved.`);
      else console.error(`Quest ${id}: ${(error as Error).message} Existing processed data has been preserved.`);
    }
    const done = available + skippedNotFound + failed;
    if (batchMode && ids.length && (done % interval === 0 || done === ids.length)) {
      console.log(`Progress: ${done}/${ids.length} processed (${withComments} with comments, ${skippedNotFound} not found, ${failed} failed).`);
    }
  }
  if (!available) throw new Error('No raw data found to process.');
  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  console.log(
    `Processed ${available}/${ids.length} quests in ${elapsedSec}s: ` +
    `${withComments} with ${selectedComments} selected comments, ${available - withComments} empty` +
    `${skippedNotFound > 0 ? `, ${skippedNotFound} not found on Wowhead` : ''}` +
    `, ${failed} failed.`,
  );
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
