import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite, dataPath, extractComments, options, questIds, readJson, root, validateRaw, verifyQuestPage } from './pipeline.ts';
import { fetchQuestHtml, requestGate, WowheadHttpError } from './wowhead-http.ts';
import { areaIds, expansionId, selectAreaQuestIds } from './area-selection.ts';

async function main() {
  const { questId, allAreas, areas, expansion, fullRefresh, maxRequests, delayMs, concurrency, html: htmlPath } = options();
  if (htmlPath && questId === undefined) throw new Error('--html also requires --quest.');
  if ([questId !== undefined, allAreas, areas.length > 0 || expansion !== undefined].filter(Boolean).length > 1)
    throw new Error('Use either --quest, --all-areas, or --area/--expansion.');
  const requestedAreas = areaIds(areas);
  const requestedExpansion = expansion === undefined ? undefined : expansionId(expansion);
  const selection = requestedAreas.length || requestedExpansion !== undefined
    ? await selectAreaQuestIds(requestedAreas, requestedExpansion) : undefined;
  const ids = questId !== undefined ? [questId] : selection?.ids ?? await questIds(allAreas);
  if (selection) console.log(`Selected ${selection.selectedAreas.length} areas and ${ids.length} unique quests.${requestedExpansion !== undefined && !requestedAreas.length ? ` ${selection.unmappedCount} areas have no expansion mapping and were excluded.` : ''}`);

  const missing: number[] = [];
  let cachedCount = 0;
  for (const id of ids) {
    if (!fullRefresh && !htmlPath) {
      try {
        const cached = await readJson(dataPath('raw', id));
        validateRaw(cached, id);
        cachedCount++;
        if (!allAreas && !selection) console.log(`Quest ${id}: ${cached.comments.length} comments from cache (${cached.fetchedAt}).`);
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
        if (!allAreas && !selection) console.log(`Quest ${id}: ${comments.length} comments saved.`);
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
      if ((allAreas || selection) && completed % 100 === 0)
        console.log(`Progress: ${cachedCount + completed}/${ids.length} quests; ${saved} saved, ${cachedCount} cached, ${errors.length} failed.`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  const remaining = ids.length - cachedCount - saved;
  const report = { at: new Date().toISOString(), allAreas, areas: selection?.selectedAreas.map(area => area.id) ?? [],
    expansion: requestedExpansion === undefined ? null : expansion,
    fullRefresh, total: ids.length,
    cached: cachedCount, saved, failed: errors.length, remaining, errors };
  await atomicWrite(resolve(root, 'data', 'wowhead-fetch-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Fetch complete: ${cachedCount + completed}/${ids.length} considered; ${saved} saved, ${cachedCount} cached, ${errors.length} failed, ${remaining} remaining.`);
  if (errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
