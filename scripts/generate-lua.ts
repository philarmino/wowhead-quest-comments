import { resolve } from 'node:path';
import luaparse from 'luaparse';
import { atomicWrite, cachedQuestIds, dataPath, generateLua, isObject, options, readJson, root, type ProcessedData } from './pipeline.ts';

async function main() {
  const { questId, allAreas, areas, expansion } = options();
  if (allAreas || areas.length || expansion !== undefined)
    throw new Error('generate supports --quest only; without it, all locally processed quests are included.');
  const ids = questId === undefined ? await cachedQuestIds('processed') : [questId];
  console.log(`Generating Lua for ${ids.length} quest IDs` +
    `${questId !== undefined ? ` (quest ${questId} only)` : ' (all local processed caches)'}.`);
  const datasets: ProcessedData[] = [];
  let withComments = 0;
  let commentCount = 0;
  for (const id of ids) {
    try {
      const data = await readJson(dataPath('processed', id));
      if (!isObject(data) || data.schemaVersion !== 1 || data.questId !== id || !Array.isArray(data.comments))
        throw new Error('Processed data is invalid or belongs to a different quest.');
      const processed = data as unknown as ProcessedData;
      datasets.push(processed);
      if (processed.comments.length) {
        withComments++;
        commentCount += processed.comments.length;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Quest ${id}: ${(error as Error).message}`);
      if (questId !== undefined) throw new Error(`Quest ${questId}: no processed data found.`);
    }
  }
  if (!datasets.length) throw new Error('No processed quest data found.');
  const lua = generateLua(datasets);
  luaparse.parse(lua, { luaVersion: '5.1' });
  const output = resolve(root, 'addon/Data.lua');
  await atomicWrite(output, lua);
  console.log(
    `${datasets.length} quests written as valid Lua to ${output}` +
    ` (${withComments} with ${commentCount} comments, ${datasets.length - withComments} empty).`,
  );
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
