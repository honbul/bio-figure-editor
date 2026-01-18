from __future__ import annotations

import argparse
import os

from huggingface_hub import snapshot_download


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-download Qwen/Qwen-Image-Layered weights into the Hugging Face cache."
    )
    parser.add_argument(
        "--repo",
        default="Qwen/Qwen-Image-Layered",
        help="Hugging Face repo id (default: Qwen/Qwen-Image-Layered)",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help=(
            "Optional cache directory. If unset, uses HF_HOME/TRANSFORMERS_CACHE or default HF cache."
        ),
    )
    parser.add_argument(
        "--revision",
        default=None,
        help="Optional revision (branch/tag/commit).",
    )
    args = parser.parse_args()

    if args.cache_dir:
        os.environ.setdefault("HF_HOME", args.cache_dir)

    print("HF_HOME=", os.environ.get("HF_HOME"))
    print("TRANSFORMERS_CACHE=", os.environ.get("TRANSFORMERS_CACHE"))
    print("Downloading:", args.repo)

    path = snapshot_download(
        repo_id=args.repo,
        revision=args.revision,
        resume_download=True,
    )

    print("downloaded_to:", path)


if __name__ == "__main__":
    main()
