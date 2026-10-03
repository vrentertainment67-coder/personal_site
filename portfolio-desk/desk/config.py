"""Paths and environment configuration.

Everything the desk writes lives under the project root, so a run can be
inspected (and committed) afterwards.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

HOLDINGS_FILE = ROOT / "holdings.json"
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
LEVELS_DIR = DATA_DIR / "levels"
SITE_DIR = ROOT / "site"
PROMPTS_DIR = ROOT / "prompts"

# NSE and Yahoo both reject obvious bots; use a normal browser UA.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

# NSE asks for no more than roughly one request per second.
NSE_MIN_INTERVAL_SECONDS = 1.0
REQUEST_TIMEOUT_SECONDS = 15
MAX_RETRIES = 3


@dataclass(frozen=True)
class Settings:
    """Values read from the environment. Secrets are never written to disk."""

    anthropic_api_key: str | None
    anthropic_model: str
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    timezone: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
            anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-opus-5"),
            telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN") or None,
            telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID") or None,
            timezone=os.environ.get("TZ", "Asia/Kolkata"),
        )


def ensure_dirs() -> None:
    for path in (DATA_DIR, CACHE_DIR, LEVELS_DIR):
        path.mkdir(parents=True, exist_ok=True)
