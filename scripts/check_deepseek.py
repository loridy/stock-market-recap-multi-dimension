#!/usr/bin/env python3
"""
Quick DeepSeek API health check.

Usage:
  python3 scripts/check_deepseek.py

Reads DEEPSEEK_API_KEY from .env (project root) or environment.
Prints status code + short response so you can verify key validity quickly.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"
ENDPOINT = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")


def load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def main():
    load_env_file(ENV_PATH)

    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        print("❌ DEEPSEEK_API_KEY not found in environment or .env")
        sys.exit(1)

    payload = {
        "model": MODEL,
        "max_tokens": 120,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "Return plain text only."},
            {"role": "user", "content": "Reply exactly with: DEEPSEEK_OK"},
        ],
    }

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"✅ HTTP {resp.status}")
            print(body[:1000])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"❌ HTTP {e.code}")
        print(body[:1000])
        sys.exit(2)
    except Exception as e:
        print(f"❌ Request failed: {e}")
        sys.exit(3)


if __name__ == "__main__":
    main()
