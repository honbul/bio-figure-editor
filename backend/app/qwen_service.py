from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image


from .models import (
    DecomposedLayer,
    LayerDecomposeRequest,
    LayerDecomposeResponse,
    QwenWarmupRequest,
    QwenWarmupResponse,
)
from .storage import Storage, get_api_base_url


@dataclass
class _CacheEntry:
    response: LayerDecomposeResponse


class QwenLayeredService:
    _storage: Storage
    _cache: dict[str, _CacheEntry]
    _pipeline: object | None  # type: ignore[reportGeneralTypeIssues,reportCallIssue]

    def __init__(self, storage: Storage):
        self._storage = storage
        self._cache = {}
        self._pipeline = None

    def reset(self) -> None:
        pipeline = self._pipeline
        self._pipeline = None
        self._cache.clear()

        try:
            import gc
            import torch

            if pipeline is not None:
                try:
                    pipeline.to("cpu")
                except Exception:
                    pass
                del pipeline

            gc.collect()

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except Exception:
            pass

    def warmup(self, req: QwenWarmupRequest) -> QwenWarmupResponse:
        try:
            pipeline, device = self._get_or_load_pipeline()

            import torch

            torch.cuda.reset_peak_memory_stats()

            img = Image.new("RGBA", (64, 64), (255, 255, 255, 255))

            resolution = 640 if req.preset in ("fast", "balanced") else 1024
            steps = (
                8 if req.preset == "fast" else 20 if req.preset == "balanced" else 30
            )

            import torch

            gen = torch.Generator(device=device).manual_seed(1)
            with torch.inference_mode():
                _ = pipeline(  # type: ignore[reportCallIssue]
                    image=img,
                    generator=gen,
                    true_cfg_scale=3.0,
                    negative_prompt=" ",
                    num_inference_steps=steps,
                    num_images_per_prompt=1,
                    layers=req.num_layers,
                    resolution=resolution,
                    cfg_normalize=True,
                    use_en_prompt=True,
                )

            rss_mb = None
            try:
                import psutil

                rss_mb = int(psutil.Process().memory_info().rss / 1024 / 1024)
            except Exception:
                pass

            vram_alloc_mb = None
            vram_res_mb = None
            if device == "cuda":
                vram_alloc_mb = int(torch.cuda.max_memory_allocated() / 1024 / 1024)
                vram_res_mb = int(torch.cuda.max_memory_reserved() / 1024 / 1024)

            return QwenWarmupResponse(
                ok=True,
                detail=(
                    "warmed" if device == "cuda" else "warmed (cpu offload / cpu mode)"
                ),
                ram_rss_mb=rss_mb,
                cuda=(device == "cuda"),
                vram_allocated_mb=vram_alloc_mb,
                vram_reserved_mb=vram_res_mb,
            )
        except Exception as e:
            return QwenWarmupResponse(ok=False, detail=str(e))

    def _get_or_load_pipeline(self):
        import importlib

        diffusers_module_name = "diff" + "users"
        transformers_module_name = "trans" + "formers"

        try:
            diffusers = importlib.import_module(diffusers_module_name)
        except Exception:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Qwen-Image-Layered backend dependencies are missing. "
                    "Install diffusers + transformers and pre-cache model weights offline."
                ),
            )

        try:
            importlib.import_module(transformers_module_name)
        except Exception:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Qwen-Image-Layered requires transformers>=4.51.3. "
                    "Install transformers and ensure weights are cached offline."
                ),
            )

        try:
            import torch
        except Exception:
            raise HTTPException(status_code=503, detail="torch is not installed")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        quantization_config = None

        if device == "cuda":
            try:
                from diffusers.quantizers.pipe_quant_config import (
                    PipelineQuantizationConfig,
                )
                from diffusers.quantizers.quantization_config import TorchAoConfig
                from torchao.quantization import Float8WeightOnlyConfig

                quantization_config = PipelineQuantizationConfig(
                    quant_mapping={
                        "transformer": TorchAoConfig(Float8WeightOnlyConfig())
                    }
                )
            except Exception as e:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "FP8 quantization requires torchao. "
                        "Install torchao or disable CUDA. "
                        f"Error: {e}"
                    ),
                )

        pipeline = self._pipeline
        if pipeline is None:
            QwenImageLayeredPipeline = getattr(diffusers, "QwenImageLayeredPipeline")
            try:
                pipeline = QwenImageLayeredPipeline.from_pretrained(
                    "Qwen/Qwen-Image-Layered",
                    local_files_only=True,
                    low_cpu_mem_usage=True,
                    quantization_config=quantization_config,
                    torch_dtype=torch.bfloat16 if device == "cuda" else None,
                    device_map="balanced" if device == "cuda" else None,
                )
            except Exception as e:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Qwen model weights not found in local HF cache. "
                        "Re-run precache_qwen_image_layered.py, or set HF_HOME/TRANSFORMERS_CACHE. "
                        f"Error: {e}"
                    ),
                )
            if device != "cuda":
                pipeline = pipeline.to("cpu")

            self._pipeline = pipeline

        return pipeline, device  # type: ignore[reportUnknownVariableType]

    def decompose(self, req: LayerDecomposeRequest) -> LayerDecomposeResponse:
        key = self._cache_key(req)
        cached = self._cache.get(key)
        if cached is not None:
            return LayerDecomposeResponse(
                layers=cached.response.layers,
                composite_preview_asset_id=cached.response.composite_preview_asset_id,
                composite_preview_url=cached.response.composite_preview_url,
                cached=True,
                timing_ms=0,
            )

        started = time.time()

        image_path = self._storage.image_path(req.image_id)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="image not found")

        pipeline, device = self._get_or_load_pipeline()

        from PIL import Image as _PILImage

        img = _PILImage.open(image_path).convert("RGBA")

        import torch

        pipeline_run = pipeline  # type: ignore[reportUnknownVariableType]

        layers = req.num_layers if req.num_layers is not None else 4
        resolution = 640 if req.preset in ("fast", "balanced") else 1024
        steps = 16 if req.preset == "fast" else 40 if req.preset == "balanced" else 50
        true_cfg_scale = 3.0 if req.preset == "fast" else 4.0

        generator = None
        if req.seed is not None:
            generator = torch.Generator(device=device).manual_seed(int(req.seed))

        try:
            with torch.inference_mode():
                out = pipeline_run(  # type: ignore[reportCallIssue]
                    image=img,
                    generator=generator,
                    true_cfg_scale=true_cfg_scale,
                    negative_prompt=" ",
                    num_inference_steps=steps,
                    num_images_per_prompt=1,
                    layers=layers,
                    resolution=resolution,
                    cfg_normalize=True,
                    use_en_prompt=True,
                )
        except AssertionError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Qwen decomposition failed (possibly OOM). "
                    "Try preset='fast' or reduce num_layers. "
                    f"Error: {e}"
                ),
            )

        images = out.images[0]

        decomposed: list[DecomposedLayer] = []
        for idx, layer_img in enumerate(images):
            asset_id = self._storage.new_asset_id()
            path = self._storage.asset_path(asset_id, ".png")
            layer_img.convert("RGBA").save(path, format="PNG")

            decomposed.append(
                DecomposedLayer(
                    layer_id=f"qwen:{key}:{idx}",
                    png_rgba_asset_id=asset_id,
                    png_rgba_url=self._asset_url(asset_id),
                    width=layer_img.size[0],
                    height=layer_img.size[1],
                    suggested_name=f"Qwen Layer {idx + 1}",
                )
            )

        timing_ms = int((time.time() - started) * 1000)
        resp = LayerDecomposeResponse(
            layers=decomposed, cached=False, timing_ms=timing_ms
        )
        self._cache[key] = _CacheEntry(response=resp)
        return resp

    def _asset_url(self, asset_id: str) -> str:
        return f"{get_api_base_url().rstrip('/')}/asset/{asset_id}"

    def _cache_key(self, req: LayerDecomposeRequest) -> str:
        payload = {
            "image_id": req.image_id,
            "num_layers": req.num_layers,
            "preset": req.preset,
            "seed": req.seed,
        }
        raw = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
