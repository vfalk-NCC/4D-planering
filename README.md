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
  utan alfabetisk sortering inom varje grupp.
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

## Arkitektur

```
extension/        -> Frontend som körs inuti Trimble Connect (sidopanel)
                     index.html + app.js + style.css
                     Hostas gratis som statiska filer (t.ex. Netlify).
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
   -> extension/ (statiska filer på Netlify, gratis)
        -> REST-anrop direkt till https://<ditt-projekt>.supabase.co
             -> Supabase (Postgres-databas, gratis nivå)
```

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

### 4. Publicera frontend

Lägg `extension/`-mappen på valfri gratis statisk webbhotell/CDN, t.ex.
[Netlify](https://netlify.com) (dra-och-släpp mappen, eller koppla mot
GitHub-repot för automatisk publicering vid varje push). Uppdatera
`extension/manifest.json` med rätt URL om domänen ändras.

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
3. Ange manifest-URL:en (t.ex. `https://<din-domän>/manifest.json`) och
   lägg till.
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
