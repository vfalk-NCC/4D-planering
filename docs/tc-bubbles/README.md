# TC Bubbles

Lite-app för **info-bubblor** på bilder ur Trimble Connects 3D-vy. Helt manuell – ingen koppling till Gantt eller 4D-data.

- 📷 Tar ett foto på 3D-vyn (eller 🖼 öppna/klistra in en bild från datorn).
- ＋ Bubbla: klicka i bilden där bubblan ska peka. Rubrik, aktivitet, datumtext, **framdrift i %**, anteckning, färg, försenad, storlek.
- Dra bubblan eller dess punkt. 🔒 låser en bubbla (går inte att dra, rörs inte av ⇅ Ordna).
- **Sparade vyer** sparar kamera + alla bubblor (exakta platser, lås, texter, datumskylt). ▶ Använd flyttar modellen till vyns kamera, tar nytt foto och lägger på bubblorna. 📅 skapar vyn för nästa vecka (+7 dagar). ＋ % lägger på procentenheter på alla bubblor.
- Varnar om bildens format ändrats sedan vyn sparades eller om kameran inte kom exakt rätt.
- Export: PNG, PDF, kopiera. Vyer kan exporteras/importeras som fil (backup, annan dator).
- Utkastet sparas automatiskt i webbläsaren. Vyerna sparas per projekt i webbläsaren.

Kortkommandon: `B` ny bubbla, `Delete` ta bort, `Ctrl+Z` ångra, `Ctrl+D` dubblera, `Esc` avmarkera.

## Installera i Trimble Connect
Appen ligger i `docs/tc-bubbles/` i detta repo och publiceras av GitHub Pages:
`https://vfalk-ncc.github.io/4D-planering/tc-bubbles/index.html`

Trimble Connect → Project settings → Extensions → lägg till egen extension med manifestet
`https://vfalk-ncc.github.io/4D-planering/tc-bubbles/manifest.json`

Filerna är helt fristående (ingen kod delas med 4D-planering) och kan flyttas till ett eget repo senare – uppdatera då `url` och `icon` i `manifest.json`.

## Test
`NODE_PATH=<sökväg till playwright> node test/test_tcbubbles.js`

Appen laddar bara Trimble Connects Workspace API från `components.connect.trimble.com` (samma som övriga tillägg) – inga andra bibliotek.
