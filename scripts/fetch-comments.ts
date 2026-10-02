import { readFile } from 'node:fs/promises';
import { atomicWrite, dataPath, extractComments, options, questIds, readJson, validateRaw, verifyQuestPage } from './pipeline.ts';

async function main() {
  const { questId, refresh, html: htmlPath } = options();
  if (htmlPath && questId === undefined) throw new Error('--html also requires --quest.');
  const ids = questId === undefined ? await questIds() : [questId];
  let failures = 0;
  for (const [index, id] of ids.entries()) {
    const path = dataPath('raw', id);
    try {
      if (!refresh && !htmlPath) {
        try {
          const cached = await readJson(path);
          validateRaw(cached, id);
          console.log(`Quest ${id}: ${cached.comments.length} comments from cache (${cached.fetchedAt}).`);
          continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      const sourceUrl = `https://www.wowhead.com/quest=${id}`;
      let html: string;
      if (htmlPath) html = await readFile(htmlPath, 'utf8');
      else {
        const response = await fetch(sourceUrl, {
          headers: { 'User-Agent': 'WowheadQuestComments/0.1 (+https://github.com/philarmino/wowhead-quest-comments)', 'Accept-Language': 'en' },
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`Wowhead returned HTTP ${response.status}.`);
        html = await response.text();
      }
      verifyQuestPage(html, id);
      const comments = extractComments(html);
      const data = { schemaVersion: 1, questId: id, sourceUrl, fetchedAt: new Date().toISOString(), comments };
      await atomicWrite(path, JSON.stringify(data, null, 2) + '\n');
      console.log(`Quest ${id}: ${comments.length} comments saved.`);
    } catch (error) {
      failures++;
      console.error(`Quest ${id}: ${(error as Error).message} Existing data has been preserved.`);
    }
    if (!htmlPath && index < ids.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(`Fetch complete: ${ids.length - failures}/${ids.length} quests successful; failed: ${failures}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
