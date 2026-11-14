# Claude ↔ 3D-editorn (MCP-brygga)

Låter Claude se och bygga i din öppna 3D-editor i 4D-planering: skapa lådor/prismor/cylindrar/linjer, placera biblioteksobjekt (kran, ställning, bod …), lägga ut etableringsobjekt
(stängsel, väg, ställning med breddningar …), flytta/färga/kopiera/ta bort, flyga kameran och **ta skärmdump** för att kontrollera resultatet. Allt kan ångras (Ctrl+Z eller verktyget `undo`).

## Installera (en gång)
1. Node 18 eller nyare på datorn. Inga paket behöver installeras.
2. Lägg bryggan i Claude:
   - **Claude Code:** `claude mcp add 4d-planering -- node /sökväg/till/4D-planering/tools/mcp/4d-bridge.mjs`
   - **Claude Desktop:** i `claude_desktop_config.json` under `mcpServers`:
     ```json
     "4d-planering": { "command": "node", "args": ["/sökväg/till/4D-planering/tools/mcp/4d-bridge.mjs"] }
     ```
     Starta om Claude Desktop.

## Använda
1. Öppna lägesplanen och 3D-vyn (Chrome/Edge).
2. Klicka på **🔌 Claude** nere till vänster i 3D-vyn (blir grön: "Claude kopplad"). Valet minns till nästa gång. Adressen kan också få `?bridge=8787`.
3. Skriv till Claude, t.ex. *"Börja med status och en skärmdump. Lägg en 12 m hög ställning längs fasaden mellan punkterna …, med en plattform vid trapphuset."*

## Avancerad modellering och rendering
- **Modellera:** `push_pull` (som SketchUp: dra en yta till en kropp eller ändra höjden), `offset_outline`, `transform_object` (flytta, vrid, skala, spegla), `array_copy` (serie), `create_wall` (öppen eller sluten med rum), `create_gable_roof`, `create_stairs`, `measure`.
- **Se:** `screenshot` (snabb bild av vyn), `set_view_mode` (skuggad, tråd, X-Ray, realistisk) och `set_sun` (riktning och höjd för skuggor).
- **Rendera:** `render_image` ritar en riktig stillbild med motorn i `docs/lagesplan-3drender.js`: många delbilder läggs ihop (kantutjämning, mjuka skuggor från solens skiva, ambient occlusion från himlen), filmisk tonkurva och himmel. Kvalitet `fast`/`good`/`best` (12/48/160 delbilder). Samma motor finns i knappen **🎬 Rendera** nere till vänster i 3D-vyn (storlek upp till 4K, sol, mjukhet, ambient occlusion, exponering, spara som PNG). Vyn ändras inte av en rendering.

## Renderingsmaterial, mark och miljö (frikopplat från editorn)
Renderingsläget har ett eget utseende som **inte** påverkar 3D-editorns material, färger eller texturer – motorn byter material bara medan bilden ritas och sätter tillbaka allt. Det sparas i projektet (`plan.render`).
- **Material:** ca 50 PBR-material (mark, betong, murverk, trä, metall, glas & vatten, puts/färg/tak) med färg, relief, råhet, metall och genomskinlighet i verklig storlek. Ytan läggs på från alla håll (triplanar), så det fungerar på ritade objekt, biblioteksobjekt och IFC-delar.
- **Så lägger du på (🎬 Rendera → Material):** välj mål (markerade objekt, en IFC-klass som alla väggar, eller alla med samma färg), klicka på ett material, justera skala/vridning/tona. Objekt går före IFC-klass, som går före färg.
- **Mark:** grundmaterial för hela marken (ersätter planens bild i renderingen och tar emot skuggor) plus markytor och vägar. Rita en yta eller linje i editorn, markera den och klicka "Markyta av markerad yta" / "Väg av markerad linje" – ritobjektet göms i bilden.
- **Miljö:** tid på dygnet (morgon … kväll), sol, moln (mjukare, svagare sol och gråare himmel), dis och exponering.
- **Förhandsvisning:** uppdateras automatiskt efter varje ändring (4 delbilder, lågupplöst).
- **MCP:** `list_render_materials`, `get_render_setup`, `set_render_material`, `remove_render_material`, `set_ground_material`, `add_ground_area`, `remove_ground_area`, `set_render_environment`. `animate_object` nyckelsätter objekt och maskiner (`mach:crane`, `mach:excavator`, `mach:truck`, `mach:loader`, `mach:human` via `place_library`) på filmens tidslinje: körning, vridning, synlighet och arbete. `render_film_start` / `render_film_status` / `render_film_stop` renderar filmen bild för bild med samma motor (WebM eller JPEG-ZIP, körs i bakgrunden). `render_image` använder lagret automatiskt (`use_render_materials: false` stänger av det).

## Säkerhet
- Bryggan lyssnar bara på `127.0.0.1` (din dator) och svarar bara webbplatser i `FOURD_ORIGINS` (standard: GitHub Pages och localhost). Ändra port med `FOURD_PORT`.
- Sidan *hämtar* uppdrag; bryggan kan inte starta något i sidan själv. Koppla från med ett klick på 🔌.
- `eval_js` (fri JavaScript) kräver att du godkänner varje körning i webbläsaren.
- Geometri och punktmoln skickas inte till Claude – bara objektlistor, mått, skärmdumpar och det du ber om.

## Verktyg
`tools.json` listar alla (status, screenshot, render_image, list_objects, get_object, list_library, list_site_items, create_box/prism/cylinder/polyline, create_wall/gable_roof/stairs, place_library, add_site_item, update_site_item,
delete_site_item, update_object, transform_object, push_pull, offset_outline, array_copy, duplicate_object, delete_objects, select, fly_to, set_camera, set_view_mode, set_sun, measure, undo, redo, eval_js). Koordinater är projektets (meter); `status` visar origo och kamera.
Nya verktyg läggs till i `docs/lagesplan-l3api.js` (`l3api.methods.<namn>`) och beskrivs i `tools.json` – testet `test/test_lagesplan_l3api.js` kontrollerar att de hänger ihop.
