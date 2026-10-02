import { resolve } from 'node:path';
import luaparse from 'luaparse';
import { atomicWrite, dataPath, generateLua, isObject, options, questIds, readJson, root, type ProcessedData } from './pipeline.ts';

async function main() {
  const { questId } = options();
  const ids = questId === undefined ? await questIds() : [questId];
  const datasets: ProcessedData[] = [];
  for (const id of ids) {
    try {
      const data = await readJson(dataPath('processed', id));
      if (!isObject(data) || data.schemaVersion !== 1 || data.questId !== id || !Array.isArray(data.comments))
        throw new Error('Processed data is invalid or belongs to a different quest.');
      datasets.push(data as unknown as ProcessedData);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Quest ${id}: ${(error as Error).message}`);
      if (questId === undefined) {
        datasets.push({ schemaVersion: 1, questId: id, sourceUrl: `https://www.wowhead.com/quest=${id}`,
          fetchedAt: '', comments: [] });
        console.log(`Quest ${id}: no processed comments yet; creating an empty database entry.`);
      }
    }
  }
  if (!datasets.length) throw new Error('No processed quest data found.');
  const lua = generateLua(datasets);
  luaparse.parse(lua, { luaVersion: '5.1' });
  const output = resolve(root, 'addon/Data.lua');
  await atomicWrite(output, lua);
  console.log(`${datasets.length} quests written as valid Lua to ${output}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
