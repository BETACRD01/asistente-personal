@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo [1/4] Verificando Python...
python --version >nul 2>nul || (echo Falla: instala Python 3 y anadelo al PATH & pause & exit /b 1)

if not exist .venv (
  echo [2/4] Creando .venv...
  python -m venv .venv || (echo Falla al crear .venv & pause & exit /b 1)
)

echo [3/4] Instalando dependencias...
call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt || (echo Falla al instalar dependencias & pause & exit /b 1)

if not exist .env (
  echo [4/4] Generando .env con tokens nuevos...
  for /f %%i in ('python -c "import secrets;print(secrets.token_urlsafe(32))"') do set "DEV=%%i"
  for /f %%i in ('python -c "import secrets;print(secrets.token_urlsafe(16))"') do set "TERM=%%i"
  (
    echo HUB_WS_URL=wss://agentrelay.duckdns.org/ws/mac
    echo DEVICE_TOKEN=!DEV!
    echo TERM_TOKEN=!TERM!
  )> .env
  echo.
  echo ==============================================================
  echo   NUEVO DEVICE_TOKEN (registralo en el hub, DEVICE_TOKENS):
  echo   !DEV!
  echo ==============================================================
  echo.
) else (
  echo [4/4] .env ya existe (no lo toco)
)

echo Arrancando term_server.py (en Windows: PTY interactivo y tunel soportados)...
python term_server.py
pause