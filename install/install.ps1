<#
 4D-planering – skrivbordsinstallation (per användare, kräver INTE administratör).
 Kör från cmd:
   powershell -NoProfile -Command "irm https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main/install/install.ps1 | iex"
 Välj läge med miljövariabeln PLANERING_MODE före körning:
   app       (standard) Edge/Chrome i eget appfönster med egen profil – ingen ny exe behövs
   electron  eget program (Electron) som hämtas till din användarmapp
 Allt hamnar i %LOCALAPPDATA%\4D-planering. Avinstallera: install\uninstall.cmd eller ta bort mappen och genvägarna.
#>
$ErrorActionPreference = "Stop"
$Repo = "https://raw.githubusercontent.com/vfalk-NCC/4D-planering/main"
$AppUrl = "https://vfalk-ncc.github.io/4D-planering/index.html"
$Dir = Join-Path $env:LOCALAPPDATA "4D-planering"
$Mode = if ($env:PLANERING_MODE) { $env:PLANERING_MODE.ToLower() } else { "app" }
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Get-File($url, $out) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out }

# Ikon (PNG inbäddad i .ico)
$ico = Join-Path $Dir "4D-planering.ico"
try {
  $png = Join-Path $Dir "icon.png"; Get-File "https://vfalk-ncc.github.io/4D-planering/icons/lagesplan-180.png" $png
  $b = [IO.File]::ReadAllBytes($png); $ms = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter($ms)
  $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1); $w.Write([byte]180); $w.Write([byte]180); $w.Write([byte]0); $w.Write([byte]0); $w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$b.Length); $w.Write([UInt32]22); $w.Write($b)
  [IO.File]::WriteAllBytes($ico, $ms.ToArray())
} catch { $ico = $null }

function New-Shortcut($path, $target, $arguments, $icon) {
  $sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut($path)
  $s.TargetPath = $target; $s.Arguments = $arguments; $s.WorkingDirectory = $Dir; $s.Description = "4D-planering"
  if ($icon) { $s.IconLocation = $icon }
  $s.Save()
}
$Start = Join-Path ([Environment]::GetFolderPath("Programs")) "4D-planering.lnk"
$Desk = Join-Path ([Environment]::GetFolderPath("Desktop")) "4D-planering.lnk"

if ($Mode -eq "electron") {
  $ver = "31.7.7"; $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $zip = Join-Path $env:TEMP "electron-$ver.zip"; $ex = Join-Path $Dir "electron"
  Write-Host "Hämtar Electron $ver ($arch)…"
  Get-File "https://github.com/electron/electron/releases/download/v$ver/electron-v$ver-win32-$arch.zip" $zip
  if (Test-Path $ex) { Remove-Item -Recurse -Force $ex }
  Expand-Archive -Path $zip -DestinationPath $ex -Force; Remove-Item $zip -Force
  $appDir = Join-Path $ex "resources\app"; New-Item -ItemType Directory -Force -Path $appDir | Out-Null
  Get-File "$Repo/install/electron/main.js" (Join-Path $appDir "main.js"); Get-File "$Repo/install/electron/package.json" (Join-Path $appDir "package.json")
  Rename-Item (Join-Path $ex "electron.exe") "4D-planering.exe" -Force
  $exe = Join-Path $ex "4D-planering.exe"
  New-Shortcut $Start $exe "" $ico; New-Shortcut $Desk $exe "" $ico
} else {
  $cands = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
  $br = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $br) { throw "Hittade varken Edge eller Chrome. Kör med PLANERING_MODE=electron istället." }
  $prof = Join-Path $Dir "profil"
  $appArgs = "--app=$AppUrl --user-data-dir=`"$prof`" --no-first-run --no-default-browser-check --disable-features=Translate"
  New-Shortcut $Start $br $appArgs $ico; New-Shortcut $Desk $br $appArgs $ico
}
Write-Host ""
Write-Host "Klart! 4D-planering finns nu på skrivbordet och i Start-menyn ($Mode-läge)."
Write-Host "Starta den en gång med nät (då sparas appen för offline-läge). Mapp: $Dir"
