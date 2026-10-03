"""Data sources. Every module here fails soft and reports why."""

from .http import SourceUnavailable

__all__ = ["SourceUnavailable"]
