from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image

from backend.app.storage import Storage, get_api_base_url

from .restore_common import (
    RestoreEngineError,
    auto_restore_mask,
    format_engine_error,
    mask_from_rgba_alpha,
    prepare_object_inpaint_inputs,
    sha256_image_rgba,
    sha256_mask,
    stable_json_hash,
    timed,
)
from .restore_kandinsky22 import Kandinsky22InpaintService, Kandinsky22Params
from .restore_sd15 import Sd15InpaintService, Sd15Params
from .restore_sdxl import SdxlInpaintService, SdxlParams


@dataclass
class RestoreObjectResult:
    asset_id: str
    url: str
    metadata: dict[str, object]


class RestoreObjectService:
    _storage: Storage
    _cache: dict[str, RestoreObjectResult]

    _sd15: Sd15InpaintService
    _sdxl: SdxlInpaintService
    _k22: Kandinsky22InpaintService

    def reset(self) -> None:
        self._cache.clear()
        self._sd15.reset()
        self._sdxl.reset()
        self._k22.reset()

    def __init__(self, storage: Storage):
        self._storage = storage
        self._cache = {}
        self._sd15 = Sd15InpaintService()
        self._sdxl = SdxlInpaintService()
        self._k22 = Kandinsky22InpaintService()

    def _asset_url(self, asset_id: str) -> str:
        return f"{get_api_base_url().rstrip('/')}/asset/{asset_id}"

    def restore(
        self,
        *,
        layer_id: str,
        engine: str,
        prompt: str | None,
        params: dict[str, object] | None,
        restore_mask_asset_id: str | None,
    ) -> RestoreObjectResult:
        obj_path = self._storage.asset_path(layer_id, ".png")
        if not obj_path.exists():
            raise HTTPException(status_code=404, detail="layer asset not found")

        object_rgba = Image.open(obj_path).convert("RGBA")

        restore_mask_l: Image.Image
        if restore_mask_asset_id:
            mask_path = self._storage.asset_path(restore_mask_asset_id, ".png")
            if not mask_path.exists():
                raise HTTPException(
                    status_code=404, detail="restore mask asset not found"
                )
            mask_rgba = Image.open(mask_path).convert("RGBA")
            restore_mask_l = mask_from_rgba_alpha(mask_rgba, object_rgba.size)
        else:
            restore_mask_l = auto_restore_mask(object_rgba)

        p = (prompt or "").strip() or None
        params_in = params or {}

        cache_key = stable_json_hash(
            {
                "layer_id": layer_id,
                "engine": engine,
                "prompt": p,
                "params": params_in,
                "object_rgba": sha256_image_rgba(object_rgba),
                "restore_mask": sha256_mask(restore_mask_l),
            }
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            meta = dict(cached.metadata)
            meta["cached"] = True
            return RestoreObjectResult(
                asset_id=cached.asset_id, url=cached.url, metadata=meta
            )

        original_rgba, init_rgb, mask_l = prepare_object_inpaint_inputs(
            object_rgba, restore_mask_l
        )

        try:
            out_rgb, runtime_ms = timed(self._run_engine)(
                engine=engine,
                init_rgb=init_rgb,
                mask_l=mask_l,
                prompt=p,
                params=params_in,
            )
        except RestoreEngineError as e:
            raise HTTPException(status_code=500, detail=format_engine_error(e))

        from .restore_common import merge_inpaint_result

        out_rgba = merge_inpaint_result(original_rgba, out_rgb, mask_l)

        out_asset_id = self._storage.new_asset_id()
        out_path = self._storage.asset_path(out_asset_id, ".png")
        out_rgba.save(out_path, format="PNG")

        meta = {
            "engine": engine,
            "params_used": params_in,
            "runtime_ms": runtime_ms,
            "cached": False,
        }
        result = RestoreObjectResult(
            asset_id=out_asset_id, url=self._asset_url(out_asset_id), metadata=meta
        )
        self._cache[cache_key] = result
        return result

    def _run_engine(
        self,
        *,
        engine: str,
        init_rgb: Image.Image,
        mask_l: Image.Image,
        prompt: str | None,
        params: dict[str, object],
    ) -> Image.Image:
        if engine == "sd15_inpaint":
            p = Sd15Params(
                steps=int(params.get("steps", 20) or 20),
                guidance_scale=float(params.get("guidance_scale", 6.0) or 6.0),
                seed=None if params.get("seed") is None else int(params.get("seed")),
                resize_long_edge=None
                if params.get("resize_long_edge") is None
                else int(params.get("resize_long_edge")),
            )
            return self._sd15.run(init_rgb, mask_l, prompt, p)

        if engine == "sdxl_inpaint":
            p = SdxlParams(
                steps=int(params.get("steps", 20) or 20),
                guidance_scale=float(params.get("guidance_scale", 5.5) or 5.5),
                strength=None
                if params.get("strength") is None
                else float(params.get("strength")),
                seed=None if params.get("seed") is None else int(params.get("seed")),
                resize_long_edge=None
                if params.get("resize_long_edge") is None
                else int(params.get("resize_long_edge")),
            )
            return self._sdxl.run(init_rgb, mask_l, prompt, p)

        if engine == "kandinsky22_inpaint":
            p = Kandinsky22Params(
                steps=int(params.get("steps", 30) or 30),
                guidance_scale=float(params.get("guidance_scale", 4.0) or 4.0),
                seed=None if params.get("seed") is None else int(params.get("seed")),
                resize_long_edge=None
                if params.get("resize_long_edge") is None
                else int(params.get("resize_long_edge")),
            )
            return self._k22.run(init_rgb, mask_l, prompt, p)

        raise HTTPException(status_code=400, detail="unknown engine")
