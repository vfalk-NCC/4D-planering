# 3D-editor i Rust (WebAssembly)

En ny 3D-editor där **Rust gör det tunga och webbläsaren ritar**. Designen följer konceptet "Designkoncept 3D editor"
(ljust, luftigt, glasliknande paneler, blå accent, modellen i centrum). Den ligger bredvid den vanliga 3D-editorn i
lägesplanen, som är orörd. Öppna `…/rust3d/` eller knappen **Rust-editor** i lägesplanens 3D-vy (då får editorn
kontakt med 4D-planering och Trimble Connect).

## Gränssnittet (docs/rust3d)
- **Skal:** toppfält med projekt, flikarna Modell · Ritningar · Tidplan · Dokument · Mängdning · Kollisionskontroll, sök (Ctrl+K); modellpanel till vänster (Objekt / Filter / Vyer), egenskapspanel till höger (Objekt / IFC / Metadata) som öppnas när något markeras och kan fällas ihop.
- **Mus:** vänsterklick väljer (blå kontur, etikett med snabbval); vänster eller mitten + dra roterar (runt markeringen, annars punkten under pekaren); höger eller Skift + dra panorerar; hjulet zoomar mot pekaren; dubbelklick fokuserar med mjuk kamerarörelse.
- **Snabbmeny:** håll mittenknappen stilla (på pekskärm: håll ett finger stilla) → cirkulär meny med åtta verktyg (Välj, Mät, Kommentera, Sektion, Visa/dölj, Inspektera, Spara vy, Fokusera). Dra åt ett håll och släpp. Ordningen och kortkommandona kan ändras i Inställningar. Håll Ctrl för att se genvägarna.
- **Vyer:** visningskub, zooma/anpassa/zoomfönster/ortografisk, planvy (minikarta med våningsval), delad vy (3D + plan) och flera paneler (3D, plan, fram, sida), helskärm.
- **Verktyg:** Välj · Mät (fäster mot hörn och kanter) · Info · Skärning (planet dras med handtag i 3D, eller klicka på modellen) · Kommentar (fäst i modellen, status, export).
- **Ångra/gör om** för allt viktigt, med klickbar ändringshistorik. Sparade vyer med miniatyr.
- **Kontextuell verktygsrad** (anpassas efter markering/verktyg).

## Funktioner
- **IFC** läses av Rust: extruderade profiler, triangulerade/polygonala ytnät, facetterad brep, mappade instanser, förenklade booleska resultat, placeringskedjor, enheter, färger/transparens. Egenskaper, kvantiteter och våningar. Redigera namn, beskrivning, taggnr och egenskapsvärden och **spara en ny IFC** (till datorn eller Trimble Connect).
- **Mängdning:** yta, volym och antal per klass/våning/kategori (synligt/markerat/allt), CSV. Volymen är exakt för slutna objekt.
- **Kollisionskontroll:** hårda krockar mellan två grupper (BVH + triangel–triangel i Rust). Övriga objekt tonas ned, problemobjekten markeras, status/ansvarig/kommentar per kollision, CSV.
- **Punktmoln** (XYZ/CSV, PLY, LAS): utglesning, höjdfärg och **avvikelse mot modellen** med statistik.
- **Tidplan (4D):** läser Powerproject-planen via 4D-planering, kopplar aktiviteter till objekt på IFC-GlobalId, färgar efter datum (planerat/pågår/klart/försenat), spelar upp, markerar aktivitetens objekt även i 4D-planering.
- **Trimble Connect (via 4D-planering):** öppna modeller/punktmoln ur projektets mappar, lista ritningar och dokument, spara ändrad IFC.

## Rust-motorn (`rust3d/src`)
`step.rs` (STEP/IFC, skriver tillbaka ändringar) · `ifc.rs` (geometri) · `model.rs` (objekt, egenskaper, sök, kanter, mängder, kollision) · `bvh.rs` (träffsökning, närmaste punkt) · `cloud.rs` (punktmoln, avvikelse) · `lib.rs` (C-gränssnitt, inga beroenden).

## Bygga och testa
```
./build.sh                                        # Rust-tester + wasm → docs/rust3d/rust3d.wasm
cargo run --release --example bench -- fil.ifc    # tidtagning
node tools/gen_ifc.js 3 test.ifc moln.xyz         # syntetisk modell + punktmoln
node ../test/test_rust3d.js                       # webbläsartest av editorn
node ../test/test_rust3d_bridge.js                # test av bryggan mot (simulerade) 4D-planering/TC
```

## Mätvärden (syntetisk modell 11,4 MB, 18 600 objekt, 220 000 trianglar)
Inläsning i WebAssembly ca 0,6 s (0,3 s naturligt). 2 000 strålträffar 10 ms. Mätt på syntetiska filer.

## Inte med än
Flytt/kopiering av IFC-objekt, DXF/2D-underlag, LAZ, gå-läge, foton, utskrift/PDF, snittlock, hål (`IFCOPENINGELEMENT` skärs inte ur), svepta/roterade/B-spline-geometrier (räknas och redovisas som "hoppades över"). Trimble Connect-kopplingen och tidplanen är provade mot en simulerad 4D-planering, inte mot riktiga Trimble Connect.
