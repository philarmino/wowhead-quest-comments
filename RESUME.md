# Weiterarbeit: mehrere Quests unterstützen

Stand: 2. Oktober 2026. Branch: `main`. Letzter Implementierungscommit: `6949162`.

## Was bereits funktioniert

- Die Oberfläche wurde im Spiel geprüft und vom Nutzer akzeptiert.
- Der Minimap-Button öffnet Kommentare zur Quest mit dem aktiven Wegweiser (Supertracking).
- Fensterposition, Fenstergröße und Minimap-Button-Position werden gespeichert.
- Die drei TypeScript-Skripte für Abruf, Aufbereitung und Lua-Generierung funktionieren.
- Für Quest **14435** wurden 19 Hauptkommentare abgerufen und fünf ausgewählt. Der Nutzer hat die echten Daten im Spiel erfolgreich getestet.
- TypeScript-Prüfung und alle fünf Tests bestanden. Der Implementierungsstand ist nach `main` gepusht.

## Aktuelle Einschränkung

Die Generierung ersetzt `addon/Data.lua` vollständig durch die Daten einer einzigen Quest. Mehrere Quests werden noch nicht zusammengeführt. Rohdaten und aufbereitete JSON-Dateien liegen lokal unter `data/` und sind nicht in Git enthalten.

## Nächste Schritte

1. **Zentrale Quest-Liste anlegen.** Zunächst wenige IDs aufnehmen; 14435 bleibt dabei. Weitere Test-IDs müssen noch ausgewählt werden.
2. **Abruf für mehrere Quests ermöglichen.** Die Liste in einem Durchlauf verarbeiten und den vorhandenen Cache je Quest nutzen. Netzwerkabrufe mit Abstand ausführen.
3. **Gemeinsame Lua-Datei erzeugen.** Alle aufbereiteten Quests nach Quest-ID sortiert in `WowheadQuestCommentsDB` zusammenführen. Ausgabe weiterhin vor dem atomaren Ersetzen prüfen.
4. **Fehler pro Quest behandeln.** Bei einem fehlgeschlagenen Abruf vorhandene gültige Daten erhalten und den Fehler mit Quest-ID melden. Bestehende Einträge dürfen auch dann nicht verschwinden, wenn lokal kein Cache vorliegt. Neue Quests ohne gültige Daten klar als fehlgeschlagen ausweisen. Einen leeren erfolgreichen Datensatz von einem Abruffehler unterscheiden.
5. **Gezielt testen.** Mehrere Quests in der Ausgabe, unveränderte Cache-Nutzung und Datenerhalt bei einem einzelnen Fehler prüfen. Danach im Spiel zwischen zwei Quests mit Kommentaren und einer ohne Daten wechseln. Das Fenster jeweils erneut öffnen; bisher aktualisiert es beim Öffnen.

Erst nach diesem Test den Questbestand gezielt erweitern. Der Umfang einer späteren vollständigen Quest-Liste ist noch offen.

## Befehle für den bestehenden Stand

```bash
npm ci
npm run build:data
npm run check
npm test
```

`build:data` verarbeitet derzeit standardmäßig nur Quest 14435. Einzelne Schritte und Optionen sind in `README.md` beschrieben.

Für den Spieltest die erzeugte `addon/Data.lua` nach `_retail_/Interface/AddOns/WowheadQuestComments/` kopieren und `/reload` ausführen. `/wqc preview` zeigt vorhandene Daten; der Minimap-Button beziehungsweise `/wqc` verwendet die aktive Quest.

## Wichtige Dateien

- `scripts/fetch-comments.ts`: Abruf oder HTML-Import, Cache.
- `scripts/process-comments.ts`: Auswahl der fünf bestbewerteten geeigneten Hauptkommentare.
- `scripts/generate-lua.ts`: geprüfte Lua-Ausgabe.
- `scripts/pipeline.ts`: gemeinsame Datenformate, Validierung, Textaufbereitung und Escaping.
- `scripts/pipeline.test.ts`: bestehende Tests.
- `addon/Core.lua`: Oberfläche und Auswahl der aktiven Quest.
- `addon/Data.lua`: generierte Kommentardaten.

## Bisherige Entscheidungen

- Lange Kommentare vollständig erhalten und im Fenster scrollen.
- Gelöschte, als veraltet markierte und eingerückte Kommentare sowie Duplikate ausschließen; Antworten nicht übernehmen.
- Bewertung ist das Auswahlkriterium, keine Garantie für Aktualität oder Nützlichkeit.
- Keine Spielversion aus dem Kommentardatum ableiten.
- Bei unklaren Produktentscheidungen vor der Umsetzung nachfragen.
