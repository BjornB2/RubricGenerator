# OnlineRubric

OnlineRubric is een Nederlandstalige webtool voor het ontwerpen van rubrics, online beoordelen van leerlingen en maken van printklare PDF’s. De toepassing werkt volledig in de browser en heeft geen account, database of serveropslag nodig.

**Live versie:** [onlinerubric.nl](https://onlinerubric.nl/)

## Mogelijkheden

- rubrics maken met drie vrij benoembare prestatieniveaus;
- criteria toevoegen, dupliceren, verwijderen en verslepen;
- per criterium een gewicht van 1, 2 of 3 instellen;
- automatische puntentelling en omzetting naar cijfers van 1 tot en met 10;
- meerdere leerlingen binnen één klas of cluster beoordelen;
- een leerlinglijst afzonderlijk openen en opslaan;
- een complete klas met rubric en beoordelingen openen en opslaan;
- een rubric of ingevulde beoordeling delen via een zelfstandige deellink;
- één leerling-PDF of alle voltooide PDF’s als ZIP downloaden;
- een liggende A4-preview en printklare PDF genereren;
- lichte en donkere schermweergave;
- aangepaste bediening voor kleinere schermen.

## Privacy en opslag

Alle gegevens blijven op het apparaat van de gebruiker:

- wijzigingen worden automatisch opgeslagen in de lokale browseropslag;
- er worden geen leerlinggegevens naar een server gestuurd;
- de toepassing gebruikt geen accounts, trackingcookies of externe database;
- gedeelde links bevatten de rubricgegevens — en bij een leerlinglink de ingevulde beoordeling — in de URL zelf;
- wie een leerlinglink ontvangt, kan uitsluitend die gedeelde beoordeling bekijken.

Behandel een ingevulde leerlinglink als een document met leerlinggegevens en deel hem alleen met de bedoelde ontvanger.

## Bestanden openen en opslaan

Bij openen en opslaan kan worden gekozen uit drie varianten:

1. **Alleen rubric** – het rubricontwerp zonder leerlingen of beoordelingen.
2. **Alleen leerlinglijst** – de klas- of clusternaam en de namen van leerlingen, zonder rubric of beoordelingen.
3. **Alles** – de rubric, leerlinglijst en alle aanwezige beoordelingen.

Een afzonderlijke leerlinglijst wordt opgeslagen als `Leerlinglijst Klasnaam.rubric`. Alle `.rubric`-bestanden bevatten gewone JSON en oudere `.json`-exports kunnen nog steeds worden geopend. De klas- of clusternaam wordt alleen gebruikt voor lokale bestandsnamen en verschijnt niet in de rubric of PDF.

In browsers met ondersteuning voor een bestandskiezer, zoals Chrome en Edge, kan bij het opslaan een locatie en bestandsnaam worden gekozen. Andere browsers gebruiken automatisch hun normale downloadfunctie.

## Lokaal gebruiken

Er is geen installatie of buildstap nodig. Open `index.html` rechtstreeks in een moderne browser. Voor gedrag dat een normale webomgeving vereist, kan de map ook via een eenvoudige lokale webserver worden geopend.

De toepassing bestaat uit gewone HTML, CSS en JavaScript. De benodigde PDF- en ZIP-bibliotheken staan lokaal in de map `vendor`, waardoor de kernfuncties niet afhankelijk zijn van externe diensten.

## Projectstructuur

- `index.html` – pagina’s, bediening en dialoogvensters;
- `styles.css` – schermweergave, responsive gedrag en printopmaak;
- `app.js` – rubricbewerking, beoordelingen, import, export, delen en PDF-generatie;
- `vendor/` – lokaal meegeleverde bibliotheken voor PDF- en ZIP-bestanden;
- `examples/` – voorbeeldbestanden voor gebruik en controle.

## Publiceren met GitHub Pages

De website kan rechtstreeks vanaf de hoofdbranch worden gepubliceerd:

1. Open in GitHub **Settings → Pages**.
2. Kies **Deploy from a branch**.
3. Selecteer de branch `main` en de repository-root `/`.
4. Sla de instelling op.

Omdat de toepassing statisch is, zijn geen buildcommando’s of omgevingsvariabelen nodig.

## Bijdragen

Problemen en verbetervoorstellen kunnen via GitHub Issues worden gemeld. Houd bij bijdragen rekening met de privacy van leerlingen: voeg geen echte leerlingnamen, beoordelingen of gedeelde leerlinglinks toe aan issues, commits of voorbeeldbestanden.

## Licentie

Copyright © 2026 Björn Heirman.

OnlineRubric is vrije software onder de **GNU Affero General Public License, versie 3 of later** (`AGPL-3.0-or-later`). Commercieel gebruik is toegestaan. Wie een aangepaste versie verspreidt of via een netwerk beschikbaar stelt, moet de bijbehorende broncode onder dezelfde licentie beschikbaar maken. Zie het bestand [`LICENSE`](LICENSE) voor de volledige voorwaarden.

De afzonderlijke bibliotheken in `vendor/` blijven onder hun eigen licentievoorwaarden vallen.
