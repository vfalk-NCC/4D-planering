@echo off
rem Tar bort 4D-planering (genvagar och mappen i %LOCALAPPDATA%). Data i GitHub (4D-data) paverkas inte.
del "%USERPROFILE%\Desktop\4D-planering.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\4D-planering.lnk" 2>nul
rmdir /s /q "%LOCALAPPDATA%\4D-planering"
echo Borttaget.
pause
