"""
Main CLI entrypoint for Social Media Automation.

Commands:
  post       Post all due rows from the spreadsheet right now (--once mode)
  schedule   Run the continuous scheduler (polls every 30 s)
  preview    Print what would be posted without actually posting
  rewrite    Rewrite a row's content via OpenAI for a specific platform and print it

Examples:
  python -m src.main post --spreadsheet posts.xlsx
  python -m src.main post --platforms mastodon linkedin
  python -m src.main post --rewrite            # rewrite before posting
  python -m src.main schedule --spreadsheet posts.xlsx
  python -m src.main preview --spreadsheet posts.xlsx
  python -m src.main rewrite --spreadsheet posts.xlsx --platform linkedin
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime

from dotenv import load_dotenv

from src.utils.spreadsheet import load_posts, mark_posted

load_dotenv()

ALL_PLATFORMS = ["mastodon", "facebook", "instagram", "linkedin"]


# ── helpers ───────────────────────────────────────────────────────────────────

def _post_now(spreadsheet: str, platforms: list[str], rewrite: bool) -> None:
    """Post all ready+due rows immediately."""
    import importlib

    posts = load_posts(spreadsheet)
    now = datetime.now()
    due = [p for p in posts if p.scheduled_at is None or p.scheduled_at <= now]

    if not due:
        print("No posts are due right now.")
        return

    for p in due:
        # If the row specifies a platform, only post to that one (if it's in the
        # enabled list). Otherwise post to all enabled platforms.
        targets = [p.platform] if p.platform and p.platform in platforms else platforms
        print(f"\n--- {p.title or p.content[:60]!r} → {', '.join(targets)} ---")
        all_succeeded = True
        for platform in targets:
            try:
                current = p
                if rewrite:
                    from src.utils.rewriter import rewrite as ai_rewrite
                    current = ai_rewrite(p, platform)
                    print(f"  [{platform}] Rewritten text:\n{current.full_text[:200]}...")
                mod = importlib.import_module(f"src.platforms.{platform}")
                mod.post(current)
            except Exception as exc:
                print(f"  [{platform}] ERROR: {exc}")
                all_succeeded = False
        if all_succeeded:
            mark_posted(spreadsheet, p)


def _preview(spreadsheet: str, platforms: list[str]) -> None:
    """Print posts that would be sent without actually posting."""
    posts = load_posts(spreadsheet)
    now = datetime.now()

    print(f"Spreadsheet: {spreadsheet}")
    print(f"Platforms:   {', '.join(platforms)}")
    print(f"Time now:    {now.strftime('%Y-%m-%d %H:%M')}\n")

    if not posts:
        print("No ready posts found (Ready == YES).")
        return

    for i, p in enumerate(posts, 1):
        status = "DUE NOW" if (p.scheduled_at is None or p.scheduled_at <= now) else f"scheduled {p.scheduled_at}"
        targets = [p.platform] if p.platform and p.platform in platforms else platforms
        print(f"[{i}] {status} → {', '.join(targets)}")
        print(f"     Title:   {p.title}")
        print(f"     Content: {p.content[:120]}{'...' if len(p.content) > 120 else ''}")
        print(f"     Media:   {p.media or 'none'}")
        print()


def _rewrite_preview(spreadsheet: str, platform: str) -> None:
    """Rewrite all ready posts for a platform and print the result."""
    from src.utils.rewriter import rewrite as ai_rewrite

    posts = load_posts(spreadsheet)
    if not posts:
        print("No ready posts found.")
        return
    for p in posts:
        print(f"\n--- Original ({p.title}) ---")
        print(p.full_text)
        rewritten = ai_rewrite(p, platform)
        print(f"\n--- Rewritten for {platform} ---")
        print(rewritten.full_text)
        print()


# ── CLI ───────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="social-media-auto",
        description="Social Media Automation – spreadsheet to multi-platform posts",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # shared spreadsheet + platform args
    def _add_common(p):
        p.add_argument(
            "--spreadsheet",
            default=os.environ.get("SPREADSHEET_PATH", "posts.xlsx"),
            help="Path to .csv or .xlsx file",
        )
        p.add_argument(
            "--platforms",
            nargs="+",
            default=ALL_PLATFORMS,
            choices=ALL_PLATFORMS,
            metavar="PLATFORM",
            help=f"Platforms to post to (default: all). Choices: {ALL_PLATFORMS}",
        )

    # post
    p_post = sub.add_parser("post", help="Post all due rows immediately")
    _add_common(p_post)
    p_post.add_argument(
        "--rewrite",
        action="store_true",
        help="Rewrite content via OpenAI before posting (requires OPENAI_API_KEY)",
    )

    # schedule
    p_sched = sub.add_parser("schedule", help="Run continuous scheduler (polls every 30 s)")
    _add_common(p_sched)
    p_sched.add_argument(
        "--rewrite",
        action="store_true",
        help="Rewrite content via OpenAI before posting",
    )

    # preview
    p_prev = sub.add_parser("preview", help="Preview what would be posted (dry run)")
    _add_common(p_prev)

    # rewrite
    p_rew = sub.add_parser("rewrite", help="Preview AI-rewritten content for a platform")
    p_rew.add_argument(
        "--spreadsheet",
        default=os.environ.get("SPREADSHEET_PATH", "posts.xlsx"),
        help="Path to .csv or .xlsx file",
    )
    p_rew.add_argument(
        "--platform",
        required=True,
        choices=ALL_PLATFORMS,
        help="Target platform for the rewrite",
    )

    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "post":
        _post_now(args.spreadsheet, args.platforms, rewrite=args.rewrite)

    elif args.command == "schedule":
        from src.scheduler import run
        run(spreadsheet=args.spreadsheet, platforms=args.platforms, once=False)

    elif args.command == "preview":
        _preview(args.spreadsheet, args.platforms)

    elif args.command == "rewrite":
        _rewrite_preview(args.spreadsheet, args.platform)


if __name__ == "__main__":
    main()
