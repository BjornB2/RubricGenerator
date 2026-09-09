# Rubricbouwer

Een statische, Nederlandstalige webtool voor het ontwerpen en printen van rubrics met drie prestatieniveaus.

## Functies

- criteria met drie beschrijvingen en een gewicht van 1, 2 of 3;
- automatische scorewaarden `0 / gewicht / 2 × gewicht`;
- een cijferbalk van 1 tot en met 10 in stappen van een half punt;
- een lichte en donkere editorweergave, met een altijd lichte printversie;
- automatische opslag in `localStorage`;
- import en export van `.rubric.json`-instellingen;
- liggende A4-printweergave met invulregels, omcirkelbare scores en cijferbalk;
- geschikt voor GitHub Pages, zonder buildstap of externe afhankelijkheden.
- download van een ZIP-map met zowel de printklare PDF als het importbestand.

## Publiceren via GitHub Pages

Publiceer de hoofdbranch vanuit de repository-root via **Settings → Pages → Deploy from a branch**. Open lokaal simpelweg `index.html`, of gebruik een lokale webserver.
