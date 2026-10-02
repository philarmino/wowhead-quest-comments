# Development handoff

Updated: October 2, 2026. Addon version: 0.2.4.

## Working features

- The user confirmed that quest comments display correctly in-game after installing the complete 0.2.1 package.
- The minimap button opens comments for the quest with the active waypoint (supertracking).
- Window position, window size, and minimap button position are saved.
- Preview, explicit quest IDs, and minimap clicks use the same lookup, supporting numeric and textual database keys.
- `/wqc debug [QuestID]` reports the running Core version, data build ID, key types, matching entry, and active quest.
- Ratings use signed numbers; the previous Unicode triangle did not render correctly in the WoW font. The user accepted the 0.2.2 change.
- Version 0.2.3 makes author names smaller and muted gray, and translates interface text, script messages, and documentation into English. Its visual appearance still needs an in-game check.
- Version 0.2.4 adds a header divider and a yellow posting date beside each author, one font size smaller. Dates preserve the source calendar date. Its visual appearance still needs an in-game check.

## Quest data

- `scripts/quests-eschental.json` contains the supplied Blizzard response with 165 Ashenvale quest IDs. Original German quest names are retained as source data.
- The default pipeline also includes the previously supported quest 14435, resulting in 166 database entries.
- The initial batch fetched comments for 141 Ashenvale quests. Wowhead returned HTTP 403 for the remaining 24; those IDs have empty entries. Quest 14435 was loaded from cache.
- Quest 13943 has two selected comments.
- Raw and processed JSON files are cached under `data/`, which is excluded from Git. The generated `addon/Data.lua` is included in Git.
- The data is passed from `Data.lua` to `Core.lua` through the shared addon namespace (`ns.db`).

## Commands

```bash
npm ci
npm run build:data
npm run check
npm test
npm run test:addon
```

The last command requires Lua 5.1. It executes the actual TOC files with WoW widget stubs and checks all generated quests, numeric and textual keys, commands, minimap clicks, and diagnostics. See `README.md` for single-quest operations, cache refreshes, and HTML imports.

Copy the contents of `addon/` into `_retail_/Interface/AddOns/WowheadQuestComments/` and run `/reload`. Keep `Data.lua` and `Core.lua` from the same release together.

## Remaining work and limitations

- Retry the 24 missing Wowhead pages when access is available; valid existing caches will be reused.
- A high rating does not guarantee that a comment is current or helpful. Selection uses rating, then comment ID, excludes replies and deleted/outdated comments, and preserves full text.
- `generate --quest <ID>` replaces the output with only that quest. Use the default generator for the full list.
- Generation relies on local processed files. A missing local processed file produces an empty entry, even if an older Lua output contained comments for that quest. Preserving such entries independently of the cache remains a follow-up.
- The window updates when opened; changing the tracked quest while it is already open does not refresh the displayed comments automatically.
- Runtime checks do not replace an in-game layout check.

## Debugging evidence

The reported behavior (preview works, numeric quest IDs return zero comments) was reproduced using textual database keys and fixed by sharing one lookup between all entry points. The supplied generated data itself used numeric keys, so this was not established as the exact cause in the user's earlier installation. The user subsequently confirmed that the complete 0.2.1 package worked. Earlier claims about automatic per-addon global isolation were not established and should not be used as a diagnosis.
