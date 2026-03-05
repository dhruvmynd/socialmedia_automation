"""
Facebook poster via the Graph API.

Supports:
  - Text-only posts
  - Single photo
  - Multi-photo posts (attached as a batch)
  - Video post (link to publicly accessible video URL)

Env vars required:
  FACEBOOK_ACCESS_TOKEN   (Page access token with pages_manage_posts scope)
  FACEBOOK_PAGE_ID

Media can be public URLs or local file paths.
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

from src.utils.spreadsheet import Post

GRAPH = "https://graph.facebook.com/v19.0"


def _page_id() -> str:
    return os.environ["FACEBOOK_PAGE_ID"]


def _token() -> str:
    return os.environ["FACEBOOK_ACCESS_TOKEN"]


def _raise_for(resp: requests.Response) -> None:
    if not resp.ok:
        raise RuntimeError(f"Facebook API error {resp.status_code}: {resp.text}")


def _upload_photo(media: str) -> str:
    """Upload a photo (URL or local path) and return its photo id."""
    p = Path(media)
    if p.exists():
        with open(p, "rb") as f:
            resp = requests.post(
                f"{GRAPH}/{_page_id()}/photos",
                params={"access_token": _token(), "published": "false"},
                files={"source": f},
            )
    else:
        resp = requests.post(
            f"{GRAPH}/{_page_id()}/photos",
            params={"access_token": _token(), "url": media, "published": "false"},
        )
    _raise_for(resp)
    return resp.json()["id"]


def post(p: Post) -> dict:
    """Publish a Post to a Facebook Page. Returns the API response dict."""
    message = p.full_text
    media = p.media

    # ── Video post ────────────────────────────────────────────────────────────
    if len(media) == 1 and media[0].lower().endswith((".mp4", ".mov", ".avi")):
        params = {
            "access_token": _token(),
            "description": message,
            "file_url": media[0],
        }
        resp = requests.post(f"{GRAPH}/{_page_id()}/videos", params=params)
        _raise_for(resp)
        result = resp.json()
        print(f"  [facebook] Video posted: id {result.get('id')}")
        return result

    # ── Single photo ──────────────────────────────────────────────────────────
    if len(media) == 1:
        p_obj = Path(media[0])
        if p_obj.exists():
            with open(p_obj, "rb") as f:
                resp = requests.post(
                    f"{GRAPH}/{_page_id()}/photos",
                    params={"access_token": _token(), "message": message},
                    files={"source": f},
                )
        else:
            resp = requests.post(
                f"{GRAPH}/{_page_id()}/photos",
                params={"access_token": _token(), "url": media[0], "message": message},
            )
        _raise_for(resp)
        result = resp.json()
        print(f"  [facebook] Photo posted: id {result.get('id')}")
        return result

    # ── Multi-photo post ──────────────────────────────────────────────────────
    if len(media) > 1:
        photo_ids = [_upload_photo(m) for m in media[:10]]
        attached = [{"media_fbid": pid} for pid in photo_ids]
        resp = requests.post(
            f"{GRAPH}/{_page_id()}/feed",
            params={"access_token": _token()},
            json={"message": message, "attached_media": attached},
        )
        _raise_for(resp)
        result = resp.json()
        print(f"  [facebook] Multi-photo post: id {result.get('id')}")
        return result

    # ── Text-only post ────────────────────────────────────────────────────────
    resp = requests.post(
        f"{GRAPH}/{_page_id()}/feed",
        params={"access_token": _token(), "message": message},
    )
    _raise_for(resp)
    result = resp.json()
    print(f"  [facebook] Text post: id {result.get('id')}")
    return result
