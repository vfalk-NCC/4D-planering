# 3D-labb i Rust (WebAssembly)

Ett fristående experiment bredvid den vanliga 3D-editorn: **Rust gör det tunga, webbläsaren ritar.**
Öppnas som `…/rust3d/` (filerna ligger i `docs/rust3d/`). Den befintliga editorn är orörd.

## Vad Rust-motorn gör (`rust3d/src`)
| Modul | Uppgift |
|---|---|
| `step.rs` | Läser STEP/IFC (tokenisering utan att tolka allt, argument tolkas vid behov), `\X2\`-tecken, skriver tillbaka IFC med ändrade argument |
| `ifc.rs` | IFC → trianglar: extruderade profiler (rektangel, cirkel, ellips, I, L, godtycklig kurva), `IFCTRIANGULATEDFACESET`, `IFCPOLYGONALFACESET`, facetterad brep, mappade instanser, booleska resultat (förenklat: första operanden), placeringskedjor, enheter, ytfärger/transparens |
| `model.rs` | Objekt, våningar, egenskapsmängder/kvantiteter, fritextsökning, ändring av namn/egenskaper |
| `bvh.rs` | BVH: strålträff (markering, mått med fäste mot hörn/kant) och närmaste punkt på modellen |
| `cloud.rs` | Punktmoln XYZ/CSV, PLY (ascii/binär), LAS (okomprimerad); utglesning, höjdfärg, **avvikelse mot modellen** |
| `lib.rs` | Litet C-gränssnitt (`alloc`, `model_load`, `model_pick`, …) – inga beroenden, ingen glue-kod |

Webbsidan (`docs/rust3d/app.js`) ritar med WebGL2: en enda buffert för hela modellen, objektens läge (dold/markerad/färgad) ligger i en liten textur så att dölja/markera/färglägga inte kräver ny geometri.

## Bygga
```
./build.sh        # kör testerna, bygger wasm och kopierar till docs/rust3d/
cargo run --release --example bench -- fil.ifc   # tidtagning per steg
node tools/gen_ifc.js 3 test.ifc moln.xyz        # syntetisk testmodell + punktmoln
node ../test/test_rust3d.js                      # webbläsartest
```

## Mätvärden (syntetisk modell, 11,4 MB, 18 600 objekt, 220 000 trianglar)
- Inläsning i WebAssembly (Node): ca 0,6 s. Naturligt (samma kod): ca 0,3 s.
- 2 000 strålträffar mot hela modellen: 10 ms.
- Avvikelse för 120 000 punkter mot modellen: se testutskriften.
Mätt med syntetiska filer – riktiga modeller från Revit/Tekla har fler och krångligare geometrityper.

## Inte med än (jämfört med den vanliga editorn)
Trimble Connect-kopplingen (öppna/spara till TC), etableringsbiblioteket (bemanning, kranar, skyltar …), 4D-koppling mot Gantt, flytt av IFC-objekt, DXF/2D-underlag, LAZ, gå-läge, foton, utskrift/PDF, snitt med lock, hål (`IFCOPENINGELEMENT` skärs inte ur), svepta/roterade/B-spline-geometrier (räknas och visas som "hoppades över").
Andra appar kan skicka in filer: `postMessage({type:'rust3d-open', kind:'ifc'|'cloud', name, buffer})`.
