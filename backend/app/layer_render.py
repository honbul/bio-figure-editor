from __future__ import annotations

from PIL import Image


def render_layer_to_base_canvas(
    base_size: tuple[int, int],
    layer_rgba: Image.Image,
    x: float,
    y: float,
    scale_x: float,
    scale_y: float,
    rotation_deg: float,
) -> Image.Image:
    base_w, base_h = base_size

    layer = layer_rgba.convert("RGBA")
    scaled_w = max(1, int(round(layer.width * scale_x)))
    scaled_h = max(1, int(round(layer.height * scale_y)))
    if (scaled_w, scaled_h) != layer.size:
        layer = layer.resize((scaled_w, scaled_h), resample=Image.Resampling.LANCZOS)

    if rotation_deg % 360 != 0:
        layer = layer.rotate(
            rotation_deg, resample=Image.Resampling.BICUBIC, expand=True
        )

    canvas = Image.new("RGBA", (base_w, base_h), (0, 0, 0, 0))
    canvas.alpha_composite(layer, (int(round(x)), int(round(y))))
    return canvas
