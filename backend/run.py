import uvicorn

if __name__ == "__main__":
    import os
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("BACKEND_PORT", "8000")),
        reload=os.getenv("RELOAD", "0") == "1",
    )