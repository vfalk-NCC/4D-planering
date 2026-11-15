@echo off
chcp 65001 >nul
title Installera Claude-bryggan - utan administrator
set "DEST=%USERPROFILE%\4D-brygga"
set "NODEVER=22.12.0"
set "NODEDIR=%DEST%\node-v%NODEVER%-win-x64"
set "NODE=%NODEDIR%\node.exe"
set "RAW=https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main/tools/mcp"
echo.
echo === Installerar bryggan mellan Claude och 3D-editorn ===
echo Kraver inte administrator. Allt hamnar i %DEST%
echo.
if not exist "%DEST%\mcp" mkdir "%DEST%\mcp"

if exist "%NODE%" goto harnode
echo 1/3 Hamtar Node.js - portabel version, ca 30 MB ...
curl -L -f -o "%DEST%\node.zip" https://nodejs.org/dist/v%NODEVER%/node-v%NODEVER%-win-x64.zip
if errorlevel 1 goto fel_node
tar -xf "%DEST%\node.zip" -C "%DEST%"
del "%DEST%\node.zip" >nul 2>&1
if not exist "%NODE%" goto fel_pack
goto brygga
:harnode
echo 1/3 Node finns redan.

:brygga
echo 2/3 Hamtar bryggan ...
curl -L -f -o "%DEST%\mcp\4d-bridge.mjs" %RAW%/4d-bridge.mjs
if errorlevel 1 goto fel_brygga
curl -L -f -o "%DEST%\mcp\tools.json" %RAW%/tools.json
if errorlevel 1 goto fel_brygga

echo 3/3 Kontrollerar ...
"%NODE%" --version
"%NODE%" --check "%DEST%\mcp\4d-bridge.mjs"
if errorlevel 1 goto fel_las

where claude >nul 2>&1
if errorlevel 1 goto utanclaude
echo Lagger till bryggan i Claude Code ...
call claude mcp remove 4d-planering >nul 2>&1
call claude mcp add 4d-planering -- "%NODE%" "%DEST%\mcp\4d-bridge.mjs"
echo Klart i Claude Code.
goto klart
:utanclaude
echo Claude Code hittades inte i det har fonstret - hoppar over det steget.

:klart
echo.
echo === KLART ===
echo.
echo CLAUDE DESKTOP: Settings - Developer - Edit Config. Lagg in raden nedan under mcpServers:
echo.
set "N2=%NODE:\=\\%"
set "D2=%DEST:\=\\%"
echo "4d-planering": { "command": "%N2%", "args": ["%D2%\\mcp\\4d-bridge.mjs"] }
echo.
echo Starta om Claude Desktop helt. Oppna 3D-vyn i Chrome eller Edge och klicka Claude nere till vanster.
goto slut

:fel_node
echo FEL: kunde inte hamta Node fran nodejs.org. Natverket kan blockera det.
goto slut
:fel_pack
echo FEL: Node packades inte upp. Radera mappen %DEST% och forsok igen.
goto slut
:fel_brygga
echo FEL: kunde inte hamta bryggan fran raw.githubusercontent.com.
goto slut
:fel_las
echo FEL: bryggan gar inte att lasa.

:slut
echo.
pause
