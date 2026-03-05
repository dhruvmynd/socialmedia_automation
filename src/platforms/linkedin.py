"""
LinkedIn poster via the LinkedIn REST API (v2).

Supports:
  - Text-only posts
  - Single image upload
  - Multi-image posts (up to 9 images)
  - Video post (upload + register)

Env vars required:
  LINKEDIN_ACCESS_TOKEN
  LINKEDIN_ORGANIZATION_ID  (optional – leave blank to post as personal profile)

Scopes needed on your OAuth2 app:
  w_member_social  (personal posts)
  w_organization_social  (org posts)
  r_liteprofile  (to resolve the member URN)
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

from src.utils.spreadsheet import Post

API = "https://api.linkedin.com/v2"


def _token() -> str:
    return os.environ["LINKEDIN_ACCESS_TOKEN"]


def _headers(extra: dict | None = None) -> dict:
    h = {
        "Authorization": f"Bearer {_token()}",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202401",
    }
    if extra:
        h.update(extra)
    return h


def _raise_for(resp: requests.Response) -> None:
    if not resp.ok:
        raise RuntimeError(f"LinkedIn API error {resp.status_code}: {resp.text}")


def _author_urn() -> str:
    org_id = os.environ.get("LINKEDIN_ORGANIZATION_ID", "").strip()
    if org_id:
        return f"urn:li:organization:{org_id}"
    # Fall back to the authenticated member via OpenID Connect userinfo
    resp = requests.get("https://api.linkedin.com/v2/userinfo", headers=_headers())
    _raise_for(resp)
    return f"urn:li:person:{resp.json()['sub']}"


# ── Media upload helpers ──────────────────────────────────────────────────────

def _register_upload(author: str, media_category: str) -> tuple[str, str]:
    """Register an asset and get the upload URL + asset URN."""
    body = {
        "registerUploadRequest": {
            "owner": author,
            "recipes": [f"urn:li:digitalmediaRecipe:feedshare-{media_category}"],
            "serviceRelationships": [
                {
                    "identifier": "urn:li:userGeneratedContent",
                    "relationshipType": "OWNER",
                }
            ],
        }
    }
    resp = requests.post(
        f"{API}/assets?action=registerUpload",
        headers=_headers({"Content-Type": "application/json"}),
        json=body,
    )
    _raise_for(resp)
    data = resp.json()["value"]
    upload_url = data["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]["uploadUrl"]
    asset = data["asset"]
    return upload_url, asset


def _upload_binary(upload_url: str, path_or_url: str, mime: str) -> None:
    p = Path(path_or_url)
    if p.exists():
        with open(p, "rb") as f:
            data = f.read()
    else:
        r = requests.get(path_or_url)
        r.raise_for_status()
        data = r.content
    resp = requests.put(upload_url, headers={"Content-Type": mime}, data=data)
    _raise_for(resp)


def _upload_image(author: str, path_or_url: str) -> str:
    upload_url, asset = _register_upload(author, "image")
    _upload_binary(upload_url, path_or_url, "image/jpeg")
    return asset


def _upload_video(author: str, path_or_url: str) -> str:
    upload_url, asset = _register_upload(author, "video")
    _upload_binary(upload_url, path_or_url, "video/mp4")
    return asset


# ── Post construction ────────────────────────────────────────────────────────

def _text_post(author: str, text: str) -> dict:
    body = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    resp = requests.post(
        f"{API}/ugcPosts",
        headers=_headers({"Content-Type": "application/json"}),
        json=body,
    )
    _raise_for(resp)
    return resp.json()


def _media_post(author: str, text: str, assets: list[str], category: str) -> dict:
    media_list = [
        {"status": "READY", "media": a, "title": {"text": ""}} for a in assets
    ]
    body = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": category,
                "media": media_list,
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    resp = requests.post(
        f"{API}/ugcPosts",
        headers=_headers({"Content-Type": "application/json"}),
        json=body,
    )
    _raise_for(resp)
    return resp.json()


# ── Public API ────────────────────────────────────────────────────────────────

def post(p: Post) -> dict:
    """Publish a Post to LinkedIn. Returns the API response dict."""
    author = _author_urn()
    text = p.full_text
    media = p.media

    if not media:
        result = _text_post(author, text)
        print(f"  [linkedin] Text post created: {result.get('id')}")
        return result

    # Detect video
    if len(media) == 1 and media[0].lower().endswith((".mp4", ".mov")):
        asset = _upload_video(author, media[0])
        result = _media_post(author, text, [asset], "VIDEO")
        print(f"  [linkedin] Video post created: {result.get('id')}")
        return result

    # Image(s)
    assets = [_upload_image(author, m) for m in media[:9]]
    result = _media_post(author, text, assets, "IMAGE")
    print(f"  [linkedin] Image post created: {result.get('id')}")
    return result
