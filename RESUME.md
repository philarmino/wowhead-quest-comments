# Development handoff

Updated: October 2, 2026. Addon version: 0.2.4.

The Ashenvale import and English UI were pushed to `main` in `663eb51`; the header divider and posting dates were pushed in `e0355bf`. See [CHANGELOG.md](CHANGELOG.md) for the complete release history, missing quest IDs, and validation scope.

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
- `scripts/quest-ids.json` contains 22,207 unique quest IDs from all 440 Battle.net quest areas. `npm run fetch -- --all-areas` uses this list and skips every valid raw cache unless `--full-refresh` is specified.
- This workspace currently has local raw and processed caches for 466 quests: the original 166 plus 300 from other areas. Of those 300, 271 have 1,177 selected comments in total and 29 have none. The remaining 21,741 quest IDs lack a raw cache. These caches are excluded from Git and will not appear in a fresh clone.
- A full all-area run stopped after CloudFront returned HTTP 403 for eight concurrent requests; isolated probes for both previously working and new IDs then also returned 403 with a "Request blocked" page and no `Retry-After`. `data/wowhead-fetch-report.json` records the last run. The cache is safe to resume when access returns.
- The fetch now spaces request starts globally by two seconds by default, regardless of worker count, and stops after the first 403. This reduces request pressure but does not establish the cause of the CloudFront block.
- The initial batch fetched comments for 141 Ashenvale quests and received HTTP 403 for 24. A later retry fetched all 24: 19 now have selected comments and five (75378–75380, 76045–76046) have no comments. Quest 14435 was loaded from cache.
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

Latest validation: TypeScript and all 13 TypeScript tests passed after the fetch and data update. The generated Lua passed the syntax check. The Lua 5.1 runtime test could not run in this environment because `lua5.1` is absent; its expectations were updated for the newly populated quest 26467. The user confirmed comment display in 0.2.1 and the rating fix in 0.2.2. The newest date/divider layout has not yet been confirmed in-game.

Copy the contents of `addon/` into `_retail_/Interface/AddOns/WowheadQuestComments/` and run `/reload`. Keep `Data.lua` and `Core.lua` from the same release together.

## Remaining work and limitations

- The default Wowhead fetch and addon generator still process only the original Ashenvale list plus quest 14435. The all-area fetch and processing require `--all-areas`; generation has not been expanded to bundle all areas.
- A high rating does not guarantee that a comment is current or helpful. Selection uses rating, then comment ID, excludes replies and deleted/outdated comments, and preserves full text.
- `generate --quest <ID>` replaces the output with only that quest. Use the default generator for the full list.
- Generation relies on local processed files. A missing local processed file produces an empty entry, even if an older Lua output contained comments for that quest. Preserving such entries independently of the cache remains a follow-up.
- The window updates when opened; changing the tracked quest while it is already open does not refresh the displayed comments automatically.
- Runtime checks do not replace an in-game layout check.

## Debugging evidence

The reported behavior (preview works, numeric quest IDs return zero comments) was reproduced using textual database keys and fixed by sharing one lookup between all entry points. The supplied generated data itself used numeric keys, so this was not established as the exact cause in the user's earlier installation. The user subsequently confirmed that the complete 0.2.1 package worked. Earlier claims about automatic per-addon global isolation were not established and should not be used as a diagnosis.
