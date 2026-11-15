@echo off
chcp 65001 >nul
title Installera Claude-bryggan till 4D-planering
echo.
echo === Installerar bryggan mellan Claude och 3D-editorn ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js saknas - installerar det nu...
  winget install -e --id OpenJS.NodeJS.LTS
  echo.
  echo KLART med Node. Stang det har fonstret, oppna ett NYTT kommandofonster och kor filen igen.
  pause
  exit /b
)

where git >nul 2>&1
if errorlevel 1 (
  echo Git saknas - installerar det nu...
  winget install -e --id Git.Git
  echo.
  echo KLART med Git. Stang det har fonstret, oppna ett NYTT kommandofonster och kor filen igen.
  pause
  exit /b
)

set DEST=%USERPROFILE%\4D-planering
if exist "%DEST%\.git" (
  echo Uppdaterar 4D-planering i %DEST% ...
  git -C "%DEST%" pull
) else (
  echo Hamtar 4D-planering till %DEST% ...
  git clone https://github.com/vfalk-NCC/4D-planering "%DEST%"
)
if not exist "%DEST%\tools\mcp\4d-bridge.mjs" (
  echo FEL: hittar inte bryggan i %DEST%\tools\mcp . Kontrollera att hamtningen lyckades.
  pause
  exit /b 1
)

where claude >nul 2>&1
if errorlevel 1 (
  echo Claude Code saknas - installerar det nu...
  call npm install -g @anthropic-ai/claude-code
)

echo Lagger till bryggan i Claude Code...
call claude mcp remove 4d-planering >nul 2>&1
call claude mcp add 4d-planering -- node "%DEST%\tools\mcp\4d-bridge.mjs"
echo.
echo === KLART ===
echo 1. Skriv  claude  i ett kommandofonster for att starta Claude.
echo 2. Oppna 3D-vyn i Chrome eller Edge och klicka 🔌 Claude nere till vanster.
echo.
pause
