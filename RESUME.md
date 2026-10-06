# Development handoff

Updated: October 6, 2026. Addon version: 0.2.4.

See [CHANGELOG.md](CHANGELOG.md) for the complete release history and validation scope.

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

- `scripts/quest-ids.json` contains 22,207 unique quest IDs from all 440 Battle.net quest areas. This is the default fetch source.
- Fetch, process, and generate no longer use a separate Ashenvale-only list. Area 331 can still be selected with `--area 331` like any other zone.
- Fetch skips every valid raw cache unless `--full-refresh` is specified. Prefer `--max-requests 99` (or similar) for bounded batches; HTTP 403 stops the run.
- Process defaults to every local raw cache. Generate bundles every local processed cache into `addon/Data.lua` (no empty placeholders for unfetched IDs).
- Raw and processed JSON files are cached under `data/`, which is excluded from Git. The generated `addon/Data.lua` is included in Git.
- The data is passed from `Data.lua` to `Core.lua` through the shared addon namespace (`ns.db`).

## Commands

```bash
npm ci
npm run fetch -- --max-requests 99
npm run process
npm run generate
npm run check
npm test
npm run test:addon
```

The last command requires Lua 5.1. It executes the actual TOC files with WoW widget stubs and checks all generated quests, numeric and textual keys, commands, minimap clicks, and diagnostics. See `README.md` for single-quest operations, area/expansion filters, cache refreshes, and HTML imports.

Copy the contents of `addon/` into `_retail_/Interface/AddOns/WowheadQuestComments/` and run `/reload`. Keep `Data.lua` and `Core.lua` from the same release together.

## Remaining work and limitations

- A high rating does not guarantee that a comment is current or helpful. Selection uses rating, then comment ID, excludes replies and deleted/outdated comments, and preserves full text.
- `generate --quest <ID>` replaces the output with only that quest. Use the default generator for the full local processed set.
- The window updates when opened; changing the tracked quest while it is already open does not refresh the displayed comments automatically.
- Runtime checks do not replace an in-game layout check.
- Wowhead may still return HTTP 403 under higher request pressure; resume from cache when access returns.

## Debugging evidence

The reported behavior (preview works, numeric quest IDs return zero comments) was reproduced using textual database keys and fixed by sharing one lookup between all entry points. The supplied generated data itself used numeric keys, so this was not established as the exact cause in the user's earlier installation. The user subsequently confirmed that the complete 0.2.1 package worked. Earlier claims about automatic per-addon global isolation were not established and should not be used as a diagnosis.
