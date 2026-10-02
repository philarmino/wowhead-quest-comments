# Design

- A comment button sits on the edge of the minimap. It can be dragged around the edge, and its position is saved across sessions.
- Clicking it toggles the comment window for the quest with the active waypoint (supertracking).
- The window can be moved, resized from the bottom-right corner, and closed with the top-right X. Position and size persist across sessions.
- Long comments and multiple comments can be scrolled within the window.
- Comment text is the main focus. Author names use a smaller font and muted gray; ratings remain gold and use signed numbers instead of a Unicode icon.
- All interface text, diagnostics, script messages, and code comments are in English.
- `/wqc preview` opens a quest with available comments. A specific quest can be opened with `/wqc <QuestID>`.
