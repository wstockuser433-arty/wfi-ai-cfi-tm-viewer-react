import os
import uvicorn
from dotenv import load_dotenv

# ⭐ Load .env into os.environ BEFORE reading any env vars
load_dotenv()

if __name__ == "__main__":
    # Accept "1", "true", "yes", "on" (case-insensitive) as truthy
    reload_flag = os.getenv("RELOAD", "0").lower() in ("1", "true", "yes", "on")

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("BACKEND_PORT", "8000")),
        reload=reload_flag,
    )