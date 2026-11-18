@echo off
chcp 65001 >nul
title Claude + 3D-brygga
rem Startar Claude Code. Bryggan till 3D-editorn startar av sig sjalv nar Claude Code startar
rem (den lades till av installationsskriptet) och stangs nar du stanger Claude.
rem Vill du att 3D-editorn ska oppnas samtidigt: spara dess adress (en rad) i filen
rem   %USERPROFILE%\4D-brygga\editor-url.txt
set "DEST=%USERPROFILE%\4D-brygga"
set "PATH=%PATH%;%USERPROFILE%\.local\bin;%APPDATA%\npm"
if not exist "%DEST%" mkdir "%DEST%"
cd /d "%DEST%"
where claude >nul 2>&1
if errorlevel 1 goto saknas
echo.
echo === Claude + 3D-brygga ===
echo Bryggan startar automatiskt. Gor sa har i 3D-editorn:
echo   1. Oppna 3D-vyn i Chrome eller Edge.
echo   2. Klicka Claude nere till vanster (det ska stanna pa Ansluten).
echo   3. Skriv har i Claude vad den ska gora i 3D-vyn.
echo.
if not exist "%DEST%\editor-url.txt" goto start
set /p URL=<"%DEST%\editor-url.txt"
if "%URL%"=="" goto start
echo Oppnar 3D-editorn ...
start "" "%URL%"
:start
claude
goto slut
:saknas
echo.
echo Claude Code hittades inte. Installera det (eller kor installera-windows-utan-admin.cmd igen).
echo.
:slut
pause
