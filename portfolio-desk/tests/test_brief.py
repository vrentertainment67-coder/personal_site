"""The number guard and the generation loop, with a fake Claude client."""

from dataclasses import dataclass, field

import pytest

from desk import brief
from desk.numbers import check, unsupported


PAYLOAD = {
    "as_of": "2026-10-03",
    "indices": [{"name": "NIFTY 50", "last": 24853.15, "support": 24700, "resistance": 25010}],
    "portfolio": {"value": 4169000.0, "unrealised": 2258431.0, "holdings": 41},
    "watchlist": [{"name": "Infosys", "last": 1035.0, "reason": "2.1% below 50 DMA at 1057"}],
}


# ----------------------------------------------------------------- validator


def test_numbers_present_in_the_payload_pass():
    text = "Nifty closed at 24,853.15, with support at 24,700 and resistance at 25,010."
    ok, bad = check(text, PAYLOAD)
    assert ok and bad == []


def test_an_invented_number_is_caught():
    text = "Nifty closed at 24,853.15 after testing 24,612 intraday."
    ok, bad = check(text, PAYLOAD)
    assert not ok and bad == ["24,612"]


def test_lakh_and_crore_phrasings_are_accepted():
    assert check("The book is worth ₹41.69 L.", {"value": 4169000.0})[0]
    assert check("Unrealised gain is ₹22.58 L.", PAYLOAD)[0]
    assert check("That is ₹1.23 Cr.", {"value": 12300000.0})[0]


def test_small_integers_and_years_are_not_treated_as_claims():
    text = "Three of the top 5 names reported in Q2 2026."
    assert check(text, PAYLOAD)[0]


def test_a_plausible_but_wrong_figure_is_still_caught():
    """The failure mode that matters: a number that looks right."""
    text = "Unrealised gain stands at ₹22.9 L."      # payload says 22.58 L
    ok, bad = check(text, PAYLOAD)
    assert not ok and bad == ["22.9"]


def test_rounding_within_tolerance_is_allowed():
    assert check("Nifty is at 24,853.", PAYLOAD)[0]
    assert check("Infosys trades at 1,035.", PAYLOAD)[0]


def test_numbers_inside_payload_strings_count():
    assert unsupported("Infosys sits 2.1% below its 50 DMA at 1,057.", PAYLOAD) == []


# ------------------------------------------------------------------ advice


@pytest.mark.parametrize(
    "text",
    [
        "You should trim Lumax here.",
        "I would buy more Infosys.",
        "Time to book profits in Canara Bank.",
        "We recommend reducing power exposure.",
    ],
)
def test_advice_phrasing_is_detected(text):
    assert brief.find_advice(text)


def test_descriptive_language_is_not_advice():
    text = ("Infosys is 2.1% below its 50 DMA at 1,057, which has held twice since July. "
            "Nifty's nearest support is 24,700.")
    assert brief.find_advice(text) == []


# ------------------------------------------------------- generation loop


@dataclass
class FakeBlock:
    text: str
    type: str = "text"


@dataclass
class FakeUsage:
    input_tokens: int = 1200
    output_tokens: int = 300


@dataclass
class FakeResponse:
    content: list
    stop_reason: str = "end_turn"
    stop_details: object = None
    usage: FakeUsage = field(default_factory=FakeUsage)


class FakeMessages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, FakeResponse):
            return reply
        return FakeResponse(content=[FakeBlock(reply)])


class FakeClient:
    def __init__(self, *replies):
        self.messages = FakeMessages(replies)
        self.beta = type("Beta", (), {"messages": self.messages})()


def test_a_clean_brief_is_returned():
    client = FakeClient("Nifty support sits at 24,700.")
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok and result.attempts == 1
    assert result.usage["output_tokens"] == 300


def test_an_invented_number_triggers_one_regeneration():
    client = FakeClient("Nifty tested 24,612 overnight.", "Nifty support sits at 24,700.")
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok and result.attempts == 2
    retry_prompt = client.messages.calls[1]["messages"][0]["content"]
    assert "24,612" in retry_prompt and "not in the payload" in retry_prompt


def test_a_brief_that_keeps_inventing_is_dropped_not_published():
    client = FakeClient("Nifty tested 24,612.", "Still 24,612 on the second pass.")
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok is False
    assert result.text is None
    assert result.rejected_numbers == ["24,612"]
    assert "validation" in result.failure


def test_advice_also_triggers_regeneration():
    client = FakeClient("You should sell Infosys.", "Infosys sits at 1,035.")
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok and result.attempts == 2
    assert "recommendation" in client.messages.calls[1]["messages"][0]["content"]


def test_a_refusal_is_reported_not_retried():
    details = type("D", (), {"category": "general_harms"})()
    client = FakeClient(FakeResponse(content=[], stop_reason="refusal", stop_details=details))
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok is False and "declined" in result.failure
    assert len(client.messages.calls) == 1


def test_an_api_error_fails_soft():
    client = FakeClient(RuntimeError("connection reset"))
    result = brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    assert result.ok is False
    assert "connection reset" in result.failure


def test_a_missing_api_key_is_reported_without_calling_anything(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = brief.generate(PAYLOAD)
    assert result.ok is False and "ANTHROPIC_API_KEY" in result.failure


def test_the_request_uses_low_effort_and_the_fallback_on_supported_models():
    client = FakeClient("Nifty support sits at 24,700.")
    brief.generate(PAYLOAD, client=client, model="claude-opus-5-5")
    call = client.messages.calls[0]
    assert call["output_config"] == {"effort": "low"}
    assert call["fallbacks"] == "default"
    assert call["max_tokens"] == brief.MAX_TOKENS
    assert "thinking" not in call          # always-on model: sending it would 400


def test_an_unsupported_model_skips_the_fallback_parameter():
    client = FakeClient("Nifty support sits at 24,700.")
    brief.generate(PAYLOAD, client=client, model="claude-haiku-4-5")
    assert "fallbacks" not in client.messages.calls[0]


def test_the_prompt_file_drives_the_system_prompt():
    system, user = brief.load_prompt()
    assert "Never state a number that is not in the payload" in system
    assert "{{PAYLOAD}}" in user
    assert "No recommendations" in system


def test_a_level_a_hundred_points_off_is_not_absorbed_by_tolerance():
    """Regression: a flat relative tolerance let an invented Nifty level pass."""
    payload = {"nifty": {"support": 24700, "resistance": 25010}}
    assert unsupported("Support is at 24,612.", payload) == ["24,612"]
    assert unsupported("Support is at 24,750.", payload) == ["24,750"]
    assert unsupported("Support is at 24,700.", payload) == []


def test_rounding_is_allowed_only_at_the_precision_written():
    payload = {"value": 2258431.0}
    assert unsupported("₹22.6 L", payload) == []        # 22.58431 -> 22.6
    assert unsupported("₹22.58 L", payload) == []
    assert unsupported("₹22.59 L", payload) == ["22.59"]
