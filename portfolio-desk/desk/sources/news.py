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

# Words that carry no identifying weight, so "Jio Financial Services" is not
# matched by a headline that merely says "services".
STOPWORDS = frozenset({
    "ltd", "limited", "india", "indian", "corp", "corporation", "company", "co",
    "services", "service", "industries", "enterprises", "international", "the",
    "and", "of", "bank", "finance", "financial", "power", "energy", "motor",
    "motors", "technologies", "technology", "steel", "cement", "oil", "gas",
})


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

    def for_company(
        self, name: str, *, symbol: str | None = None, limit: int = MAX_PER_HOLDING
    ) -> list[Headline]:
        """Last 24 hours of headlines that actually name the company.

        Google News answers a quoted query with a generous interpretation, so a
        search for "Jio Financial Services" returns market round-ups and fund
        pages. Everything it returns is checked against the company's own
        distinguishing words before it reaches the brief.
        """
        xml_text = self.http.get_text(
            RSS_URL,
            params={"q": f'"{name}" when:1d', "hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
            cache_key=f"rss-{name}",
        )
        if not xml_text:
            return []
        found = parse_rss(xml_text, limit=limit * 4)
        kept = [h for h in found if mentions(h.title, name, symbol)]
        return kept[:limit]


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


def identifying_words(name: str) -> set[str]:
    """The words that make a company name that company and not another."""
    words = [w.strip("()&.,").lower() for w in re.sub(r"[^\w\s&()]", " ", name).split()]
    return {w for w in words if w and w not in STOPWORDS and len(w) > 2}


def mentions(title: str, name: str, symbol: str | None = None) -> bool:
    """Does this headline actually name the company?

    Three ways to qualify, in order of certainty: the ticker as a whole word,
    the company's full name as a phrase, or — only for names long enough to
    have them — every one of its distinguishing words.

    A short name made of ordinary words ("Power Grid", "Tata Steel") must appear
    as the phrase, because its words separately match half the market: "power
    demand rises across the grid" is not Power Grid news.
    """
    haystack = title.lower()
    if symbol and len(symbol) > 2 and re.search(rf"\b{re.escape(symbol.lower())}\b", haystack):
        return True
    if name.lower() in haystack:
        return True

    word_count = len(name.split())
    distinctive = identifying_words(name)
    if word_count <= 2 or not distinctive:
        return False
    return all(re.search(rf"\b{re.escape(w)}\b", haystack) for w in distinctive)


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
