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

## Säkerhet
- Bryggan lyssnar bara på `127.0.0.1` (din dator) och svarar bara webbplatser i `FOURD_ORIGINS` (standard: GitHub Pages och localhost). Ändra port med `FOURD_PORT`.
- Sidan *hämtar* uppdrag; bryggan kan inte starta något i sidan själv. Koppla från med ett klick på 🔌.
- `eval_js` (fri JavaScript) kräver att du godkänner varje körning i webbläsaren.
- Geometri och punktmoln skickas inte till Claude – bara objektlistor, mått, skärmdumpar och det du ber om.

## Verktyg
`tools.json` listar alla (status, screenshot, list_objects, get_object, list_library, list_site_items, create_box/prism/cylinder/polyline, place_library, add_site_item, update_site_item,
delete_site_item, update_object, duplicate_object, delete_objects, select, fly_to, set_camera, undo, redo, eval_js). Koordinater är projektets (meter); `status` visar origo och kamera.
Nya verktyg läggs till i `docs/lagesplan-l3api.js` (`l3api.methods.<namn>`) och beskrivs i `tools.json` – testet `test/test_lagesplan_l3api.js` kontrollerar att de hänger ihop.
