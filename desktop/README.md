# 3D-editor Lägesplan – skrivbordsprogram (Windows)

Samma 3D-editor som i lägesplanen, men som ett eget program som körs **utan Trimble Connect, GitHub och 4D-planering**.
Allt sparas på datorn (arbetsyta, placerade objekt, bibliotek, inställningar). IFC, DXF/DWG och punktmoln (LAS/LAZ …) öppnas från datorn
(Lager → ＋ → "IFC från datorn…", "DXF från datorn…", "Punktmoln från datorn…"); det du sparar som IFC/DXF/PDF hamnar i Hämtningar.

## Få tag på .exe-filen (ingen installation av utvecklingsverktyg behövs)
1. Gå till **Actions → "Bygg skrivbordsprogram"** i GitHub-repot och tryck **Run workflow** (eller skapa en tagg som börjar på `desktop-v`).
2. När bygget är klart (några minuter) finns **installationsprogrammet** (`3D-editor-Lagesplan-<version>-nsis.exe`) och en **portabel .exe** (kräver ingen installation)
   under *Artifacts* (och under *Releases* om bygget kördes från en tagg).

## Bygga själv
```
cd desktop
npm install
npm run dist      # skapar dist/*.exe (kör på Windows)
npm start         # startar programmet direkt för test
```
`prepare.js` kopierar `docs/` till `desktop/app/` och hämtar de bibliotek som annars kommer från internet (pdf.js m.fl.) så att programmet också fungerar offline.

## Skillnader mot versionen i Trimble Connect
- Ingen hämtning från/sparning till Trimble Connect – filerna väljs på datorn och sparas i Hämtningar.
- En tom arbetsyta (1 000 × 1 000 m) används; origo flyttas automatiskt till första inlästa modellen/molnet så att SWEREF-koordinater blir stabila.
- Data finns i programmets egen databas (IndexedDB i användarprofilen). Säkerhetskopiera genom att exportera de IFC/DXF du behöver.
