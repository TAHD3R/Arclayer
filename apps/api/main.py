from apps.api.core.registry import create_app

app = create_app()

if __name__ == "__main__":
    """
    Run the FastAPI application using Uvicorn server.
    Debug purpose only; for production, use a proper ASGI server.
    """
    import uvicorn

    uvicorn.run("apps.api.main:app", host="127.0.0.1", port=8000)
