"""
Optional OpenAI content rewriter.

Takes a Post's text and rewrites it for a target platform's tone/length
using the configured OpenAI model.

Env vars:
  OPENAI_API_KEY   (required if rewriting is enabled)
  OPENAI_MODEL     (default: gpt-4o)

SFU CoPilot note:
  SFU CoPilot is powered by OpenAI models and exposes an OpenAI-compatible
  API endpoint. Set OPENAI_BASE_URL to the SFU CoPilot endpoint and
  OPENAI_API_KEY to your SFU CoPilot key to route requests through it.
  Example:
    OPENAI_BASE_URL=https://copilot.sfu.ca/api/openai   # (confirm actual URL with SFU IT)
    OPENAI_API_KEY=your_sfu_copilot_key
    OPENAI_MODEL=gpt-4o   # or whatever model CoPilot exposes
"""

from __future__ import annotations

import os
from dataclasses import replace

from openai import OpenAI

from src.utils.spreadsheet import Post

# Platform-specific instructions
_PLATFORM_HINTS: dict[str, str] = {
    "mastodon": (
        "Rewrite for Mastodon (federated social, tech-savvy audience). "
        "Keep it under 480 characters. Be direct, informative, and community-friendly. "
        "No hashtag spam; 1-3 relevant hashtags max."
    ),
    "instagram": (
        "Rewrite for Instagram. Engaging, visual storytelling tone. "
        "Up to 2200 characters but hook in the first 125. "
        "Use 5-15 relevant hashtags at the end."
    ),
    "facebook": (
        "Rewrite for Facebook. Conversational, accessible tone for a general audience. "
        "1-3 short paragraphs. Add a light call-to-action if appropriate. "
        "Minimal hashtags (0-3)."
    ),
    "linkedin": (
        "Rewrite for LinkedIn. Professional but human tone. "
        "Lead with insight or a hook. 150-400 words. "
        "End with a question or call-to-action. 3-5 relevant hashtags."
    ),
}

_DEFAULT_SYSTEM = (
    "You are an expert social media copywriter. "
    "Rewrite the provided post text for the specified platform. "
    "Preserve the core message and factual content. "
    "Return ONLY the rewritten text, nothing else."
)


def _client() -> OpenAI:
    kwargs: dict = {"api_key": os.environ["OPENAI_API_KEY"]}
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def rewrite(p: Post, platform: str) -> Post:
    """
    Return a new Post with content rewritten for `platform`.
    The original Post is not modified.
    """
    hint = _PLATFORM_HINTS.get(platform, f"Rewrite for {platform}.")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    client = _client()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _DEFAULT_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Platform instructions: {hint}\n\n"
                    f"Original post title: {p.title}\n\n"
                    f"Original post text:\n{p.content}"
                ),
            },
        ],
        temperature=0.7,
    )
    rewritten = response.choices[0].message.content.strip()
    return replace(p, content=rewritten)
