import { readFile } from 'node:fs/promises';
import { atomicWrite, dataPath, extractComments, options, readJson, validateRaw, verifyQuestPage } from './pipeline.ts';

async function main() {
  const { questId, refresh, html: htmlPath } = options();
  const path = dataPath('raw', questId);
  if (!refresh && !htmlPath) {
    try {
      const cached = await readJson(path);
      validateRaw(cached, questId);
      console.log(`Quest ${questId}: ${cached.comments.length} Kommentare aus Cache (${cached.fetchedAt}).`);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const sourceUrl = `https://www.wowhead.com/quest=${questId}`;
  let html: string;
  if (htmlPath) html = await readFile(htmlPath, 'utf8');
  else {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'WowheadQuestComments/0.1 (+https://github.com/philarmino/wowhead-quest-comments)', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Wowhead antwortet mit HTTP ${response.status}. Kein Cache ersetzt.`);
    html = await response.text();
  }
  verifyQuestPage(html, questId);
  const comments = extractComments(html);
  if (!comments.length) throw new Error('Keine Kommentare gefunden. Bestehende Daten bleiben erhalten.');
  const data = { schemaVersion: 1, questId, sourceUrl, fetchedAt: new Date().toISOString(), comments };
  await atomicWrite(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`Quest ${questId}: ${comments.length} Hauptkommentare gespeichert in ${path}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
