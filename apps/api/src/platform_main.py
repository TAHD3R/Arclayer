from src.core.registry import create_platform_app

app = create_platform_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.platform_main:app", host="127.0.0.1", port=8001)
