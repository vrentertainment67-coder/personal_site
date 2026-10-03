"""The news filter: a headline must name the company to count as its news."""

import pytest

from desk.sources.news import identifying_words, mentions, parse_rss

RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Infosys wins a large cloud deal - Economic Times</title><link>a</link>
<pubDate>Fri, 03 Oct 2026 04:00:00 GMT</pubDate></item>
<item><title>Sensex, Nifty extend winning streak led by financial stocks - DD News</title>
<link>b</link></item>
</channel></rss>"""


def test_rss_is_parsed_with_its_source_split_off_the_title():
    items = parse_rss(RSS, limit=5)
    assert items[0].title == "Infosys wins a large cloud deal"
    assert items[0].source == "Economic Times"


@pytest.mark.parametrize("title", [
    "Jio Financial Services Q2 profit rises 12%",
    "JIOFIN gains 4% after the board meeting",
])
def test_a_headline_naming_the_company_is_kept(title):
    assert mentions(title, "Jio Financial Services", "JIOFIN")


@pytest.mark.parametrize("title", [
    "Sensex, Nifty extend winning streak to 3rd session led by auto, financial stocks",
    "JioBlackRock Nifty Next 50 Index Fund - Regular Plan Portfolio",
    "Share Market Live: Latest Share Market News",
])
def test_generic_market_noise_is_dropped(title):
    """These three all came back as "Jio Financial news" in a live run."""
    assert not mentions(title, "Jio Financial Services", "JIOFIN")


def test_common_words_alone_do_not_match():
    assert not mentions("Power demand rises across the grid this quarter", "Power Grid", "POWERGRID")
    assert mentions("Power Grid wins a transmission project", "Power Grid", "POWERGRID")


def test_the_ticker_alone_is_enough():
    assert mentions("Brokerages raise TATASTEEL target", "Tata Steel", "TATASTEEL")


def test_identifying_words_drop_the_boilerplate():
    assert identifying_words("Jio Financial Services") == {"jio"}
    assert identifying_words("Adani Total Gas") == {"adani", "total"}


def test_a_short_name_must_appear_as_a_phrase():
    """"Power" and "grid" separately match half the market."""
    assert mentions("Power Grid wins a transmission project", "Power Grid", "POWERGRID")
    assert not mentions("Power demand rises across the grid", "Power Grid", "POWERGRID")
    assert mentions("Tata Steel lifts output", "Tata Steel", "TATASTEEL")
    assert not mentions("Tata Motors and JSW Steel gain", "Tata Steel", "TATASTEEL")


def test_a_prefix_match_is_not_a_mention():
    """JioBlackRock is not Jio Financial Services."""
    assert not mentions("JioBlackRock Nifty Next 50 Index Fund", "Jio Financial Services", "JIOFIN")


def test_a_two_word_company_needs_both_words():
    assert mentions("Adani Total Gas raises capex", "Adani Total Gas", "ATGL")
    assert not mentions("Adani Power posts higher output", "Adani Total Gas", "ATGL")
