@echo off
chcp 65001 >nul
setlocal
set "SITE_ROOT=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js или запустите предпросмотр из Codex.
  pause
  exit /b 1
)
start "Horovod Preview Server" /min node "%SITE_ROOT%tools\preview-server.mjs" "%SITE_ROOT%" 4173
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/horovod/"
endlocal
