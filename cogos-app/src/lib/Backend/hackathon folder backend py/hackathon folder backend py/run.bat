@echo off
setlocal

cd /d "%~dp0"

if not exist .venv (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo Failed to create venv. Make sure Python 3.10+ is installed and on PATH.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

echo Installing/updating dependencies (first run takes a few minutes)...
pip install --upgrade pip > NUL
pip install -r requirements.txt
if errorlevel 1 (
    echo Dependency install failed. See messages above.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Gemma Companion is starting on http://127.0.0.1:8000
echo  Docs:    http://127.0.0.1:8000/docs
echo  Hotkey:  Ctrl + Shift + Space  (grabs screen, asks Gemma)
echo ============================================================
echo.

start "" http://127.0.0.1:8000/docs
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

endlocal
