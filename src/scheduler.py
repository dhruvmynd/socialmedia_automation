"""
Scheduler: reads pending posts from the spreadsheet and dispatches them
to the enabled platforms when their scheduled time arrives.

Usage (from project root):
  python -m src.scheduler --spreadsheet posts.xlsx --platforms mastodon facebook linkedin instagram

Behaviour:
  - Only rows with Ready == YES are processed.
  - If a row has no Scheduled At time, it is posted immediately.
  - If the scheduled time is in the past, it is posted immediately (with a warning).
  - If the scheduled time is in the future, the scheduler waits and posts at that time.
  - The scheduler loops every 30 seconds and checks the spreadsheet for new/updated rows.
  - Pass --once to post all due rows and exit (useful for cron jobs).
"""

from __future__ import annotations

import argparse
import importlib
import os
import time
from datetime import datetime, timedelta

from dotenv import load_dotenv

from src.utils.spreadsheet import Post, load_posts, mark_posted

load_dotenv()

PLATFORMS = ["mastodon", "facebook", "instagram", "linkedin"]
POLL_INTERVAL = 30  # seconds between spreadsheet re-reads


def _load_platform(name: str):
    return importlib.import_module(f"src.platforms.{name}")


def _is_due(p: Post, now: datetime) -> bool:
    if p.scheduled_at is None:
        return True  # no time → post immediately
    return p.scheduled_at <= now


def _post_to_platforms(p: Post, platforms: list[str], spreadsheet: str) -> None:
    targets = [p.platform] if p.platform and p.platform in platforms else platforms
    print(f"\nPosting: {p.title or p.content[:60]!r} → {', '.join(targets)}")
    all_succeeded = True
    for name in targets:
        try:
            mod = _load_platform(name)
            mod.post(p)
        except Exception as exc:
            print(f"  [{name}] ERROR: {exc}")
            all_succeeded = False
    if all_succeeded:
        mark_posted(spreadsheet, p)


# ── Tracking already-posted rows ──────────────────────────────────────────────

def _post_key(p: Post) -> str:
    """A unique-ish key for a post to avoid double-posting on re-reads."""
    return f"{p.title}|{p.content[:80]}|{p.scheduled_at}"


def run(spreadsheet: str, platforms: list[str], once: bool = False) -> None:
    posted: set[str] = set()
    print(f"Scheduler started. Watching {spreadsheet}")
    print(f"Platforms: {', '.join(platforms)}")

    while True:
        now = datetime.now()
        try:
            posts = load_posts(spreadsheet)
        except Exception as exc:
            print(f"[scheduler] Could not read spreadsheet: {exc}")
            if once:
                break
            time.sleep(POLL_INTERVAL)
            continue

        for p in posts:
            key = _post_key(p)
            if key in posted:
                continue
            if not _is_due(p, now):
                delta = p.scheduled_at - now
                print(f"  Scheduled in {delta} → {p.title or p.content[:40]!r}")
                continue
            if p.scheduled_at and p.scheduled_at < now - timedelta(hours=1):
                print(f"  [scheduler] WARNING: post is >1h overdue, posting now: {p.title!r}")
            _post_to_platforms(p, platforms, spreadsheet)
            posted.add(key)

        if once:
            break
        time.sleep(POLL_INTERVAL)


# ── CLI ───────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Social media post scheduler")
    parser.add_argument(
        "--spreadsheet",
        default=os.environ.get("SPREADSHEET_PATH", "posts.xlsx"),
        help="Path to CSV or Excel spreadsheet (default: posts.xlsx or $SPREADSHEET_PATH)",
    )
    parser.add_argument(
        "--platforms",
        nargs="+",
        default=PLATFORMS,
        choices=PLATFORMS,
        help="Platforms to post to (default: all)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Post all due rows immediately and exit (for cron jobs)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(spreadsheet=args.spreadsheet, platforms=args.platforms, once=args.once)
