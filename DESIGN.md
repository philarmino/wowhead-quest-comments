# Design

- A comment button sits on the edge of the minimap. It uses the round WindowLogo emblem inside Blizzard’s minimap tracking border and background, can be dragged around the edge, and its position is saved across sessions. Hover brightens the icon.
- Clicking it toggles the comment window for the quest with the active waypoint (supertracking).
- The window header shows the WindowLogo texture beside the title “Community Quest Comments” in the same font family as comment body text; the context line under the title shows `QuestID <n>`. Right-clicking it, or clicking the "Wowhead" button in the footer, opens a popup with the quest URL selected for Ctrl+C, because `CopyToClipboard` is blocked for addons.
- The window can be moved, resized from the bottom-right corner, and closed with the top-right X. Position and size persist across sessions.
- Long comments and multiple comments can be scrolled within the window.
- Comment text is the main focus. Author names use a smaller font and muted gray; ratings remain gold and use signed numbers instead of a Unicode icon.
- The posting date sits directly beside the author in yellow, one font size smaller. Author names are constrained to leave space for the date and rating when the window is narrow.
- Chrome follows the logo’s gold/parchment palette: a warmer, slightly stronger tooltip border, and warm gold-alpha dividers for the header and between comment rows.
- All interface text, diagnostics, script messages, and code comments are in English.
- `/wqc preview` opens a quest with available comments. A specific quest can be opened with `/wqc <QuestID>`.
