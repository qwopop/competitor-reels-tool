"""Serve the built React app from the same server as the API.

In production the frontend is a folder of static files (`npm run build`), so the
container needs no separate web server: FastAPI serves them. Set STATIC_DIR to
the build folder (the Dockerfile does). In development, Vite serves the
frontend and STATIC_DIR is unset, so nothing here runs.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def mount_frontend(app: FastAPI, static_dir: str) -> None:
    root = Path(static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"STATIC_DIR={static_dir} has no index.html; build the frontend first.")

    # Hashed JS/CSS bundles: immutable, so browsers may cache them for a year.
    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        # Unknown API paths stay JSON 404s instead of returning the app's HTML.
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Files in the build root (favicon.svg, sample images…), never outside it.
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        # Everything else is a client-side route such as /content-plan.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
