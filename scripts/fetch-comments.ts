import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite, dataPath, extractComments, options, questIds, readJson, root, validateRaw, verifyQuestPage } from './pipeline.ts';
import { fetchQuestHtml, requestGate, WowheadHttpError } from './wowhead-http.ts';

async function main() {
  const { questId, allAreas, fullRefresh, maxRequests, delayMs, concurrency, html: htmlPath } = options();
  if (htmlPath && questId === undefined) throw new Error('--html also requires --quest.');
  if (questId !== undefined && allAreas) throw new Error('Use either --quest or --all-areas.');
  const ids = questId === undefined ? await questIds(allAreas) : [questId];

  const missing: number[] = [];
  let cachedCount = 0;
  for (const id of ids) {
    if (!fullRefresh && !htmlPath) {
      try {
        const cached = await readJson(dataPath('raw', id));
        validateRaw(cached, id);
        cachedCount++;
        if (!allAreas) console.log(`Quest ${id}: ${cached.comments.length} comments from cache (${cached.fetchedAt}).`);
        continue;
      } catch { /* Missing or invalid cache: request this quest again. */ }
    }
    missing.push(id);
  }

  const selected = maxRequests === undefined ? missing : missing.slice(0, maxRequests);
  let next = 0, completed = 0, saved = 0, stop = false;
  const takeSlot = requestGate(delayMs);
  const errors: Array<{ id: number; message: string }> = [];
  async function worker() {
    while (!stop && next < selected.length) {
      const id = selected[next++];
      const sourceUrl = `https://www.wowhead.com/quest=${id}`;
      if (!htmlPath) {
        await takeSlot();
        if (stop) break;
      }
      try {
        const html = htmlPath ? await readFile(htmlPath, 'utf8') : await fetchQuestHtml(sourceUrl, fetch, undefined, takeSlot);
        verifyQuestPage(html, id);
        const comments = extractComments(html);
        const data = { schemaVersion: 1, questId: id, sourceUrl, fetchedAt: new Date().toISOString(), comments };
        await atomicWrite(dataPath('raw', id), JSON.stringify(data, null, 2) + '\n');
        saved++;
        if (!allAreas) console.log(`Quest ${id}: ${comments.length} comments saved.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ id, message });
        console.error(`Quest ${id}: ${message} Existing data has been preserved.`);
        if (error instanceof WowheadHttpError && error.status === 403 && !stop) {
          stop = true;
          console.error('HTTP 403 access denied. Stopping this run; cached data is intact.');
        }
      }
      completed++;
      if (allAreas && completed % 100 === 0)
        console.log(`Progress: ${cachedCount + completed}/${ids.length} quests; ${saved} saved, ${cachedCount} cached, ${errors.length} failed.`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  const remaining = ids.length - cachedCount - saved;
  const report = { at: new Date().toISOString(), allAreas, fullRefresh, total: ids.length,
    cached: cachedCount, saved, failed: errors.length, remaining, errors };
  await atomicWrite(resolve(root, 'data', 'wowhead-fetch-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Fetch complete: ${cachedCount + completed}/${ids.length} considered; ${saved} saved, ${cachedCount} cached, ${errors.length} failed, ${remaining} remaining.`);
  if (errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
