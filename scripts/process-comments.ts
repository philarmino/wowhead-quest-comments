import { atomicWrite, dataPath, options, processComments, questIds, readJson, validateRaw } from './pipeline.ts';

async function main() {
  const { questId, limit } = options();
  const ids = questId === undefined ? await questIds() : [questId];
  let available = 0;
  for (const id of ids) {
    try {
      const raw = await readJson(dataPath('raw', id));
      validateRaw(raw, id);
      const processed = processComments(raw, limit);
      await atomicWrite(dataPath('processed', id), JSON.stringify(processed, null, 2) + '\n');
      console.log(`Quest ${id}: ${processed.comments.length} of ${raw.comments.length} comments selected.`);
      available++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') console.error(`Quest ${id}: no raw data; existing processed data has been preserved.`);
      else console.error(`Quest ${id}: ${(error as Error).message} Existing processed data has been preserved.`);
    }
  }
  if (!available) throw new Error('No raw data found to process.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
