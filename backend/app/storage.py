from __future__ import annotations

import os
import uuid
from pathlib import Path


class Storage:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.images_dir = root_dir / "images"
        self.assets_dir = root_dir / "assets"
        self.exports_dir = root_dir / "exports"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)

    def new_image_id(self) -> str:
        return uuid.uuid4().hex

    def new_asset_id(self) -> str:
        return uuid.uuid4().hex

    def image_path(self, image_id: str) -> Path:
        return self.images_dir / f"{image_id}.png"

    def asset_path(self, asset_id: str, ext: str = ".png") -> Path:
        if not ext.startswith("."):
            ext = f".{ext}"
        return self.assets_dir / f"{asset_id}{ext}"

    def export_path(self, export_id: str, ext: str) -> Path:
        if not ext.startswith("."):
            ext = f".{ext}"
        return self.exports_dir / f"{export_id}{ext}"


def get_api_base_url() -> str:
    return os.environ.get("BIOSEG_API_BASE_URL", "http://localhost:8005")
