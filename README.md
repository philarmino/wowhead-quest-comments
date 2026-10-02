# Wowhead Quest Comments

A Retail addon with locally bundled quest comments. Click the minimap comment icon to open comments for the quest with the active waypoint (supertracking). The window can be moved and resized from its bottom-right corner. Window size, position, and minimap button position are saved.

Author names use smaller, muted text so the comment body remains the focus. The original posting date appears beside the author in yellow, one font size smaller, using `YYYY-MM-DD`. A thin line separates the window header from the comments. Ratings are shown as signed numbers, such as `+84` or `-2`.

## Installation

Copy the contents of `addon/` into `_retail_/Interface/AddOns/WowheadQuestComments/`. The folder name must match the TOC filename. Run `/reload` after updating the addon.

- `/wqc`: toggle comments for the active quest.
- `/wqc preview`: show the lowest-ID quest with comments in the installed database.
- `/wqc 13943`, `/wqc quest 13943`, or `/wqc preview 13943`: open comments for that quest directly.
- `/wqc debug 13943`: print the loaded Core version, data build ID, counts of numeric and textual quest keys, the matching database entry, and the active quest in chat.

Diagnostics use the same database as the display. A missing database is shown as a loading error. Preview and specific quest IDs use the same lookup, supporting both numeric and textual keys.

## Generate comments

Requires Node.js 22 or later.

```bash
npm ci
npm run build:data
```

The default run processes **165 Ashenvale quest IDs from `scripts/quests-eschental.json`**, plus the previously included quest 14435. The list is the supplied Blizzard response for Ashenvale (`area/331`); its German area and quest names are preserved as source data.

1. `npm run fetch`: load each English Retail page and extract the embedded `lv_comments0` JSON array. Store raw data with the source URL and fetch timestamp in `data/raw/{QuestID}.json`. Reuse valid cached data; fetch new pages sequentially with a one-second delay between requests.
2. `npm run process`: exclude deleted, outdated, indented, and duplicate comments. Select up to five top-rated main comments, without replies. Store results in `data/processed/{QuestID}.json`.
3. `npm run generate`: combine the available processed data, add empty entries for missing quest IDs, validate Lua 5.1 syntax, and atomically replace `addon/Data.lua`. The generated data includes a deterministic build ID for diagnostics.

A failed fetch does not stop the remaining quests or replace their existing cache files. IDs without processed data receive an empty comment list. The addon displays “No comments have been saved for this quest yet.” for these entries. Running the pipeline again retries quests without raw data.

The scripts run outside WoW. Copy the generated `Data.lua` into the installed addon folder and run `/reload`.

## Cache and options

Valid raw cache files are reused without another network request. Process a single quest explicitly, or omit `--quest` to use the full list:

```bash
npm run fetch -- --quest 14435 --refresh
npm run process -- --quest 14435 --limit 5
npm run generate -- --quest 14435
```

`generate --quest <ID>` writes only that quest to `Data.lua`. Use `npm run generate` without `--quest` for the full database.

You can import a previously saved complete Wowhead HTML page:

```bash
npm run fetch -- --quest 14435 --html /path/to/quest.html
```

The canonical URL must match the requested Retail quest. HTTP errors, block pages, and unknown data formats are reported per quest; requests are not retried automatically within the same run. Cache files and `node_modules/` are excluded from Git.

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
