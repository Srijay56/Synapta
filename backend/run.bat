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
echo  CogOS - Local-First Cognitive Operating System
echo  ============================================================
echo  Server:      http://0.0.0.0:8000 (device-wide access)
echo  API Docs:    http://localhost:8000/docs
echo  Health:      http://localhost:8000/health
echo  Hotkey:      Ctrl + Alt + Space
echo  Inference:   Ollama (local) - all data stays on-device
echo  ============================================================
echo.
echo  Make sure Ollama is running: ollama serve
echo  Pull a model if needed:     ollama pull gemma3:4b
echo.

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

endlocal
