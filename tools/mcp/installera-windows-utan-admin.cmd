@echo off
chcp 65001 >nul
title Installera Claude-bryggan (utan administrator)
set DEST=%USERPROFILE%\4D-brygga
set NODEVER=22.12.0
set NODEDIR=%DEST%\node-v%NODEVER%-win-x64
set NODE=%NODEDIR%\node.exe
set RAW=https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main/tools/mcp
echo.
echo === Installerar bryggan mellan Claude och 3D-editorn (kraver inte administrator) ===
echo Allt hamnar i %DEST%
echo.
if not exist "%DEST%\mcp" mkdir "%DEST%\mcp"

if not exist "%NODE%" (
  echo 1/3 Hamtar Node.js (portabel version, ca 30 MB)...
  curl -L -f -o "%DEST%\node.zip" https://nodejs.org/dist/v%NODEVER%/node-v%NODEVER%-win-x64.zip
  if errorlevel 1 ( echo FEL: kunde inte hamta Node. Kontrollera natverket. & pause & exit /b 1 )
  tar -xf "%DEST%\node.zip" -C "%DEST%"
  del "%DEST%\node.zip" >nul 2>&1
) else (
  echo 1/3 Node finns redan.
)
if not exist "%NODE%" ( echo FEL: Node packades inte upp. & pause & exit /b 1 )

echo 2/3 Hamtar bryggan...
curl -L -f -o "%DEST%\mcp\4d-bridge.mjs" %RAW%/4d-bridge.mjs
if errorlevel 1 ( echo FEL: kunde inte hamta 4d-bridge.mjs & pause & exit /b 1 )
curl -L -f -o "%DEST%\mcp\tools.json" %RAW%/tools.json
if errorlevel 1 ( echo FEL: kunde inte hamta tools.json & pause & exit /b 1 )

echo 3/3 Kontrollerar...
"%NODE%" --version
"%NODE%" --check "%DEST%\mcp\4d-bridge.mjs"
if errorlevel 1 ( echo FEL: bryggan gar inte att lasa. & pause & exit /b 1 )

where claude >nul 2>&1
if not errorlevel 1 (
  echo Lagger till bryggan i Claude Code...
  call claude mcp remove 4d-planering >nul 2>&1
  call claude mcp add 4d-planering -- "%NODE%" "%DEST%\mcp\4d-bridge.mjs"
  echo Klart i Claude Code.
) else (
  echo Claude Code hittades inte i det har fonstret - hoppar over det steget.
)

echo.
echo === KLART ===
echo.
echo CLAUDE DESKTOP: ga till Settings - Developer - Edit Config och lagg in detta under mcpServers:
echo.
echo   "4d-planering": { "command": "%NODE:\=\\%", "args": ["%DEST:\=\\%\\mcp\\4d-bridge.mjs"] }
echo.
echo Starta sedan om Claude Desktop. Oppna 3D-vyn i Chrome/Edge och klicka "Claude" nere till vanster.
echo.
pause
