from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Callable

from PIL import Image

from .models import ExportLayer


def _apply_opacity(img: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 1.0:
        return img
    if opacity <= 0.0:
        blank = Image.new("RGBA", img.size, (0, 0, 0, 0))
        return blank
    r, g, b, a = img.split()
    a = a.point(lambda v: int(v * opacity))
    return Image.merge("RGBA", (r, g, b, a))


def _transform_layer_image(
    img: Image.Image,
    scale_x: float,
    scale_y: float,
    rotation_deg: float,
) -> Image.Image:
    w, h = img.size
    w2 = max(1, int(round(w * scale_x)))
    h2 = max(1, int(round(h * scale_y)))
    if (w2, h2) != (w, h):
        img = img.resize((w2, h2), resample=Image.Resampling.BICUBIC)
    if rotation_deg % 360 != 0:
        img = img.rotate(rotation_deg, expand=True, resample=Image.Resampling.BICUBIC)
    return img


def compose_image(
    base_image_path: Path,
    layers: list[ExportLayer],
    include_base_image: bool,
    resolve_asset_path: Callable[[str], Path],
) -> Image.Image:
    base = Image.open(base_image_path).convert("RGBA")
    canvas = (
        base.copy()
        if include_base_image
        else Image.new("RGBA", base.size, (0, 0, 0, 0))
    )

    for layer in sorted(layers, key=lambda l: l.z_index):
        if not layer.visible:
            continue
        layer_img = Image.open(resolve_asset_path(layer.asset_id)).convert("RGBA")
        layer_img = _apply_opacity(layer_img, layer.opacity)

        transformed = _transform_layer_image(
            layer_img, layer.scale_x, layer.scale_y, layer.rotation_deg
        )

        scaled_w = max(1, int(round(layer_img.size[0] * layer.scale_x)))
        scaled_h = max(1, int(round(layer_img.size[1] * layer.scale_y)))
        cx = layer.x + scaled_w / 2.0
        cy = layer.y + scaled_h / 2.0
        x0 = int(round(cx - transformed.size[0] / 2.0))
        y0 = int(round(cy - transformed.size[1] / 2.0))

        canvas.alpha_composite(transformed, dest=(x0, y0))

    return canvas


def build_export_zip(
    base_image_id: str,
    base_image_path: Path,
    layers: list[ExportLayer],
    include_base_image: bool,
    resolve_asset_path: Callable[[str], Path],
) -> bytes:
    composed = compose_image(
        base_image_path, layers, include_base_image, resolve_asset_path
    )
    composed_buf = io.BytesIO()
    composed.save(composed_buf, format="PNG")

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("composed.png", composed_buf.getvalue())
        zf.writestr(
            "project.json",
            json.dumps(
                {
                    "base_image_id": base_image_id,
                    "include_base_image": include_base_image,
                    "layers": [
                        l.model_dump() if hasattr(l, "model_dump") else l.dict()
                        for l in layers
                    ],
                },
                indent=2,
            ),
        )

        for layer in layers:
            if not layer.visible:
                continue
            with open(resolve_asset_path(layer.asset_id), "rb") as f:
                zf.writestr(f"layers/{layer.layer_id}.png", f.read())

            if layer.mask_asset_id:
                mask_path = resolve_asset_path(layer.mask_asset_id)
                with open(mask_path, "rb") as f:
                    zf.writestr(f"masks/{layer.layer_id}.png", f.read())

    return zip_buf.getvalue()
