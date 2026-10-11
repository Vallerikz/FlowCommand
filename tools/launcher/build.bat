@echo off
pushd "%~dp0"
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "OUT=..\..\FlowCommand.exe"
set "ICON=FlowCommand.ico"
set "ROOT=..\..\\"

echo ================================================================
echo   FlowCommand Build Script — Clean Build
echo ================================================================
echo.

echo [1/3] Creating clean project archive...
pushd "%ROOT%"
if exist "tools\launcher\project.zip" del "tools\launcher\project.zip"

:: Archive only essential files — exclude __pycache__, .pyc, dev files
powershell -NoProfile -Command ^
  "$root = Get-Location; " ^
  "$tempStaging = Join-Path $env:TEMP 'fc_staging'; " ^
  "if(Test-Path $tempStaging){Remove-Item $tempStaging -Recurse -Force}; " ^
  "New-Item $tempStaging -ItemType Directory | Out-Null; " ^
  "foreach($d in @('backend','js','assets','css')){" ^
  "  if(Test-Path $d){" ^
  "    Copy-Item $d $tempStaging\$d -Recurse -Force; " ^
  "    Get-ChildItem $tempStaging\$d -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force -EA SilentlyContinue; " ^
  "    Get-ChildItem $tempStaging\$d -Recurse -File -Filter '*.pyc' | Remove-Item -Force -EA SilentlyContinue; " ^
  "  }" ^
  "}; " ^
  "foreach($f in @('index.html','command.html','dashboard.html','citizen.html','requirements.txt')){" ^
  "  if(Test-Path $f){Copy-Item $f $tempStaging\$f}" ^
  "}; " ^
  "$items = Get-ChildItem $tempStaging; " ^
  "if($items.Count -gt 0){" ^
  "  Compress-Archive -Path $items.FullName -DestinationPath 'tools\launcher\project.zip' -Force; " ^
  "  Write-Host '[OK] Archive created (clean, no __pycache__).'} " ^
  "else{Write-Host '[WARN] No project files found.'}; " ^
  "Remove-Item $tempStaging -Recurse -Force"
popd

echo [2/3] Compiling FlowCommand.exe...
if exist project.zip (
    "%CSC%" /target:winexe /out:"%OUT%" /win32icon:"%ICON%" /optimize+ ^
      /resource:project.zip ^
      /reference:System.Windows.Forms.dll ^
      /reference:System.Drawing.dll ^
      /reference:System.IO.Compression.dll ^
      /reference:System.IO.Compression.FileSystem.dll ^
      /reference:System.Net.dll ^
      FlowCommand.cs
) else (
    "%CSC%" /target:winexe /out:"%OUT%" /win32icon:"%ICON%" /optimize+ ^
      /reference:System.Windows.Forms.dll ^
      /reference:System.Drawing.dll ^
      /reference:System.IO.Compression.dll ^
      /reference:System.IO.Compression.FileSystem.dll ^
      /reference:System.Net.dll ^
      FlowCommand.cs
)

if %ERRORLEVEL% equ 0 (
    echo [3/3] Cleaning up...
    if exist project.zip del project.zip
    echo.
    echo [OK] FlowCommand.exe built successfully in project root.
    echo     Path: %OUT%
) else (
    echo [FAIL] Compilation failed with error code %ERRORLEVEL%.
)

echo.
popd
