@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ belum terpasang. Pasang Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)
if not exist "node_modules\wrangler\bin\wrangler.js" (
  echo Memasang Wrangler dan dependensi development...
  call npm install
  if errorlevel 1 (
    echo Instalasi npm gagal. Periksa internet dan coba lagi.
    pause
    exit /b 1
  )
)
echo Buka browser: http://localhost:8788
call npm run dev
pause
