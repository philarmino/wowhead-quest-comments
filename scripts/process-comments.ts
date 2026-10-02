import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite, dataPath, options, processComments, questIds, readJson, root, validateRaw } from './pipeline.ts';

async function main() {
  const { questId, limit, allAreas } = options();
  let ids = questId === undefined ? await questIds(allAreas) : [questId];
  if (allAreas && questId === undefined) {
    const available = new Set((await readdir(resolve(root, 'data', 'raw')))
      .filter(name => /^\d+\.json$/.test(name)).map(name => Number(name.slice(0, -5))));
    ids = ids.filter(id => available.has(id));
  }
  let available = 0;
  for (const id of ids) {
    try {
      const raw = await readJson(dataPath('raw', id));
      validateRaw(raw, id);
      const processed = processComments(raw, limit);
      await atomicWrite(dataPath('processed', id), JSON.stringify(processed, null, 2) + '\n');
      if (!allAreas) console.log(`Quest ${id}: ${processed.comments.length} of ${raw.comments.length} comments selected.`);
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
