import { atomicWrite, dataPath, options, processComments, readJson, validateRaw } from './pipeline.ts';

async function main() {
  const { questId, limit } = options();
  const raw = await readJson(dataPath('raw', questId));
  validateRaw(raw, questId);
  const processed = processComments(raw, limit);
  if (!processed.comments.length) throw new Error('Keine geeigneten Kommentare. Bestehende Ausgabe bleibt erhalten.');
  await atomicWrite(dataPath('processed', questId), JSON.stringify(processed, null, 2) + '\n');
  console.log(`Quest ${questId}: ${processed.comments.length} von ${raw.comments.length} Kommentaren ausgewählt.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
