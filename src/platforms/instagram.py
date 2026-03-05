"""
Instagram poster via the Facebook Graph API (Instagram Graph API).

Requirements:
  - A Facebook App with instagram_basic, instagram_content_publish permissions
  - A Business/Creator Instagram account connected to a Facebook Page
  - A long-lived User or Page access token

Env vars required:
  INSTAGRAM_ACCESS_TOKEN
  INSTAGRAM_ACCOUNT_ID

Limitations:
  - Single image: supported
  - Carousel (multiple images): supported (up to 10)
  - Video / Reels: supported (URL must be a publicly accessible mp4)
  - Media MUST be publicly accessible URLs; local paths are not supported by
    the Graph API. Host images somewhere (S3, imgbb, etc.) before posting.
"""

from __future__ import annotations

import os
import time

import requests

from src.utils.spreadsheet import Post

GRAPH = "https://graph.facebook.com/v19.0"


def _account_id() -> str:
    return os.environ["INSTAGRAM_ACCOUNT_ID"]


def _token() -> str:
    return os.environ["INSTAGRAM_ACCESS_TOKEN"]


def _raise_for(resp: requests.Response) -> None:
    if not resp.ok:
        raise RuntimeError(f"Instagram API error {resp.status_code}: {resp.text}")


# ── Single-image / video container ───────────────────────────────────────────

def _create_container(media_url: str, caption: str, is_video: bool = False) -> str:
    params = {
        "access_token": _token(),
        "caption": caption,
    }
    if is_video:
        params["media_type"] = "REELS"
        params["video_url"] = media_url
    else:
        params["image_url"] = media_url

    resp = requests.post(f"{GRAPH}/{_account_id()}/media", params=params)
    _raise_for(resp)
    return resp.json()["id"]


def _create_carousel_item(media_url: str) -> str:
    params = {
        "access_token": _token(),
        "image_url": media_url,
        "is_carousel_item": "true",
    }
    resp = requests.post(f"{GRAPH}/{_account_id()}/media", params=params)
    _raise_for(resp)
    return resp.json()["id"]


def _create_carousel_container(item_ids: list[str], caption: str) -> str:
    params = {
        "access_token": _token(),
        "media_type": "CAROUSEL",
        "children": ",".join(item_ids),
        "caption": caption,
    }
    resp = requests.post(f"{GRAPH}/{_account_id()}/media", params=params)
    _raise_for(resp)
    return resp.json()["id"]


def _wait_for_container(container_id: str, retries: int = 10, delay: int = 5) -> None:
    """Poll until the container status is FINISHED."""
    for _ in range(retries):
        resp = requests.get(
            f"{GRAPH}/{container_id}",
            params={"fields": "status_code", "access_token": _token()},
        )
        _raise_for(resp)
        status = resp.json().get("status_code", "")
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"Instagram container processing failed: {resp.text}")
        time.sleep(delay)
    raise TimeoutError("Instagram container did not finish processing in time.")


def _publish(container_id: str) -> dict:
    resp = requests.post(
        f"{GRAPH}/{_account_id()}/media_publish",
        params={"creation_id": container_id, "access_token": _token()},
    )
    _raise_for(resp)
    return resp.json()


# ── Public API ────────────────────────────────────────────────────────────────

def post(p: Post) -> dict:
    """Publish a Post to Instagram. Returns the API response dict."""
    caption = p.full_text
    media = p.media[:10]  # max 10 for carousel

    if not media:
        raise ValueError("Instagram requires at least one image/video URL.")

    if len(media) == 1:
        url = media[0]
        is_video = url.lower().endswith((".mp4", ".mov", ".avi"))
        container_id = _create_container(url, caption, is_video=is_video)
        _wait_for_container(container_id)
    else:
        item_ids = [_create_carousel_item(u) for u in media]
        container_id = _create_carousel_container(item_ids, caption)
        _wait_for_container(container_id)

    result = _publish(container_id)
    print(f"  [instagram] Posted: media id {result.get('id')}")
    return result
