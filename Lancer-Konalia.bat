@echo off
chcp 65001 >nul
title Plateforme Noemie.K
cd /d "%~dp0"
echo.
echo === 1/3 Mise a jour depuis GitHub ===
git pull
cd naiom-platform
if not exist "%~d0\temp" mkdir "%~d0\temp"
set "TEMP=%~d0\temp"
set "PUPPETEER_CACHE_DIR=%~d0\puppeteer-cache"
echo.
echo === 2/3 Verification des composants ===
call npm install --no-audit --no-fund
echo.
echo === 3/3 Lancement : ouvre http://localhost:3000 dans ton navigateur ===
echo (Pour arreter la plateforme : Ctrl+C, puis ferme cette fenetre)
echo.
call npm run dev
pause
