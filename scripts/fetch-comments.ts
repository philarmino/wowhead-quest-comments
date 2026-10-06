import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite, dataPath, extractComments, options, questIds, readJson, root, validateRaw, verifyQuestPage } from './pipeline.ts';
import { fetchQuestHtml, requestGate, WowheadHttpError } from './wowhead-http.ts';
import { areaIds, expansionId, selectAreaQuestIds } from './area-selection.ts';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function progressInterval(total: number): number {
  if (total <= 25) return 1;
  if (total <= 200) return 10;
  return 25;
}

async function main() {
  const { questId, allAreas, areas, expansion, fullRefresh, maxRequests, delayMs, concurrency, html: htmlPath } = options();
  if (htmlPath && questId === undefined) throw new Error('--html also requires --quest.');
  if ([questId !== undefined, allAreas, areas.length > 0 || expansion !== undefined].filter(Boolean).length > 1)
    throw new Error('Use either --quest, --all-areas, or --area/--expansion.');
  const requestedAreas = areaIds(areas);
  const requestedExpansion = expansion === undefined ? undefined : expansionId(expansion);
  const selection = requestedAreas.length || requestedExpansion !== undefined
    ? await selectAreaQuestIds(requestedAreas, requestedExpansion) : undefined;
  const ids = questId !== undefined ? [questId] : selection?.ids ?? await questIds();
  const batchMode = questId === undefined;
  if (selection) {
    const expansionNote = requestedExpansion !== undefined && !requestedAreas.length
      ? ` ${selection.unmappedCount} areas have no expansion mapping and were excluded.`
      : '';
    console.log(`Selected ${selection.selectedAreas.length} areas and ${ids.length} unique quests.${expansionNote}`);
  } else if (questId !== undefined) {
    console.log(`Single-quest fetch: ${questId}.`);
  } else {
    console.log(`Full quest list: ${ids.length} unique quests from scripts/quest-ids.json.`);
  }

  const missing: number[] = [];
  let cachedCount = 0;
  for (const id of ids) {
    if (!fullRefresh && !htmlPath) {
      try {
        const cached = await readJson(dataPath('raw', id));
        validateRaw(cached, id);
        cachedCount++;
        if (!batchMode) console.log(`Quest ${id}: ${cached.comments.length} comments from cache (${cached.fetchedAt}).`);
        continue;
      } catch { /* Missing or invalid cache: request this quest again. */ }
    }
    missing.push(id);
  }

  const selected = maxRequests === undefined ? missing : missing.slice(0, maxRequests);
  const deferred = missing.length - selected.length;
  const workers = Math.min(concurrency, selected.length || 1);
  const etaMs = selected.length === 0 || htmlPath ? 0 : selected.length * delayMs;
  console.log(
    `Plan: ${cachedCount} cached, ${missing.length} missing` +
    `${maxRequests !== undefined ? `, fetching ${selected.length} this run (--max-requests ${maxRequests})` : `, fetching ${selected.length}`}` +
    `${deferred > 0 ? `, ${deferred} deferred` : ''}` +
    `${fullRefresh ? ', full refresh' : ''}.`,
  );
  if (selected.length) {
    console.log(
      `Requesting with ${workers} worker${workers === 1 ? '' : 's'}, ${delayMs}ms spacing` +
      `${htmlPath ? ' (local HTML)' : etaMs > 0 ? `, ~${formatDuration(etaMs)} minimum` : ''}.`,
    );
  } else {
    console.log('Nothing to fetch; all selected quests are already cached.');
  }

  let next = 0, completed = 0, saved = 0, stop = false;
  const startedAt = Date.now();
  const takeSlot = requestGate(delayMs);
  const errors: Array<{ id: number; message: string }> = [];
  const interval = progressInterval(selected.length);
  const verboseQuestLogs = !batchMode;

  function logProgress(force = false) {
    if (!selected.length) return;
    if (!force && completed % interval !== 0 && completed !== selected.length) return;
    const elapsed = Date.now() - startedAt;
    const rate = completed > 0 ? elapsed / completed : 0;
    const remainingWork = selected.length - completed;
    const eta = rate > 0 && remainingWork > 0 ? `, ETA ${formatDuration(rate * remainingWork)}` : '';
    console.log(
      `Progress: ${completed}/${selected.length} this run` +
      ` (${saved} saved, ${errors.length} failed, ${cachedCount} already cached)` +
      `; elapsed ${formatDuration(elapsed)}${eta}.`,
    );
  }

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
        if (verboseQuestLogs) console.log(`Quest ${id}: ${comments.length} comments saved.`);
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
      logProgress();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  if (selected.length && completed > 0 && completed % interval !== 0) logProgress(true);

  const remaining = ids.length - cachedCount - saved;
  const report = {
    at: new Date().toISOString(),
    allAreas: allAreas || (!selection && questId === undefined),
    areas: selection?.selectedAreas.map(area => area.id) ?? [],
    expansion: requestedExpansion === undefined ? null : expansion,
    fullRefresh,
    maxRequests: maxRequests ?? null,
    delayMs,
    concurrency: workers,
    total: ids.length,
    cached: cachedCount,
    attempted: completed,
    saved,
    failed: errors.length,
    deferred,
    remaining,
    stoppedOn403: stop,
    elapsedMs: Date.now() - startedAt,
    errors,
  };
  await atomicWrite(resolve(root, 'data', 'wowhead-fetch-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Fetch complete in ${formatDuration(report.elapsedMs)}: ` +
    `${saved} saved, ${cachedCount} were cached, ${errors.length} failed` +
    `${deferred > 0 ? `, ${deferred} deferred by --max-requests` : ''}` +
    `, ${remaining} still missing` +
    `${stop ? ' (stopped on 403)' : ''}.`,
  );
  if (remaining > 0 && !stop) {
    console.log(`Resume with the same command; cached quests are skipped${maxRequests !== undefined ? ` (next batch up to ${maxRequests})` : ''}.`);
  }
  if (errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
