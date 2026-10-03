"""Headlines per holding, from Google News RSS.

One query per name, capped and cached for the day. Headlines are data, not
instructions: they are passed to the brief as quoted strings with their source,
and nothing in a headline changes what the desk does.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from xml.etree import ElementTree

from .http import DayCache, HttpClient

RSS_URL = "https://news.google.com/rss/search"
MAX_PER_HOLDING = 3


@dataclass(frozen=True)
class Headline:
    title: str
    source: str
    published: str | None
    link: str

    def as_dict(self) -> dict[str, str | None]:
        return {"title": self.title, "source": self.source, "published": self.published}


class NewsClient:
    source = "news"

    def __init__(self, *, cache: DayCache | None = None) -> None:
        self.http = HttpClient(
            self.source,
            min_interval=0.5,
            headers={"Accept": "application/rss+xml, application/xml, text/xml"},
            cache=cache if cache is not None else DayCache("news"),
        )

    @property
    def failures(self) -> list[str]:
        return self.http.failures

    def for_company(self, name: str, *, limit: int = MAX_PER_HOLDING) -> list[Headline]:
        """Last 24 hours of India-market headlines mentioning the company."""
        xml_text = self.http.get_text(
            RSS_URL,
            params={"q": f'"{name}" when:1d', "hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
            cache_key=f"rss-{name}",
        )
        return parse_rss(xml_text, limit=limit) if xml_text else []


def parse_rss(xml_text: str, *, limit: int = MAX_PER_HOLDING) -> list[Headline]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return []
    out: list[Headline] = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        source = (item.findtext("source") or "").strip()
        if not source and " - " in title:
            # Google appends " - Publisher" when the source element is absent.
            title, _, source = title.rpartition(" - ")
        out.append(
            Headline(
                title=_clean(title),
                source=_clean(source) or "unknown",
                published=_date(item.findtext("pubDate")),
                link=(item.findtext("link") or "").strip(),
            )
        )
        if len(out) >= limit:
            break
    return out


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _date(value: str | None) -> str | None:
    if not value:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z"):
        try:
            return datetime.strptime(value.strip(), fmt).astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return value.strip()
