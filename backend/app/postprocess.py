from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class EdgeCleanupParams:
    enabled: bool = True
    strength: int = 60
    feather_px: int = 1
    erode_px: int = 0


def clean_rgba_edges(
    rgba_in: object,
    mask_u8_in: object,
    params: EdgeCleanupParams,
) -> np.ndarray:  # type: ignore[reportMissingTypeArgument]
    rgba = np.asarray(rgba_in)
    mask_u8 = np.asarray(mask_u8_in)

    if not params.enabled or params.strength <= 0:
        return rgba

    if rgba.dtype != np.uint8 or rgba.ndim != 3 or rgba.shape[-1] != 4:
        raise ValueError("rgba must be uint8 HxWx4")
    if mask_u8.dtype != np.uint8 or mask_u8.shape != rgba.shape[:2]:
        raise ValueError("mask_u8 must be uint8 HxW and match rgba")

    import cv2

    h, w = mask_u8.shape
    strength = max(0, min(100, int(params.strength)))
    edge_width = 1 + int(round(7 * (strength / 100.0)))

    erode_px = max(0, min(6, int(params.erode_px)))
    feather_px = max(0, min(6, int(params.feather_px)))

    mask = (mask_u8 > 0).astype(np.uint8) * 255

    if erode_px > 0:
        k = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * erode_px + 1, 2 * erode_px + 1)
        )
        mask = cv2.erode(mask, k, iterations=1)

    k_edge = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dil = cv2.dilate(mask, k_edge, iterations=edge_width)
    ero = cv2.erode(mask, k_edge, iterations=edge_width)
    edge_band = cv2.subtract(dil, ero)

    alpha = rgba[:, :, 3]
    edge_pixels = (edge_band > 0) & (alpha > 0) & (alpha < 255)
    if not np.any(edge_pixels):
        return rgba

    rgb = rgba[:, :, :3].astype(np.uint8)

    interior = (mask > 0) & (alpha == 255)
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))

    out = rgba.copy()
    rgb_out = out[:, :, :3]
    ys, xs = np.where(edge_pixels)
    for y, x in zip(ys.tolist(), xs.tolist()):
        samples = []
        for dy, dx in dirs:
            for d in range(1, edge_width + 1):
                yy = y + dy * d
                xx = x + dx * d
                if yy < 0 or yy >= h or xx < 0 or xx >= w:
                    break
                if interior[yy, xx]:
                    samples.append(rgb[yy, xx])
                    break

        if not samples:
            continue

        a = int(alpha[y, x])
        repl = (1.0 - a / 255.0) * (strength / 100.0)
        repl = max(0.0, min(1.0, repl))

        s = np.mean(np.stack(samples, axis=0).astype(np.float32), axis=0)
        orig = rgb_out[y, x].astype(np.float32)
        new = (1.0 - repl) * orig + repl * s
        rgb_out[y, x] = np.clip(new, 0, 255).astype(np.uint8)

    if feather_px > 0:
        blur = cv2.GaussianBlur(
            alpha.astype(np.float32), (0, 0), sigmaX=feather_px * 0.6
        )
        blur = np.clip(blur, 0, 255).astype(np.uint8)
        out[:, :, 3] = np.where(mask > 0, blur, 0).astype(np.uint8)

    return out


@dataclass(frozen=True)
class RestoreParams:
    mode: str = "simple"
    radius: int = 5
    method: str = "telea"


def restore_background(
    rgb_in: object,
    hole_mask_u8_in: object,
    protect_mask_u8_in: object | None = None,
    params: RestoreParams | None = None,
) -> np.ndarray:  # type: ignore[reportMissingTypeArgument]
    rgb = np.asarray(rgb_in)
    hole_mask_u8 = np.asarray(hole_mask_u8_in)
    protect_mask_u8 = (
        None if protect_mask_u8_in is None else np.asarray(protect_mask_u8_in)
    )

    if params is None:
        params = RestoreParams()

    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[-1] != 3:
        raise ValueError("rgb must be uint8 HxWx3")
    if hole_mask_u8.dtype != np.uint8 or hole_mask_u8.shape != rgb.shape[:2]:
        raise ValueError("hole_mask_u8 must be uint8 HxW and match rgb")
    if protect_mask_u8 is not None and protect_mask_u8.shape != rgb.shape[:2]:
        raise ValueError("protect_mask_u8 must match rgb shape")

    import cv2

    inpaint_mask = (hole_mask_u8 > 0).astype(np.uint8) * 255
    if protect_mask_u8 is not None:
        protect = (protect_mask_u8 > 0).astype(np.uint8) * 255
        inpaint_mask = cv2.subtract(inpaint_mask, protect)

    radius = int(max(1, min(50, params.radius)))
    method = cv2.INPAINT_TELEA if params.method.lower() == "telea" else cv2.INPAINT_NS

    bgr = rgb[:, :, ::-1]
    out_bgr = cv2.inpaint(bgr, inpaint_mask, radius, method)
    out_rgb = out_bgr[:, :, ::-1].astype(np.uint8)
    return out_rgb


def restore_object_rgba(
    object_rgba_in: object,
    strength: int = 25,
) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.asarray(object_rgba_in)
    if rgba.dtype != np.uint8 or rgba.ndim != 3 or rgba.shape[-1] != 4:
        raise ValueError("object_rgba must be uint8 HxWx4")

    import cv2

    strength_i = int(max(0, min(100, strength)))

    alpha = rgba[:, :, 3]
    if not np.any(alpha > 0):
        return rgba, np.zeros_like(alpha, dtype=np.uint8)

    grow = int(round(1 + 4 * (strength_i / 100.0)))
    close = int(round(1 + 3 * (strength_i / 100.0)))

    alpha_bin = (alpha > 0).astype(np.uint8) * 255
    k_close = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (2 * close + 1, 2 * close + 1)
    )
    closed = cv2.morphologyEx(alpha_bin, cv2.MORPH_CLOSE, k_close, iterations=1)

    k_grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
    grown = cv2.dilate(closed, k_grow, iterations=1)

    add_mask = (grown > 0) & (alpha_bin == 0)

    if not np.any(add_mask):
        return rgba, np.zeros_like(alpha, dtype=np.uint8)

    new_alpha = alpha.copy()
    soft_a = int(round(64 + 128 * (strength_i / 100.0)))
    new_alpha[add_mask] = np.maximum(new_alpha[add_mask], soft_a).astype(np.uint8)

    rgb = rgba[:, :, :3].copy()
    k = int(max(1, min(21, 3 + 2 * int(round(4 * (strength_i / 100.0))))))
    blurred = cv2.GaussianBlur(rgb.astype(np.float32), (k, k), sigmaX=0)

    for c in range(3):
        channel = rgb[:, :, c].astype(np.float32)
        blurred_c = blurred[:, :, c]
        channel[add_mask] = blurred_c[add_mask]
        rgb[:, :, c] = np.clip(channel, 0, 255).astype(np.uint8)

    out = rgba.copy()
    out[:, :, :3] = rgb
    out[:, :, 3] = new_alpha

    delta_mask_u8 = (add_mask.astype(np.uint8) * 255).astype(np.uint8)
    return out, delta_mask_u8
