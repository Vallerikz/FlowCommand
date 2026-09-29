@echo off
setlocal enabledelayedexpansion
title FlowCommand — VIMS Launcher
color 0A

echo ================================================================
echo   FlowCommand / VIMS — Portable Launcher
echo   Smart India Hackathon 2025 Prototype
echo ================================================================
echo.

:: ---- Configuration ----
set "PYTHON_VERSION=3.11.9"
set "PYTHON_DIR=%~dp0python"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"
set "VENV_DIR=%~dp0.venv"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"

:: ---- Step 1: Check / Install Python ----
if exist "%PYTHON_EXE%" (
    echo [OK] Embedded Python found at %PYTHON_DIR%
    goto :have_python
)

echo [..] Python not found locally. Downloading embedded Python %PYTHON_VERSION%...
echo     This is a one-time download (~25 MB). Please wait.

set "PY_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"
set "PY_ZIP=%~dp0python-embed.zip"

:: Use PowerShell to download (available on all modern Windows)
powershell -NoProfile -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%PY_ZIP%'"

if not exist "%PY_ZIP%" (
    echo [FAIL] Download failed. Check your internet connection.
    pause
    exit /b 1
)

echo [..] Extracting...
powershell -NoProfile -Command "Expand-Archive -Path '%PY_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force"
del "%PY_ZIP%" 2>nul

:: Enable pip in embedded Python (uncomment import site in python311._pth)
set "PTH_FILE=%PYTHON_DIR%\python311._pth"
if exist "%PTH_FILE%" (
    powershell -NoProfile -Command ^
        "(Get-Content '%PTH_FILE%') -replace '#import site','import site' | Set-Content '%PTH_FILE%'"
)

:: Install pip
echo [..] Installing pip...
powershell -NoProfile -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%~dp0get-pip.py'"
"%PYTHON_EXE%" "%~dp0get-pip.py" --no-warn-script-location >nul 2>&1
del "%~dp0get-pip.py" 2>nul

echo [OK] Embedded Python %PYTHON_VERSION% ready.

:have_python

:: ---- Step 2: Create venv if missing ----
if exist "%VENV_DIR%\Scripts\python.exe" (
    echo [OK] Virtual environment found.
    goto :have_venv
)

echo [..] Creating virtual environment...
"%PYTHON_EXE%" -m venv "%VENV_DIR%" 2>nul
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [NOTE] venv module unavailable in embedded build. Using embedded Python directly.
    set "PIP_EXE=%PYTHON_DIR%\Scripts\pip.exe"
    set "RUN_PYTHON=%PYTHON_EXE%"
    goto :install_deps
)

:have_venv
set "RUN_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "PIP_EXE=%VENV_DIR%\Scripts\pip.exe"

:install_deps
:: ---- Step 3: Install dependencies ----
echo [..] Installing dependencies from requirements.txt...
"%RUN_PYTHON%" -m pip install --quiet --disable-pip-version-check -r "%~dp0requirements.txt" 2>nul
if errorlevel 1 (
    echo [WARN] Some packages may have failed. Attempting to continue...
)
echo [OK] Dependencies installed.

:: ---- Step 4: Start Backend (uvicorn) ----
echo [..] Starting backend on port %BACKEND_PORT%...
start /b "" "%RUN_PYTHON%" -m uvicorn backend.junction_router:app --host 0.0.0.0 --port %BACKEND_PORT% >nul 2>&1

:: Give it a moment to bind
timeout /t 3 /nobreak >nul

:: ---- Step 5: Start Frontend (http.server) ----
echo [..] Starting frontend on port %FRONTEND_PORT%...
start /b "" "%RUN_PYTHON%" -m http.server %FRONTEND_PORT% --directory "%~dp0." >nul 2>&1

timeout /t 2 /nobreak >nul

:: ---- Step 6: Open browser ----
echo [OK] Launching browser...
start "" "http://localhost:%FRONTEND_PORT%/index.html"

echo.
echo ================================================================
echo   FlowCommand is running.
echo   Backend  : http://localhost:%BACKEND_PORT%
echo   Frontend : http://localhost:%FRONTEND_PORT%
echo.
echo   Press Ctrl+C or close this window to stop all services.
echo ================================================================

:: Keep window open so background processes stay alive
pause >nul
