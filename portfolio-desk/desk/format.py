"""Indian number formatting, shared by the CLI, the dashboard and the brief."""

from __future__ import annotations

DASH = "—"


def group(value: float, decimals: int = 2) -> str:
    """Indian digit grouping: 12,34,567.89"""
    negative = value < 0
    whole, _, frac = f"{abs(value):.{decimals}f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{'-' if negative else ''}{whole}" + (f".{frac}" if frac else "")


def inr(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return DASH
    return f"₹{group(value, decimals)}"


def rupees(value: float | None) -> str:
    """Table cells: whole rupees, but keep the paise under ₹100 — rounding
    ₹3.10 to ₹3 hides a cost basis that a 600x return depends on."""
    if value is None:
        return DASH
    decimals = 2 if 0 < abs(value) < 100 else 0
    return f"₹{group(value, decimals)}"


def compact(value: float | None) -> str:
    """₹1.23 Cr / ₹12.3 L / ₹4,560 — for headline tiles."""
    if value is None:
        return DASH
    sign = "-" if value < 0 else ""
    magnitude = abs(value)
    if magnitude >= 1_00_00_000:
        return f"{sign}₹{magnitude / 1_00_00_000:,.2f} Cr"
    if magnitude >= 1_00_000:
        return f"{sign}₹{magnitude / 1_00_000:,.1f} L"
    return f"{sign}₹{group(magnitude, 0)}"


def pct(value: float | None, decimals: int = 1, *, signed: bool = True) -> str:
    if value is None:
        return DASH
    sign = "+" if signed and value > 0 else ""
    return f"{sign}{value:.{decimals}f}%"


def multiple(value: float | None, decimals: int = 1) -> str:
    """A return big enough to lose its meaning as a percentage, as a multiple.

    +63,416% is unreadable; 634x is not.
    """
    if value is None:
        return DASH
    if abs(value) < 1000:
        return pct(value, decimals)
    return f"{value / 100 + 1:,.0f}x"


def qty(value: float) -> str:
    return group(value, 0)
