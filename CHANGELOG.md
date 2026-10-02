# Changelog

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
