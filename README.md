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
- Excel-import: en fil med kolumnerna `ObjektID, Namn, Område, Aktivitet,
  Entreprenör, Status, Startdatum, Slutdatum` läses in och skriver/uppdaterar
  planeringen. Data sparas i en databas (inte i webbläsaren) så att den
  finns kvar mellan sessioner och delas mellan alla i projektet.
- **Excel-export**: knappen "Exportera till Excel" i samma panel skriver ut
  en `.xlsx`-fil med exakt samma kolumner som importen (`ObjektID, Namn,
  Område, Aktivitet, Entreprenör, Status, Startdatum, Slutdatum`), så filen
  går att redigera och importera tillbaka rakt av. Exporten respekterar det
  som just nu visas i "Planerade objekt" – dvs. sökningen och ev. "Dölj
  klarmarkerade" – men inte grupperingen, som bara organiserar listan.
  Filen namnges `4D-planering-ÅÅÅÅ-MM-DD.xlsx`.
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
- **Visa markerade objekts namn och datum som 3D-etiketter**: knappen "Visa
  namn i 3D" i objektlistan ritar ut namn samt planerat start-/slutdatum
  (t.ex. "K16" och "260101 - 260105" på en egen rad, i det korta
  formatet ÅÅMMDD för att inte bli för mycket text) som textetiketter i
  3D-vyn – men bara för de rader som just då är markerade i "Planerade
  objekt" (samma Ctrl/Cmd- och Shift-markering som används för "Radera
  markerade"), inte alla kopplade objekt. Knappen är inaktiv tills minst en
  rad är markerad. "Rensa etiketter" tar bort dem igen. (Etiketterna
  använder Trimble Connects inbyggda textmarkup-funktion, som har fast
  utseende – font och bakgrundsfärg går inte att anpassa.)
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
- **Framdriftsprocent**: varje objekt har ett eget reglage (0–100 %) i
  "Koppla markering"/redigeringsformuläret för att ange hur långt kommet
  det är. Procenten visas i objektlistan tillsammans med en liten
  förloppsstapel under varje rad.
- **Planerat start-/slutdatum i listan**: "Planerade objekt" visar nu
  datumintervallet (t.ex. "2026-02-01 → 2026-02-10") direkt i listan, inte
  bara i redigeringsformuläret.
- **Kommentarer på objekt**: 💬-knappen på varje rad öppnar en
  kommentarstråd för det objektet – ungefär som cellkommentarer i Excel.
  Varje kommentar loggas med namn och datum/tid, och går att svara på
  (svaren visas indragna under sin kommentar). Namnet du senast skrev in
  sparas lokalt och förifylls nästa gång. Så fort ett objekt har minst en
  kommentar syns en liten siffra ovanpå 💬-knappen på dess rad (antal
  kommentarer, inkl. svar), så att man ser vilka objekt som diskuterats utan
  att behöva öppna varje kommentarstråd.
- **Lösenordsgrind**: extensionen visar "Du har ej åtkomst" tills rätt
  lösenord anges (se avsnittet nedan). Enbart en enkel klientsidesspärr,
  inte riktig säkerhet.
- **Dölj klarmarkerade objekt**: kryssrutan "Dölj klarmarkerade" ovanför
  listan filtrerar bort alla objekt med status "Klar", oavsett om listan
  samtidigt är grupperad (område/aktivitet/entreprenör/status) eller
  sorterad – de två går att kombinera fritt.
- **Endast idag**: kryssrutan "Endast idag" ovanför listan visar bara
  objekt som pågår just idag (dagens datum ligger mellan start- och
  slutdatum, eller startdatum har passerat utan att slutdatum är satt) –
  bra snabböverblick t.ex. inför ett morgonmöte. Går att kombinera fritt
  med "Dölj klarmarkerade"/"Visa endast klarmarkerade".
- **Redigera markerade**: knappen "✏️ Redigera markerade" under listan
  ändrar status, entreprenör, område och/eller aktivitet på alla markerade
  rader i ett svep (lämna ett fält tomt för att inte ändra det), och kan
  även förskjuta start-/slutdatum ett valfritt antal dagar framåt eller
  bakåt – t.ex. för att flytta hela nästa veckas objekt en vecka framåt.
- **Automatisk status "Klar" vid ifyllt verkligt avslut**: fyller man i
  "Verkligt avslut" för hand i "Koppla markering" sätts statusen
  automatiskt till "Klar" (om den inte redan är det) – speglar den
  omvända auto-ifyllningen (Klar → dagens datum i Verkligt avslut).
- **Underaktiviteter (datumhjälp) i "Koppla markering"**: knappen "+ Lägg
  till delaktivitet" låter dig lägga till flera aktivitet+datum-rader
  (t.ex. Formning, Gjutning) för samma koppling. Så länge minst en rad
  finns räknas Aktivitet (ihopslagna namn), Startdatum (tidigaste) och
  Slutdatum (senaste) automatiskt fram och går inte att skriva för hand –
  ta bort alla delaktivitetsrader igen för att skriva dem manuellt som
  förut. Delaktiviteterna sparas inte som egna poster, bara det
  sammanslagna resultatet.

## Arkitektur

```
docs/              -> Frontend som körs inuti Trimble Connect (sidopanel)
                     index.html + app.js + github-storage.js + style.css + manifest.json
                     Hostas gratis via GitHub Pages direkt från det här (publika) repot.
```

Det finns **ingen egen server och ingen extern databastjänst längre**.
Tidigare versioner använde först en egen Node/Express-server med SQLite,
sedan Supabase (Postgres). Båda är borta nu – all lagring ligger i stället
i ett separat, **privat** GitHub-repo (`vfalk-NCC/4D-data`), som nås
direkt från klienten via GitHub Contents API, precis som Supabase nåddes
direkt via PostgREST tidigare:

```
Trimble Connect (3D-visare)
   -> docs/ (statiska filer på GitHub Pages, gratis, direkt från DETTA repot)
        -> GitHub Contents API mot det PRIVATA repot vfalk-NCC/4D-data
             -> projects/<projekt-id>/<tabell>.json (en fil per "tabell" och Trimble-projekt)
```

Varför två repon? GitHub Pages kräver ett publikt repo för att hosta gratis
– men publik data hade gjort all planeringsdata (namn, kommentarer,
bemanning m.m.) sökbar för vem som helst på internet. Lösningen är att
hålla dem isär: det här repot (`4D-planering`) är publikt och innehåller
bara själva appkoden (ingen känslig data), medan `4D-data` är privat och
innehåller all faktisk data. Se `GITHUB_TOKEN_SETUP.md` (skickat separat)
för hur åtkomsten till `4D-data` sätts upp.

> **Viktigt att känna till**: token:en som ger åtkomst till `4D-data`
> blir lika synlig i klientkoden/`localStorage` som den gamla Supabase
> anon-nyckeln var – samma förtroendemodell, bara en annan leverantör.
> Den är scopead till enbart detta ena repo för att begränsa skadan om
> den läcker.

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

### 1. Skapa en GitHub-token för datalagret

All data lagras i det privata repot `vfalk-NCC/4D-data`. Se
`GITHUB_TOKEN_SETUP.md` (skickad separat) för hur du skapar en
fine-grained personal access token scopead till enbart det repot – tar
under en minut och behöver bara göras en gång (samma token används i
både 4D-planering och 4D-dashboard).

### 2. Publicera frontend (GitHub Pages)

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

### 3. Koppla extensionen till datalagret

1. Öppna projektet i Trimble Connect for Browser och aktivera
   extensionen (se nästa steg om den inte redan är tillagd).
2. Om lösenordsgrinden visas ("Du har ej åtkomst"): ange lösenordet.
3. Klicka på kugghjulet (⚙) uppe till höger i panelen.
4. Klistra in **GitHub-token** från steg 1.
5. Klicka **Spara**. Varningen om saknad token ska försvinna.

Token:en sparas lokalt i webbläsaren (`localStorage`) hos varje
användare, precis som Supabase-uppgifterna gjorde tidigare – själva
planeringsdatan delas dock av alla via det privata `4D-data`-repot.

### 4. Registrera extensionen i Trimble Connect (om det inte redan är gjort)

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
och skriver till `4D-data`-repot, t.ex. ett schemalagt skript som läser
filen från en delad mapp (SharePoint/OneDrive) eller från Trimble
Connects egna filer via dess REST-API. Kryssrutan "Bevaka fil för
automatisk uppdatering" i gränssnittet är en platshållare för detta.

## Viktiga begränsningar att känna till

- **Lösenordsgrinden är ingen riktig säkerhet**: "Du har ej åtkomst" /
  lösenordet är enbart en klientsidesspärr för att hålla utomstående ute
  av misstag. Koden och all data är fortsatt fullt synlig för den som
  öppnar webbläsarens utvecklarverktyg.
- **GitHub-gränser**: GitHub Contents API tillåter 5000 anrop/timme
  generellt och 500/timme + 80/minut för skrivande anrop – gott om
  marginal för en handfull användare med manuell uppdatering, men gör
  extensionen inte om till ett högfrekvent integrationsverktyg (t.ex.
  automatisk polling var några sekunder).
- **Flera modeller**: om projektet har flera modeller behöver
  Excel-filen även innehålla en `ModellID`-kolumn, annars antas objekten
  tillhöra samma modell som redan importerats.
- **Färgläggning är sessionsbaserad**: `viewer.setObjectState` färgar
  objekt i den aktuella visningen. Planeringsdatan i sig är permanent
  (lagras i `4D-data`-repot); färgerna räknas om varje gång tidslinjen
  flyttas eller extensionen laddas om.
- **Selection-händelser**: exakt eventnamn för "objekt markerat i
  modellen" kan skilja mellan versioner av Trimble Connect. Just nu
  hämtas markeringen explicit när användaren trycker på "Koppla
  markerade objekt", vilket är robust oavsett eventnamn.
- **Säkerhet**: GitHub-token:en ger läs- och skrivåtkomst till alla som
  har den, precis som anon-nyckeln gjorde tidigare – skillnaden är att
  den är scopead till enbart det privata `4D-data`-repot. Dela den inte
  i publika kanaler.
- Du kan när som helst öppna `projects/<projekt-id>/plan_items.json`
  direkt i `vfalk-NCC/4D-data` på GitHub för att granska eller manuellt
  rätta data.

## Nästa steg (utbyggnad)

- Behörighetsstyrning (t.ex. olika token/roller för läs- kontra
  skrivåtkomst).
- Historik/logg per objekt (vem ändrade vad och när).
- Exportera lägesbild till PDF/bild för veckomöten.
- Koppling mot riktiga tidplaneverktyg (t.ex. MS Project) i stället för
  enbart Excel.
