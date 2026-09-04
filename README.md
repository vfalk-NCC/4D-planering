# 4D-planering – insticksprogram för Trimble Connect

Ett insticksprogram (Extension) för visuell produktionsplanering i
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
- **Hitta objekt via koordinat**: markera en grupp kandidatobjekt i 3D-vyn
  (t.ex. alla fundament på en yta) och ange en X/Y-koordinat (i meter) – 
  extensionen hittar och markerar det objekt i markeringen som ligger
  närmast, i stället för att behöva klicka blint eller leta i Organizer-
  tabellen.
- **Gruppering och sortering av objektlistan**: listan "Planerade objekt"
  kan grupperas på område, aktivitet, entreprenör eller status, med eller
  utan alfabetisk sortering inom varje grupp. Varje grupp går att minimera
  (klicka på pilen eller rubriken) för att få bättre överblick i långa
  listor, och knappen "Välj alla" i gruppens rubrikrad markerar samtliga
  objekt i gruppen i 3D-vyn med ett klick.
- **Genomskinlighet per tidslinjefärg**: varje tidslinjefärg (ej påbörjad /
  pågående / färdigställd) har ett eget opacitetsreglage i inställningarna,
  så att t.ex. ej påbörjade objekt kan tonas ner utan att döljas helt.
- **Justerbar uppspelningshastighet**: hur många sekunder realtid varje
  simulerad dag ska visas när man trycker på "spela upp" (▶) på
  tidslinjen går att ställa in i inställningarna.
- **Visa kopplade objekts namn som 3D-etiketter**: knappen "Visa namn i 3D"
  i objektlistan ritar ut varje kopplat objekts namn (t.ex. rutnätsbeteckningar
  som K16, J18) som textetiketter i 3D-vyn, så att man visuellt kan
  kontrollera att rätt objekt är kopplade utan att öppna sidopanelens lista.
  "Rensa etiketter" tar bort dem igen. (Etiketterna använder Trimble Connects
  inbyggda textmarkup-funktion, som har fast utseende – font och
  bakgrundsfärg går inte att anpassa.)
- **Ihopfällbara paneler**: klicka på en panelrubrik (t.ex. "Koppla
  markering", "Tidslinje", "Filter") för att minimera den och få mer
  utrymme i sidopanelen. Vilka paneler som är minimerade sparas lokalt i
  webbläsaren och finns kvar nästa gång du öppnar extensionen.
- **Radera en koppling**: soptunneknappen (🗑️) på varje rad i "Planerade
  objekt" tar bort planeringskopplingen för det objektet, efter en
  bekräftelsefråga ("Är du säker på att du vill radera kopplingen?").
  Själva 3D-objektet i modellen påverkas inte – bara planeringsdatan i
  databasen.
- **Markera flera objekt samtidigt i listan**: håll in Ctrl (⌘ på Mac) och
  klicka på flera rader i "Planerade objekt" för att lägga till/ta bort dem
  ur markeringen, eller håll in Shift och klicka för att markera hela
  intervallet mellan senast klickade rad och den nya (som i Utforskaren) –
  samma objekt markeras då automatiskt även i 3D-vyn, så att t.ex. 8 objekt
  kan väljas på en gång utan att behöva klicka blint i modellen. Ett
  vanligt klick (utan Ctrl/Shift) ersätter markeringen med bara den raden.
- **Radera flera kopplingar på en gång**: knappen "Radera markerade" under
  listan tar bort planeringskopplingen för alla markerade rader i ett svep,
  efter en bekräftelsefråga. Precis som vid enskild radering påverkas bara
  planeringsdatan – 3D-objekten i modellen ligger kvar. Stora markeringar
  (t.ex. tusentals objekt) delas automatiskt upp i flera mindre
  databasanrop i bakgrunden, så det finns ingen praktisk gräns för hur
  många man kan radera på en gång.
- **Ändra höjden på objektlistan**: dra i det lilla handtaget längst ner i
  högra hörnet av listan "Planerade objekt" för att göra den högre eller
  lägre, så att fler (eller färre) rader syns samtidigt.
- **Status "Ej planerad"**: ett extra statusalternativ (utöver Planerad,
  Pågående, Försenad, Klar, Pausad) för objekt som är kopplade men ännu
  inte har någon verklig plan – går att välja i formuläret, filtrera på
  och skriva i Excel-importen.

## Arkitektur

```
docs/              -> Frontend som körs inuti Trimble Connect (sidopanel)
                     index.html + app.js + style.css + manifest.json
                     Hostas gratis via GitHub Pages direkt från repot.
supabase/
  schema.sql       -> SQL-skript som skapar databastabellen, körs en gång.
```

Det finns **ingen egen server längre**. Tidigare version använde en egen
Node/Express-server med SQLite, men den gick aldrig att hosta gratis på
ett tillförlitligt sätt (gratis-nivåer för servrar med beständig disk är
antingen tidsbegränsade eller kräver betalkort). Extensionen pratar nu
direkt med **Supabase** – en gratis Postgres-databas som har ett
färdigbyggt REST-API (PostgREST) inbyggt, så ingen egen backend-kod
behöver driftas eller hållas vid liv.

```
Trimble Connect (3D-visare)
   -> docs/ (statiska filer på GitHub Pages, gratis, direkt från repot)
        -> REST-anrop direkt till https://<ditt-projekt>.supabase.co
             -> Supabase (Postgres-databas, gratis nivå)
```

> **Varför GitHub Pages och inte t.ex. Netlify?** GitHub Pages hostar
> statiska filer direkt från repot utan några kredit- eller
> byggminuts-gränser att råka slå i. Netlify användes tidigare men pausar
> nya deploys när gratiskontots byggkrediter tar slut för perioden – då
> slutar ändringar synas i Trimble Connect trots att de ligger pushade på
> GitHub. GitHub Pages har ingen sådan gräns för statiska filer.

## Datamodell (per objekt)

| Fält        | Beskrivning                                      |
|-------------|---------------------------------------------------|
| objectId    | Objektets externa ID (IFC GUID) – stabilt över tid |
| modelId     | Vilken modell objektet tillhör                   |
| area        | Område                                           |
| activity    | Aktivitet                                        |
| contractor  | Entreprenör                                      |
| status      | ej_planerad / planerad / pagaende / forsenad / klar / pausad |
| startDate   | Planerat startdatum (ÅÅÅÅ-MM-DD)                 |
| endDate     | Planerat slutdatum (ÅÅÅÅ-MM-DD)                  |

Tidslinjens tre färger räknas fram automatiskt utifrån valt datum jämfört
med start-/slutdatum – de är alltså skilda från fältet "status", som är
till för filtrering/rapportering (t.ex. att markera förseningar).

## Komma igång

### 1. Skapa ett gratis Supabase-projekt

1. Gå till [supabase.com](https://supabase.com) och skapa ett konto
   (inget betalkort krävs för gratisnivån).
2. Klicka **New project**. Välj namn, ett databaslösenord (spara det
   någonstans säkert – det behövs sällan men gå inte förlorat) och en
   region nära er, t.ex. Frankfurt eller Stockholm om det finns.
3. Vänta tills projektet är klart (tar ca en minut).

### 2. Skapa databastabellen

1. Öppna **SQL Editor** i vänstermenyn -> **New query**.
2. Öppna filen [`supabase/schema.sql`](supabase/schema.sql) i det här
   repot, kopiera hela innehållet och klistra in i SQL Editor.
3. Klicka **Run**. Det skapar tabellen `plan_items` samt de
   behörighetsregler (RLS-policy) som extensionen behöver.

### 3. Hämta URL och nyckel

1. Öppna **Project Settings** (kugghjulet) -> **API**.
2. Kopiera **Project URL** (ser ut som `https://xxxxx.supabase.co`).
3. Kopiera nyckeln under **Project API keys** som heter **anon** /
   **public** (inte `service_role` – den ska aldrig användas i en
   webbextension).

### 4. Publicera frontend (GitHub Pages)

Extensionen är en helt statisk webbsida (`docs/index.html` + `docs/app.js`
+ `docs/style.css`), så den hostas gratis direkt från repot via GitHub
Pages – ingen extern tjänst, inget kontokrav och inga kredit-/
byggminutsgränser att slå i:

1. Gå till repots **Settings → Pages**.
2. Under **Build and deployment**, välj **Deploy from a branch**.
3. Välj branch `main` och mapp `/docs`, spara.
4. Efter någon minut är sidan live på
   `https://<ditt-github-användarnamn>.github.io/4D-planering/`.
5. Uppdatera `url` i `docs/manifest.json` om adressen skiljer sig från
   den som redan står där (t.ex. om användarnamnet ändras).

Varje ny `git push` till `main` publiceras automatiskt igen inom någon
minut – helt utan kredit- eller byggkvoter att ta slut.

### 5. Koppla extensionen till databasen

1. Öppna projektet i Trimble Connect for Browser och aktivera
   extensionen (se nästa steg om den inte redan är tillagd).
2. Klicka på kugghjulet (⚙) uppe till höger i panelen.
3. Klistra in **Supabase-URL** och **anon key** från steg 3.
4. Klicka **Spara**. Varningen "Ingen databas ansluten" ska försvinna.

Uppgifterna sparas lokalt i webbläsaren (`localStorage`) hos varje
användare, precis som färginställningarna gjorde tidigare – själva
planeringsdatan delas dock av alla via Supabase.

### 6. Registrera extensionen i Trimble Connect (om det inte redan är gjort)

1. Öppna projektet i Trimble Connect for Browser.
2. Inställningar → Extensions.
3. Ange manifest-URL:en, t.ex.
   `https://<ditt-github-användarnamn>.github.io/4D-planering/manifest.json`,
   och lägg till. (Om du tidigare registrerat den gamla Netlify-URL:en
   behöver du ta bort den och lägga till den nya GitHub Pages-URL:en i
   stället – Trimble Connect byter inte URL automatiskt.)
4. Aktivera extensionen under "Custom Extensions".

## Excel-import – automatisk uppdatering

I den här grundversionen läser användaren in filen manuellt via
"Importera"-knappen, vilket uppdaterar planeringen direkt i modellen.

**Verklig automatik** (filen uppdateras och modellen följer med utan
manuellt klick) skulle kräva att något pollar filen med jämna mellanrum
och skriver till Supabase, t.ex. en schemalagd Supabase Edge Function
som läser filen från en delad mapp (SharePoint/OneDrive) eller från
Trimble Connects egna filer via dess REST-API. Kryssrutan "Bevaka fil
för automatisk uppdatering" i gränssnittet är en platshållare för detta.

## Viktiga begränsningar att känna till

- **Max antal planerade objekt (1000-gränsen)**: extensionen hämtar nu upp
  till 50 000 rader per anrop (styrs av `ITEMS_FETCH_LIMIT` i `app.js`).
  Men Supabase/PostgREST har även en egen serverinställning, **Max Rows**
  (Project Settings → API, standard **1000**), som klipper av svaret
  oavsett vad klienten begär. Om du planerar in fler än 1000 objekt: höj
  Max Rows i Supabase-projektet till t.ex. 50000 också, annars visar
  extensionen fortfarande bara de första 1000 – och en varningstext dyker
  upp ovanför objektlistan ("Visar bara de första X av totalt Y...") om
  det händer, så du märker det direkt i stället för att gissa.
- **Flera modeller**: om projektet har flera modeller behöver
  Excel-filen även innehålla en `ModellID`-kolumn, annars antas objekten
  tillhöra samma modell som redan importerats.
- **Färgläggning är sessionsbaserad**: `viewer.setObjectState` färgar
  objekt i den aktuella visningen. Planeringsdatan i sig är permanent
  (lagras i Supabase); färgerna räknas om varje gång tidslinjen flyttas
  eller extensionen laddas om.
- **Selection-händelser**: exakt eventnamn för "objekt markerat i
  modellen" kan skilja mellan versioner av Trimble Connect. Just nu
  hämtas markeringen explicit när användaren trycker på "Koppla
  markerade objekt", vilket är robust oavsett eventnamn.
- **Säkerhet**: anon-nyckeln ger läs- och skrivåtkomst till alla som har
  den (se kommentaren i `supabase/schema.sql`). Det motsvarar samma
  öppenhetsnivå som den gamla backend-lösningen hade, men dela inte
  nyckeln i publika kanaler.
- Du kan när som helst öppna databasen direkt i Supabase (**Table
  editor** -> `plan_items`) för att granska eller manuellt rätta data.

## Nästa steg (utbyggnad)

- Behörighetsstyrning (Supabase Auth, endast vissa roller får ändra
  planeringen).
- Historik/logg per objekt (vem ändrade vad och när).
- Exportera lägesbild till PDF/bild för veckomöten.
- Koppling mot riktiga tidplaneverktyg (t.ex. MS Project) i stället för
  enbart Excel.
