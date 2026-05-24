# Gemma Companion — local-first personal AI

A Python backend that watches your screen (with your consent), learns your patterns into a Cognitive Twin, stores observations in [TrueMemory](https://github.com/buildingjoshbetter/TrueMemory), and answers questions through a local Gemma model via Ollama.

Apple Intelligence-style behaviour, but every byte stays on your machine.

## Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │  Hotkey (Ctrl+Shift+Space)  ──► capture+ask  │
                  └──────────────────────────────────────────────┘
                                       │
   ┌───────────────────┐   every 5s    ▼
   │ mss screen grab   ├──► privacy gate (window denylist)
   └───────────────────┘            │
                                    ▼
                          OpenCV preprocess + EasyOCR
                                    │
                                    ▼
                       ┌──────────────────────┐
                       │  Review queue        │  ◄── user approves/rejects
                       └──────────────────────┘
                                    │ on approval
                ┌───────────────────┼────────────────────┐
                ▼                                        ▼
       TrueMemory (SQLite)                       Cognitive Twin (JSON)
                                                        │
                                                        ▼
                                              Predictions engine
                                                        │
   /chat ─► build prompt(twin + memory + screen) ──► Ollama (Gemma 3) ──► answer
```

## Setup

### 1. Python environment
```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Note: the first OCR call downloads EasyOCR model weights (~64 MB) into `~/.EasyOCR/`.

### 2. Local LLM (Ollama)
1. Install Ollama: <https://ollama.com/download>
2. Pull Gemma:
   ```powershell
   ollama pull gemma3:4b
   ```
   (use `gemma3:12b` if you have ≥16 GB VRAM — change `OLLAMA_MODEL` env var to match)
3. Make sure `ollama serve` is running on `localhost:11434` (the installer does this for you).

The backend runs fine without Ollama — `/chat` falls back to a deterministic echo so you can still demo capture + memory + twin.

### 3. Run

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Or double-click `run.bat`.

Open <http://127.0.0.1:8000/docs> for the interactive API.

## Endpoints (cheat sheet)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/health` | overall + Ollama health |
| `POST` | `/chat`   | ask Gemma; optional `include_screen=true` adds live OCR to context |
| `POST` | `/memory/note` | manually inject a memory (user input bar) |
| `GET`  | `/memory/search?q=...` | recall relevant memories |
| `GET`  | `/memory/stats` | backend + counts |
| `GET`  | `/review` | items awaiting your approval |
| `POST` | `/review/{id}/approve` | promote into TrueMemory + twin |
| `POST` | `/review/{id}/reject`  | discard |
| `GET`  | `/twin` | summary of the cognitive twin |
| `POST` | `/twin/preference` | teach a preference directly |
| `GET`  | `/predictions` | routine/preference/vocabulary insights |
| `POST` | `/capture/control` | pause or resume the background capture loop |
| `POST` | `/hotkey/trigger` | simulate the hotkey from the API |
| `WS`   | `/ws/events`   | live stream of capture, review, hotkey events |

## Triggers

- **Passive (every 5 s)** — screen is captured, OCRed, filtered. Items appear in `/review`. Nothing is learned until you approve.
- **Hotkey (`Ctrl+Shift+Space`)** — global hotkey: grabs current screen, asks Gemma for the most useful next action, broadcasts the answer over `/ws/events`.
- **User input bar** — your imported frontend calls `POST /chat` (or `POST /memory/note` to teach directly).

Customise the hotkey, capture interval, denylist, and Ollama model in `app/config.py` or via env vars (`APP_PORT`, `CAPTURE_INTERVAL`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `USER_ID`).

## Privacy

- All processing is local. The only network egress is to `localhost:11434` (Ollama).
- The window denylist pauses capture on password managers, banking, and incognito windows by default.
- Nothing reaches TrueMemory or the cognitive twin without an explicit approval (auto-capture) or a direct user action (`/memory/note`).
- `data/twin.json`, TrueMemory's SQLite, and the review queue are gitignored.

## Frontend

Drop your imported frontend's static build into `app/static/` — it will be served at `/ui`. The backend exposes both REST and a WebSocket (`/ws/events`) so a UI can render real-time capture events, the review queue, and streaming chat.
