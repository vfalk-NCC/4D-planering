# 4D-planering som skrivbordsprogram

Installeras per användare i `%LOCALAPPDATA%\4D-planering` – **ingen administratör behövs**.

## Installera (cmd)
```
powershell -NoProfile -Command "irm https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main/install/install.ps1 | iex"
```
Eller ladda ner `install.cmd` och dubbelklicka.

* **Standard (appläge):** skapar genvägar som öppnar appen i Edge/Chrome i ett eget fönster (utan adressfält) med en egen profil.
  Ingen ny exe-fil behövs.
* **Eget program (Electron):** `set PLANERING_MODE=electron` före körning – hämtar Electron till din användarmapp och skapar `4D-planering.exe`.

## Offline
Starta appen en gång med nät. Därefter laddas program och senast hämtade data från cache. Ändringar utan nät väntar i kö och skickas när nätet är tillbaka
(har någon annan ändrat samma fil skrivs inget över – ändringen markeras som konflikt).

## Uppdateringar
Appen laddas från GitHub Pages och uppdateras av sig själv vid start (när nät finns).

## Avinstallera
`uninstall.cmd` (tar bort genvägar och mappen; dina data i GitHub påverkas inte).

> Om företagets IT-regler blockerar körning av skript eller program: be IT godkänna 4D-planering – installationen försöker inte gå runt några säkerhetsfunktioner.
