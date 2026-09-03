# 4D-planering – insticksprogram för Trimble Connect

Ett enkelt insticksprogram (Extension) för visuell produktionsplanering i
Trimble Connect 3D-visaren. Byggt på **Trimble Connect Workspace API**
(https://developer.trimble.com/docs/connect/workspace-api/).

## Vad det gör

- Du markerar objekt i modellen och kopplar dem till område, aktivitet,
  entreprenör, status samt start-/slutdatum.
- En tidslinje (datumväljare + slider + "spela upp") visar hur projektet
  byggs upp: objekt som inte påbörjats, pågående objekt och färdigställda
  objekt får var sin färg (valbara i inställningarna).
- Filtrering på område/aktivitet/entreprenör/status samt "kommande veckor"
  ger en snabb lägesbild i modellen (isolerar matchande objekt).
- Excel-import: en fil med kolumnerna `ObjektID, Område, Aktivitet,
  Entreprenör, Status, Startdatum, Slutdatum` läses in och skriver/uppdaterar
  planeringen. Data sparas i en databas (inte i webbläsaren) så att den
  finns kvar mellan sessioner och delas mellan alla i projektet.

## Arkitektur

```
extension/   -> Frontend som körs inuti Trimble Connect (sidopanel)
               index.html + app.js + style.css
server/      -> Liten REST-backend (Node/Express + SQLite) som lagrar
               planeringsposter per objekt-ID
```

Varför en backend? Workspace API kan färglägga och filtrera objekt i
visaren, men har inget inbyggt sätt att lagra egna, godtyckliga
planeringsfält per objekt så att de finns kvar mellan sessioner och delas
av hela teamet. Därför sparas datan i en liten egen databas som
extensionen pratar med via HTTP.

## Datamodell (per objekt)

| Fält        | Beskrivning                                      |
|-------------|---------------------------------------------------|
| objectId    | Objektets externa ID (IFC GUID) – stabilt över tid |
| modelId     | Vilken modell objektet tillhör                   |
| area        | Område                                           |
| activity    | Aktivitet                                        |
| contractor  | Entreprenör                                      |
| status      | planerad / pagaende / forsenad / klar / pausad   |
| startDate   | Planerat startdatum (ÅÅÅÅ-MM-DD)                 |
| endDate     | Planerat slutdatum (ÅÅÅÅ-MM-DD)                  |

Tidslinjens tre färger räknas fram automatiskt utifrån valt datum jämfört
med start-/slutdatum – de är alltså skilda från fältet "status", som är
till för filtrering/rapportering (t.ex. att markera förseningar).

## Komma igång

### 1. Starta backend

```bash
cd server
npm install
npm start
```

Servern lyssnar på port 3000. Driftsätt den på valfri HTTPS-värd (t.ex.
Azure App Service, Render, eget VM) – Trimble Connect kräver HTTPS för
extensions.

### 2. Publicera frontend

Lägg `extension/`-mappen på valfri webbserver/CDN (samma domän som i
manifestet). Uppdatera `manifest.json` med rätt URL:er, och sätt
backend-URL:en i insticksprogrammets inställningsdialog (kugghjulet)
alternativt hårdkoda den i `app.js` (`settings.apiBaseUrl`).

### 3. Registrera extensionen i Trimble Connect

1. Öppna projektet i Trimble Connect for Browser.
2. Inställningar → Extensions.
3. Ange manifest-URL:en (t.ex. `https://din-domän.se/4d-planering/manifest.json`)
   och lägg till.
4. Aktivera extensionen under "Custom Extensions".

## Excel-import – automatisk uppdatering

I den här grundversionen läser användaren in filen manuellt via
"Importera"-knappen, vilket uppdaterar planeringen direkt i modellen.
Detta uppfyller kravet att planeringen ska gå att uppdatera från Excel
utan manuellt återskapande av kopplingar.

**Verklig automatik** (filen uppdateras och modellen följer med utan
manuellt klick) kräver en av:

- **Molnmapp-bevakning**: lägg Excel-filen i en delad mapp (t.ex.
  SharePoint/OneDrive) och låt backend polla filen med jämna mellanrum
  (t.ex. `node-cron` + Microsoft Graph API) och skriva om databasen vid
  ändring.
- **Trimble Connect-filbevakning**: lägg Excel-filen i själva Trimble
  Connect-projektet och låt backend polla projektets filer via Trimble
  Connect REST-API (`GET /files`) och jämföra `modifiedDate`.

Kryssrutan "Bevaka fil för automatisk uppdatering" i gränssnittet är en
platshållare för detta – koppla den till valfri lösning ovan.

## Viktiga begränsningar att känna till

- **Flera modeller**: om projektet har flera modeller behöver
  Excel-filen även innehålla en `ModellID`-kolumn, annars antas objekten
  tillhöra samma modell som redan importerats.
- **Färgläggning är sessionsbaserad**: `viewer.setObjectState` färgar
  objekt i den aktuella visningen. Planeringsdatan i sig är permanent
  (lagras i backend); färgerna räknas om varje gång tidslinjen flyttas
  eller extensionen laddas om.
- **Selection-händelser**: exakt eventnamn för "objekt markerat i
  modellen" kan skilja mellan versioner av Trimble Connect. Just nu
  hämtas markeringen explicit när användaren trycker på "Koppla
  markerade objekt", vilket är robust oavsett eventnamn. Vill du ha en
  livesynkad räknare, verifiera aktuellt eventnamn mot
  `TrimbleConnectWorkspace`-dokumentationen och koppla in det i
  `onWorkspaceEvent`.

## Nästa steg (utbyggnad)

- Behörighetsstyrning (endast vissa roller får ändra planeringen).
- Historik/logg per objekt (vem ändrade vad och när).
- Exportera lägesbild till PDF/bild för veckomöten.
- Koppling mot riktiga tidplaneverktyg (t.ex. MS Project) i stället för
  enbart Excel.
