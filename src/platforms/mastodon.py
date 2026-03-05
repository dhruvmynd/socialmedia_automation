"""
Mastodon poster using Mastodon.py.

Env vars required:
  MASTODON_ACCESS_TOKEN
  MASTODON_API_BASE_URL   (default: https://mastodon.social)
"""

from __future__ import annotations

import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional

from mastodon import Mastodon as _Mastodon

from src.utils.spreadsheet import Post


def _client() -> _Mastodon:
    token = os.environ["MASTODON_ACCESS_TOKEN"]
    base_url = os.environ.get("MASTODON_API_BASE_URL", "https://mastodon.social")
    return _Mastodon(access_token=token, api_base_url=base_url)


def _upload_media(client: _Mastodon, path_or_url: str) -> Optional[str]:
    """Upload a local file or download a remote URL and upload it."""
    p = Path(path_or_url)
    if p.exists():
        media = client.media_post(str(p))
        return media["id"]
    # Remote URL — download to a temp file then upload
    suffix = Path(path_or_url.split("?")[0]).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        urllib.request.urlretrieve(path_or_url, tmp_path)
        media = client.media_post(tmp_path)
        return media["id"]
    except Exception as exc:
        print(f"  [mastodon] WARNING: could not download media {path_or_url}: {exc}")
        return None
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def post(p: Post) -> dict:
    """
    Publish a Post to Mastodon.

    Mastodon character limit is 500 (configurable per instance).
    Text is truncated with a warning if it exceeds that.
    Returns the status dict from the API.
    """
    client = _client()

    text = p.full_text
    if len(text) > 500:
        print(f"  [mastodon] WARNING: text truncated from {len(text)} to 500 chars")
        text = text[:497] + "..."

    media_ids = []
    for m in p.media[:4]:   # Mastodon max 4 attachments
        mid = _upload_media(client, m)
        if mid:
            media_ids.append(mid)

    result = client.status_post(
        status=text,
        media_ids=media_ids if media_ids else None,
        visibility="public",
    )
    print(f"  [mastodon] Posted: {result['url']}")
    return result
