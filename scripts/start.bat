@echo off
setlocal enabledelayedexpansion
pushd "%~dp0.."
set "ROOT_DIR=%CD%"
title FlowCommand — VIMS CLI Launcher
color 0A

echo ================================================================
echo   FlowCommand / VIMS — CLI Portable Launcher
echo   Smart India Hackathon 2026 Prototype
echo ================================================================
echo.

:: ---- Configuration ----
set "PYTHON_VERSION=3.11.9"
set "PYTHON_DIR=%ROOT_DIR%\python"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"
set "VENV_DIR=%ROOT_DIR%\.venv"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"

:: ---- Step 1: Check / Install Python ----
if exist "%PYTHON_EXE%" (
    echo [OK] Embedded Python found at %PYTHON_DIR%
    goto :have_python
)

:: Check system python
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "SYS_PY=%%v"
    echo [OK] System Python found: !SYS_PY!
    set "PYTHON_EXE=python"
    goto :have_python
)

echo [..] Python not found locally. Downloading embedded Python %PYTHON_VERSION%...
echo     This is a one-time download (~25 MB). Please wait.

set "PY_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"
set "PY_ZIP=%ROOT_DIR%\python-embed.zip"

powershell -NoProfile -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%PY_ZIP%'"

if not exist "%PY_ZIP%" (
    echo [FAIL] Download failed. Check your internet connection.
    pause
    popd
    exit /b 1
)

echo [..] Extracting...
powershell -NoProfile -Command "Expand-Archive -Path '%PY_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force"
del "%PY_ZIP%" 2>nul

:: Enable pip in embedded Python
set "PTH_FILE=%PYTHON_DIR%\python311._pth"
if exist "%PTH_FILE%" (
    powershell -NoProfile -Command ^
        "(Get-Content '%PTH_FILE%') -replace '#import site','import site' | Set-Content '%PTH_FILE%'"
)

:: Install pip
echo [..] Installing pip...
powershell -NoProfile -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%ROOT_DIR%\get-pip.py'"
"%PYTHON_EXE%" "%ROOT_DIR%\get-pip.py" --no-warn-script-location >nul 2>&1
del "%ROOT_DIR%\get-pip.py" 2>nul

echo [OK] Embedded Python %PYTHON_VERSION% ready.

:have_python
:: ---- Step 2: Set up Virtual Environment ----
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"

if exist "%VENV_PYTHON%" (
    echo [OK] Virtual environment exists.
    goto :venv_ready
)

echo [..] Creating virtual environment...
"%PYTHON_EXE%" -m venv "%VENV_DIR%"
if not exist "%VENV_PYTHON%" (
    echo [WARN] venv creation failed. Running directly with %PYTHON_EXE%.
    set "VENV_PYTHON=%PYTHON_EXE%"
    set "VENV_PIP=%PYTHON_EXE% -m pip"
    goto :install_deps
)

:venv_ready
echo [OK] Virtual environment ready.

:install_deps
:: ---- Step 3: Install Dependencies ----
echo [..] Checking dependencies...
"%VENV_PYTHON%" -m pip install -r "%ROOT_DIR%\requirements.txt" --quiet --disable-pip-version-check
echo [OK] Dependencies installed.

:: ---- Step 4: Launch Backend ----
echo [..] Starting VIMS backend (FastAPI) on port %BACKEND_PORT%...
start "VIMS Backend" /b "%VENV_PYTHON%" -m uvicorn backend.main:app --host 0.0.0.0 --port %BACKEND_PORT%

:: ---- Step 5: Launch Frontend ----
echo [..] Starting VIMS frontend (HTTP Server) on port %FRONTEND_PORT%...
start "VIMS Frontend" /b "%VENV_PYTHON%" -m http.server %FRONTEND_PORT% --directory "%ROOT_DIR%"

:: ---- Step 6: Wait and Open Browser ----
echo [..] Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo [OK] Opening dashboard in browser...
start http://localhost:%FRONTEND_PORT%/index.html

echo.
echo ================================================================
echo   FlowCommand / VIMS is RUNNING!
echo.
echo   Frontend : http://localhost:%FRONTEND_PORT%/index.html
echo   Backend  : http://localhost:%BACKEND_PORT%/docs
echo.
echo   Demo Officer: Badge MH-PI-4501  ^| Pass admin123 ^| OTP 123456
echo   Demo Citizen: Mobile 9876543210 ^| OTP 123456
echo.
echo   Keep this window open. Press Ctrl+C or close to exit.
echo ================================================================
echo.

pause >nul
popd
