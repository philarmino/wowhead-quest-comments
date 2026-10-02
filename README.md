# Wowhead Quest Comments

A Retail addon with locally bundled quest comments. Click the minimap comment icon to open comments for the quest with the active waypoint (supertracking). The window can be moved and resized from its bottom-right corner. Window size, position, and minimap button position are saved.

Author names use smaller, muted text so the comment body remains the focus. The original posting date appears beside the author in yellow, one font size smaller, using `YYYY-MM-DD`. A thin line separates the window header from the comments. Ratings are shown as signed numbers, such as `+84` or `-2`.

See [CHANGELOG.md](CHANGELOG.md) for release history, data coverage, fixes, and verification results; [DESIGN.md](DESIGN.md) for UI decisions; and [RESUME.md](RESUME.md) for the development handoff and remaining work.

## Installation

Copy the contents of `addon/` into `_retail_/Interface/AddOns/WowheadQuestComments/`. The folder name must match the TOC filename. Run `/reload` after updating the addon.

- `/wqc`: toggle comments for the active quest.
- `/wqc preview`: show the lowest-ID quest with comments in the installed database.
- `/wqc 13943`, `/wqc quest 13943`, or `/wqc preview 13943`: open comments for that quest directly.
- `/wqc debug 13943`: print the loaded Core version, data build ID, counts of numeric and textual quest keys, the matching database entry, and the active quest in chat.

Diagnostics use the same database as the display. A missing database is shown as a loading error. Preview and specific quest IDs use the same lookup, supporting both numeric and textual keys.

## Generate comments

Requires Node.js 22 or later.

### Refresh quest IDs from Battle.net

Create a Battle.net API client in the [developer portal](https://community.developer.battle.net/). Copy `.env.example` to `.env` and replace the placeholders with its client ID and client secret. The local `.env` file is ignored by Git. Then run:

```bash
cp .env.example .env
# Edit .env with your client ID and secret before the next command.
npm run fetch:quests
```

The command uses client credentials to fetch a token, then reads the EU Retail quest area index and every listed area in German. Validated full responses are cached in `data/quest-areas/{AreaID}.json`. A deduplicated, sorted list of all quest IDs is written to `scripts/quest-ids.json` when every area succeeds. If any area fails, a partial list with the failed area IDs is saved under `data/quest-ids.partial.json` instead, leaving the last complete list intact. Rerunning the command reuses valid cached area responses and retries missing areas; add `--refresh` to fetch every area again. Use `npm run fetch:quests -- --area 1` for a single area or `npm run fetch:quests -- --list-areas` to print the area index. Credentials and tokens are never written to disk.

This step only calls Battle.net. It does not fetch Wowhead comments or modify `addon/Data.lua`. The default comment pipeline still uses the checked-in Ashenvale source `scripts/quests-eschental.json`; pass `--all-areas` to the fetch or process command to use the new ID list.

```bash
npm ci
npm run build:data
```

The default run processes **165 Ashenvale quest IDs from `scripts/quests-eschental.json`**, plus the previously included quest 14435. The list is the supplied Blizzard response for Ashenvale (`area/331`); its German area and quest names are preserved as source data.

1. `npm run fetch`: load each English Retail page and extract the embedded `lv_comments0` JSON array. Store raw data with the source URL and fetch timestamp in `data/raw/{QuestID}.json`. Reuse valid cached data. New requests use one worker and a shared two-second minimum spacing by default. HTTP 403 stops the batch immediately; 429 and server errors get up to two retries.
2. `npm run process`: exclude deleted, outdated, indented, and duplicate comments. Select up to five top-rated main comments, without replies. Store results in `data/processed/{QuestID}.json`.
3. `npm run generate`: combine the available processed data, add empty entries for missing quest IDs, validate Lua 5.1 syntax, and atomically replace `addon/Data.lua`. The generated data includes a deterministic build ID for diagnostics.

A failed fetch does not replace existing cache files. An HTTP 403 stops the current run; other failures are reported and the batch continues. IDs without processed data receive an empty comment list. The addon displays “No comments have been saved for this quest yet.” for these entries. Running the pipeline again retries quests without raw data.

The scripts run outside WoW. Copy the generated `Data.lua` into the installed addon folder and run `/reload`.

## Cache and options

Valid raw cache files are reused without another network request. Process a single quest explicitly, or omit `--quest` to use the full list:

```bash
npm run fetch -- --quest 14435 --full-refresh
npm run process -- --quest 14435 --limit 5
npm run generate -- --quest 14435
```

To fetch comments for the 22,207 IDs collected across all areas, run `npm run fetch -- --all-areas`. The command only requests IDs without a valid raw cache. It can be stopped and restarted; completed quests are skipped. Add `--max-requests 100` for a bounded batch. `--concurrency 8` permits eight simultaneous workers, but every worker shares the same request gate; `--delay-ms 5000` changes the default two-second minimum gap between new requests. Only `--full-refresh` requests already cached IDs again. A run report is written to `data/wowhead-fetch-report.json`. `npm run process -- --all-areas` processes the available all-area raw caches and skips uncached IDs. The default addon generator still builds the original 166-quest database; it does not automatically bundle all 22,207 IDs.

`generate --quest <ID>` writes only that quest to `Data.lua`. Use `npm run generate` without `--quest` for the full database.

You can import a previously saved complete Wowhead HTML page:

```bash
npm run fetch -- --quest 14435 --html /path/to/quest.html
```

The canonical URL must match the requested Retail quest. HTTP errors, block pages, and unknown data formats are reported per quest. HTTP 403 stops the run so a denied batch does not keep requesting more pages. A slower request rate may reduce rate-triggered blocks, but it cannot resolve other access restrictions. Cache files and `node_modules/` are excluded from Git.

## Selection and text formatting

Comments are selected by rating, with comment ID as the tie-breaker. A high rating does not guarantee that a comment is current or useful. Full text, paragraphs, coordinates, and labeled links are preserved. Common Wowhead formatting is converted to plain text; unsupported special tags may remain visible.

The output includes the author, comment ID, date, and direct source link. Numeric author names are preserved as provided by Wowhead. No game version is inferred from the date. Comments come from HTML pages rather than a documented public comment API, so changes to the page format may require code updates.

## Checks

```bash
npm run check
npm test
```

The tests cover extraction without executing remote JavaScript, quest matching, text formatting, selection, deduplication, and Lua/WoW escaping.

With Lua 5.1 installed, run:

```bash
npm run test:addon
```

This loads the actual files listed in the TOC and checks comment text and authors for all generated quests, preview, explicit IDs, minimap clicks, numeric/text keys, and diagnostics. WoW widgets are stubbed; visual layout and actual WoW API behavior still require an in-game check.
