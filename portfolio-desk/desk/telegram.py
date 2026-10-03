"""Telegram delivery: the brief as text, the dashboard as a file.

MarkdownV2 escaping is strict — an unescaped '.' or '-' fails the whole send —
so the text is escaped here and split at 4,096 characters on paragraph breaks.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

from . import config

API = "https://api.telegram.org/bot{token}"
MAX_LENGTH = 4096
RESERVED = r"_*[]()~`>#+-=|{}.!"

log = logging.getLogger(__name__)


@dataclass
class SendResult:
    sent: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.sent > 0 and not self.failures


def escape(text: str) -> str:
    """Escape every MarkdownV2 reserved character."""
    return "".join("\\" + ch if ch in RESERVED else ch for ch in text)


def split(text: str, limit: int = MAX_LENGTH) -> list[str]:
    """Split on blank lines, then lines, so a message never cuts mid-sentence."""
    if len(text) <= limit:
        return [text] if text else []

    chunks: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(block) <= limit:
            current = block
            continue
        # A single oversized block: fall back to line-by-line, then hard cut.
        current = ""
        for line in block.split("\n"):
            candidate = f"{current}\n{line}" if current else line
            if len(candidate) <= limit:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                while len(line) > limit:
                    chunks.append(line[:limit])
                    line = line[limit:]
                current = line
    if current:
        chunks.append(current)
    return chunks


class Telegram:
    def __init__(self, token: str | None = None, chat_id: str | None = None) -> None:
        settings = config.Settings.from_env()
        self.token = token or settings.telegram_bot_token
        self.chat_id = chat_id or settings.telegram_chat_id
        self.session = requests.Session()

    @property
    def configured(self) -> bool:
        return bool(self.token and self.chat_id)

    def _post(self, method: str, *, data: dict[str, Any], files: Any = None) -> dict[str, Any]:
        response = self.session.post(
            f"{API.format(token=self.token)}/{method}",
            data=data,
            files=files,
            timeout=config.REQUEST_TIMEOUT_SECONDS,
        )
        payload = response.json() if response.content else {}
        if not response.ok or not payload.get("ok"):
            raise RuntimeError(
                f"{method} failed: HTTP {response.status_code} "
                f"{payload.get('description') or response.text[:200]}"
            )
        return payload

    def send_text(self, text: str, *, escape_text: bool = True) -> SendResult:
        result = SendResult()
        if not self.configured:
            result.failures.append("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set")
            return result
        body = escape(text) if escape_text else text
        for chunk in split(body):
            try:
                self._post(
                    "sendMessage",
                    data={
                        "chat_id": self.chat_id,
                        "text": chunk,
                        "parse_mode": "MarkdownV2",
                        "disable_web_page_preview": True,
                    },
                )
            except Exception as exc:  # noqa: BLE001 - delivery must not break the run
                result.failures.append(str(exc))
                log.warning("telegram send failed: %s", exc)
            else:
                result.sent += 1
        return result

    def send_document(self, path: Path, *, caption: str = "") -> SendResult:
        result = SendResult()
        if not self.configured:
            result.failures.append("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set")
            return result
        try:
            with path.open("rb") as handle:
                self._post(
                    "sendDocument",
                    data={
                        "chat_id": self.chat_id,
                        "caption": escape(caption)[:1024],
                        "parse_mode": "MarkdownV2",
                    },
                    files={"document": (path.name, handle, "text/html")},
                )
        except Exception as exc:  # noqa: BLE001
            result.failures.append(str(exc))
            log.warning("telegram document send failed: %s", exc)
        else:
            result.sent += 1
        return result
