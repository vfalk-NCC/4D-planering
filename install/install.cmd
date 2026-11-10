@echo off
rem 4D-planering - skrivbordsinstallation (per anvandare, ingen administrator behovs).
rem Dubbelklicka eller kor i cmd. Valj eget program (Electron) istallet: set PLANERING_MODE=electron  fore kornigen.
powershell -NoProfile -Command "irm https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main/install/install.ps1 | iex"
if errorlevel 1 echo Installationen misslyckades. Se meddelandet ovan.
pause
