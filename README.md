# Wowhead Quest Comments

Retail-Addon mit lokal mitgelieferten Questkommentaren. Ein Klick auf das Kommentar-Symbol an der Minimap öffnet die Kommentare zur Quest mit dem aktiven Wegweiser. Das Fenster ist verschiebbar und unten rechts skalierbar; Fenstergröße, Fensterposition und Minimap-Position werden gespeichert.

## Installation und Test

Den Inhalt von `addon/` nach `_retail_/Interface/AddOns/WowheadQuestComments/` kopieren. Der Ordnername muss zur TOC-Datei passen. Nach dem Aktualisieren `/reload` ausführen.

`/wqc preview` zeigt Beispieldaten aus der aktuell installierten Datenbank, `/wqc` öffnet oder schließt die Anzeige zur aktiven Quest.

## Kommentare erzeugen

Voraussetzung: Node.js 22 oder neuer.

```bash
npm ci
npm run build:data
```

Der erste Durchlauf ist auf **Quest 14435** eingestellt. Die Pipeline:

1. `npm run fetch`: lädt die englische Retail-Seite und liest das eingebettete JSON-Array `lv_comments0`. Speichert die Rohdaten mit Quell-URL und Abrufzeit unter `data/raw/14435.json`.
2. `npm run process`: entfernt gelöschte, als veraltet markierte und eingerückte Kommentare sowie Duplikate. Wählt die fünf bestbewerteten Hauptkommentare, ohne Antworten. Speichert das Ergebnis unter `data/processed/14435.json`.
3. `npm run generate`: erzeugt `addon/Data.lua`, prüft die Lua-5.1-Syntax und ersetzt die Datei erst nach erfolgreicher Prüfung atomar.

**Die aktuelle Ausgabe enthält genau die angegebene Quest und ersetzt die gesamte `Data.lua`.** Der frühere Platzhaltereintrag für Quest 12345 entfällt. Eine Zusammenführung mehrerer Quests ist noch nicht implementiert.

Die Skripte laufen außerhalb von WoW. Anschließend die erzeugte `Data.lua` in den installierten Addon-Ordner kopieren und `/reload` ausführen.

## Cache und Optionen

Ein vorhandener Rohdaten-Cache wird ohne weiteren Netzwerkabruf verwendet. Bewusst neu laden:

```bash
npm run fetch -- --quest 14435 --refresh
npm run process -- --quest 14435 --limit 5
npm run generate -- --quest 14435
```

Eine bereits gespeicherte vollständige Wowhead-HTML-Seite kann importiert werden:

```bash
npm run fetch -- --quest 14435 --html /pfad/quest.html
```

Die kanonische URL muss zur angeforderten Retail-Quest gehören. HTTP-Fehler, Sperrseiten oder unbekannte Datenformate führen zum Abbruch; es gibt keine automatischen Wiederholungsversuche. Cache-Dateien und `node_modules/` sind von Git ausgeschlossen.

## Auswahl und Textformat

Die Auswahl richtet sich ausschließlich nach Bewertung (bei Gleichstand nach Kommentar-ID). Eine hohe Bewertung garantiert keine Aktualität oder Nützlichkeit. Texte bleiben vollständig; Absätze, Koordinaten und beschriftete Links bleiben erhalten. Häufige Wowhead-Formatierungen werden in einfachen Text umgewandelt. Nicht unterstützte spezielle Tags können sichtbar bleiben.

Autor, Kommentar-ID, Datum und direkter Quellenlink werden mit ausgegeben. Numerische Autorennamen werden so übernommen, wie Wowhead sie liefert. Es wird keine Spielversion aus dem Datum abgeleitet. Die Quelle ist eine HTML-Seite, keine dokumentierte öffentliche Kommentar-API; Änderungen am Seitenformat können Anpassungen erfordern.

## Prüfung

```bash
npm run check
npm test
```

Die Tests prüfen die Extraktion ohne Ausführen fremden JavaScripts, Quest-Zuordnung, Textformatierung, Auswahl/Deduplizierung und Lua-/WoW-Escaping. Die Darstellung wird im Spiel geprüft.
