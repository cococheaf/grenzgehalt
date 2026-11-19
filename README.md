# Grenzgehalt

Kostenloser Gehalts- und Budgetrechner für Österreich, Liechtenstein und die Schweiz. Die Berechnungen laufen im Browser. Die Jahresauswahl bietet 2026 und eine ausdrücklich gekennzeichnete Vorschau für 2027.

- Österreichischer Brutto-Netto-Rechner und Grenzgängermodelle mit Wohnsitz Österreich.
- Schweizer Umzugsszenario mit Quellensteuer oder übernommener ordentlicher Jahressteuer.
- Vergleich von bis zu drei Ländern, mit getrennten Zahltagen, Wechselkursszenarien und EUR-/CHF-Ansicht.
- Detailwerte für Lohnzettel, Versicherungen, Pendeln, Familie und Arbeitgeberleistungen.
- Druck/PDF, CSV, JSON und Rechenlinks, die nur beim ausdrücklichen Teilen erzeugt werden.

Live: [grenzgehalt.amgnet.at](https://grenzgehalt.amgnet.at/)

## Lokal starten

Voraussetzungen: Node.js ab 20 und Python 3. Die App hat keine npm-Abhängigkeiten und keinen Build-Schritt.

```sh
npm run tariffs
npm test
npm start
```

Danach [http://127.0.0.1:4173/](http://127.0.0.1:4173/) öffnen. `npm run tariffs` lädt die amtliche ESTV-Datei, prüft ihre SHA256-Prüfsumme und erzeugt die lokalen Tarifmodule. Quelle und Prüfsumme stehen in [docs/swiss/source.json](docs/swiss/source.json). Die amtlichen Rohdaten und daraus erzeugten Tabellen werden separat bezogen und fallen nicht unter die MIT-Lizenz des Codes.

## Aufbau und Modell

- `dist/index.html` und `dist/assets/app.mjs`: Oberfläche, Angebotsblatt und Vergleich.
- `calculator.mjs`, `scenario.mjs`, `payroll.mjs`, `planning.mjs`: Rechenregeln und Eingabevalidierung.
- `payment-plan.mjs`, `salary-timeline.mjs`, `reporting.mjs`: Monatsbeträge, Sonderzahlungen und Ausgabe.
- `dist/impressum.html` und `dist/datenschutz.html`: Rechtliche Seiten. Betreiberangaben werden aus einer lokalen, nicht versionierten Datei `dist/assets/site-contact.mjs` geladen. Für die eigene Installation kann sie ein Array `operator` mit je einer Textzeile pro Eintrag exportieren. Datenschutztexte und gegebenenfalls die PayPal-Empfängerkennung für die eigene Installation anpassen.

Die Beträge sind Planungswerte. Die normale Monatsansicht zeigt zwölf reguläre Bezüge, Sonderzahlungen stehen separat. Die Schweizer ordentliche Veranlagung verwendet eine eigene Jahressteuer, etwa aus dem [ESTV-Rechner](https://www.estv.admin.ch/de/steuerrechner-steuern-berechnen). Die App übermittelt keine Steuererklärung. Weitere Annahmen und amtliche Quellen sind unter „So rechnen wir“ in der App dokumentiert.

## Datenstand 2027

Die Vorschau nutzt die veröffentlichten Einkommensteuergrenzen aus BGBl. II Nr. 260/2026, die vorläufigen ÖGK-SV-Werte mit getrennten ALV-Staffeln für bestehende und neue Dienstverhältnisse, den LI-Arbeitgeber-KK-Beitrag von 184 CHF und die neuen Schweizer BVG-Grenzen. Beim Familienbonus sind die Anteile 75/25 sowie Hinweise zu den Voraussetzungen der vollen Aufteilung ergänzt.

Die ÖGK-Selbstversicherung und Schweizer KVG-Richtprämien werden vorerst mit dem letzten bestätigten Stand 2026 angesetzt. Die Schweizer Quellensteuer nutzt bis zur Freigabe der vollständigen Kantonstarife ausdrücklich gekennzeichnete Tabellen von 2026. Eigene bestätigte Prämien und Jahressteuerbeträge haben Vorrang. Die jeweils verwendeten Übergangswerte stehen im Ergebnis und in jedem Export.

`tax-data.mjs` enthält getrennte, unveränderliche Jahresdatensätze. Das Steuerjahr gilt für alle Länder im Vergleich und wird in JSON, Rechenlink, CSV und Druck übernommen. Ältere Dateien ohne Jahresangabe in den Eingaben behalten 2026. Vor einer endgültigen Freigabe von 2027 müssen die offenen Beiträge, die amtlichen Kantonstarife und der vorläufige SV-Stand erneut geprüft werden. Amtliche Quellen sind im Rechner unter „Annahmen & Quellen“ verlinkt.

## Lizenz

Der Projektcode steht unter der [MIT-Lizenz](LICENSE).
