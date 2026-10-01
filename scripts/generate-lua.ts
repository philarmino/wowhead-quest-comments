import { resolve } from 'node:path';
import luaparse from 'luaparse';
import { atomicWrite, dataPath, generateLua, isObject, options, readJson, root, type ProcessedData } from './pipeline.ts';

async function main() {
  const { questId } = options();
  const data = await readJson(dataPath('processed', questId));
  if (!isObject(data) || data.schemaVersion !== 1 || data.questId !== questId ||
      !Array.isArray(data.comments) || !data.comments.length)
    throw new Error('Aufbereitete Daten fehlen, sind leer oder gehören zu einer anderen Quest.');
  const lua = generateLua(data as unknown as ProcessedData);
  luaparse.parse(lua, { luaVersion: '5.1' });
  const output = resolve(root, 'addon/Data.lua');
  await atomicWrite(output, lua);
  console.log(`Quest ${questId}: ${data.comments.length} Kommentare als gültiges Lua nach ${output} geschrieben.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
