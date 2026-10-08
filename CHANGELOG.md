# Changelog

## Unreleased

## 0.2.7 — 2026-10-08

- Fix "Couldn't open Media/MinimapIcon.tga" error: textures are no longer listed as load files in the TOC.
- Minimap: button uses LibDBIcon geometry so the icon sits inside the tracking ring, and shows the dedicated MinimapIcon.
- Header divider moved up directly below the logo; comments start higher.
- Right-clicking the QuestID or clicking the "Wowhead" footer button opens a Ctrl+A/Ctrl+C copy popup (`CopyToClipboard` is protected for addons).
- Regenerated `Data.lua` with the latest fetched comments.

## 0.2.6 — 2026-10-08

- Rebrand the visible UI to **Community Quest Comments** (addon folder and SavedVariables stay `WowheadQuestComments`).
- Minimap: smaller round button with WindowLogo, standard tracking border/background, brighter hover, updated tooltip title.
- Title uses body-like `GameFontHighlight` sizing; context line is `QuestID <n>` only with a clickable Wowhead link (clipboard or copy popup).
- Stronger header divider and uniform comment row spacing (`ROW_TOP_PAD`) between dividers and the next author line.

## 0.2.5 — 2026-10-08

- Brand the in-game UI with shipped TGA media: custom minimap icon (no Blizzard tracking chrome), WindowLogo in the comment-window header beside the title “Wowhead Quest Comments”, and slightly warmer gold border/divider colors matched to the logo.
- Fix `Data.lua:1 constant table overflow` in game: the generator splits the database into chunk functions so no Lua 5.1 function exceeds the 262,143-constant limit.
- Shrink `Data.lua` from 50 MB to 23 MB and in-game memory from about 58 MB to 35 MB: comments are stored as `{ author, score, "YYYY-MM-DD", text }` without the unused `id` and `sourceUrl`, repeated long texts are stored once, and indentation is dropped. `Core.lua` reads the new layout, so `Core.lua` and `Data.lua` must be updated together.
- Clean up comment text: flatten `[table]`/`[tr]`/`[td]` markup, render `[li]` as bullets, strip `[pre]`, `[spoiler]`, `[ins]`, `[del]` and similar tags, resolve more entity tags (`zone`, `currency`, `faction`, `storyline`, …), collapse tab and non-breaking-space runs, and shorten Wowhead links to `wowhead.com/quest=123`.
- Mark Wowhead HTTP 404 responses as permanently missing in the raw cache (`notFound: true`) so later batches can move past deleted or never-published quest IDs. Process skips those markers; `--full-refresh` can retry them.
- Accept `all` as the `scripts/fetch-loop.sh` target to loop over the full quest list, with its own lock, PID, and log file (`data/logs/fetch-all.log`).
- Explain the missing `--` when npm forwards a bare value such as `npm run fetch --max-requests 99`.
- Refresh the open comment window when a different quest becomes active (`SUPER_TRACKING_CHANGED`), so clicking a new quest loads its comments without reopening the window. A closed window stays closed.
- Make `scripts/quest-ids.json` (22,207 IDs across all Battle.net quest areas) the default fetch source. Remove the Ashenvale-only `scripts/quests-eschental.json` list and stop generating empty placeholder entries for unfetched IDs.
- Improve fetch/process/generate logging: start plan, bounded progress with ETA, and compact summaries instead of one line per quest on large runs.
- Keep area/expansion filters and `--max-requests` for bounded Wowhead batches. Valid raw caches are skipped unless `--full-refresh` is specified. HTTP 403 stops the run so cached data stays intact.
- Add `scripts/fetch-loop.sh <expansion>` for unattended bounded fetches: run a batch, wait 5 minutes (configurable), repeat until that expansion’s remaining count is 0. Stop early when a run saves nothing and every missing quest was already attempted, so permanent failures are not retried forever. HTTP 403 still waits and retries.

## 0.2.4 — 2026-10-02

- Add a thin divider between the window header and the first comment.
- Show the posting date directly beside the author in yellow, one font size smaller than the author name.
- Display dates as `YYYY-MM-DD`, preserving the calendar date supplied by Wowhead without converting time zones.
- Limit the author name's width when the window is narrow so the date and rating have room.
- Pass all 344 Lua 5.1 display checks using the actual addon files and stubbed WoW widgets. The date and divider still need visual confirmation in-game.

## 0.2.3 — 2026-10-02

- Make author names smaller and muted gray, giving the comment body more visual emphasis.
- Translate interface text, diagnostics, script messages, code comments, and project documentation into English.
- Preserve the original German names in the supplied Blizzard source response.
- Pass TypeScript checks, all five pipeline tests, and all 344 Lua 5.1 display checks.

## 0.2.2 — 2026-10-02

- Replace the Unicode rating triangle, which appeared as a missing glyph in-game, with signed numbers such as `+84` and `-2`.
- The user confirmed this display change in-game.

## 0.2.1 — 2026-10-02

- Import the supplied Blizzard quest-area response for Ashenvale (area 331), containing 165 unique quest IDs.
- Extend fetching, processing, and Lua generation to handle the full quest list. Retain the previously supported quest 14435, for 166 database entries in total.
- Fetch pages sequentially with a one-second delay, reuse valid raw caches, and report failures per quest without replacing their existing cache files.
- Select up to five eligible main comments per quest and emit one combined Lua database sorted by quest ID. Represent missing processed datasets with empty entries.
- Load the database through the shared addon namespace and attach a deterministic data build ID.
- Use a shared lookup for preview, explicit quest IDs, and minimap clicks. Accept both numeric and textual database keys.
- Add explicit quest commands and `/wqc debug [QuestID]` to report the loaded Core version, data build, key types, matching entry, and active quest.
- Distinguish a missing database from a quest with no saved comments.
- Add Lua 5.1 runtime checks that execute the actual TOC files with WoW widget stubs.
- The user confirmed that the complete addon package displayed quest comments correctly in-game.

### Data coverage

The initial batch obtained comments for 141 of the 165 Ashenvale quests. Wowhead returned HTTP 403 for 24 quests; their entries are empty. Quest 14435 was already cached. Quest 13943 has two selected comments.

The missing quest IDs are:

```text
26467 26468 26469 26470 26472 26473 26474 26475
26476 26477 26478 26479 26480 26481 26482 26890
28492 28493 28876 75378 75379 75380 76045 76046
```

Run `npm run build:data` again when Wowhead access is available to retry missing raw datasets and regenerate the database. Existing valid raw caches are reused.

### Debugging evidence and limitations

The preview-only behavior was reproduced with textual database keys: preview used an existing key, while explicit commands and tracking supplied numbers. The shared lookup handles both types. The generated project data itself contained numeric keys, so this was not confirmed as the exact cause in the user's earlier installation. The complete 0.2.1 package was subsequently confirmed working.

The runtime checks verify command handling and rendered text values using stubbed widgets; they do not verify the real WoW API or visual layout. The window refreshes its comments when opened, not when the tracked quest changes while the window remains open.

Generation still depends on local processed files: missing files produce empty entries even if a previous Lua output contained comments. Also, `generate --quest <ID>` replaces the output with that quest alone. Use `npm run generate` without `--quest` to produce the full database.

## 0.1.0 — Initial implementation

- Add the movable, resizable comment window and draggable minimap button with saved positions and window size.
- Show comments for the quest with the active waypoint (supertracking).
- Implement HTML extraction, comment selection, text conversion, Lua escaping, syntax validation, and atomic data-file replacement.
- Bundle five selected comments for quest 14435; the user confirmed the initial interface and data in-game.
