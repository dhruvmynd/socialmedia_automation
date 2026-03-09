import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings";
import { validateSession } from "@/lib/auth";

export async function GET() {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = loadSettings();
  // Mask tokens for display (show last 8 chars)
  const masked = {
    mastodon: {
      accessToken: maskToken(settings.mastodon.accessToken),
      apiBaseUrl: settings.mastodon.apiBaseUrl,
      connected: !!settings.mastodon.accessToken,
    },
    linkedin: {
      accessToken: maskToken(settings.linkedin.accessToken),
      organizationId: settings.linkedin.organizationId,
      connected: !!settings.linkedin.accessToken,
    },
    facebook: {
      accessToken: maskToken(settings.facebook.accessToken),
      pageId: settings.facebook.pageId,
      connected: !!settings.facebook.accessToken && !!settings.facebook.pageId,
    },
    instagram: {
      accessToken: maskToken(settings.instagram.accessToken),
      accountId: settings.instagram.accountId,
      connected: !!settings.instagram.accessToken && !!settings.instagram.accountId,
    },
  };
  return NextResponse.json(masked);
}

export async function PUT(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const current = loadSettings();

  // Only update fields that are provided (non-empty strings replace, empty strings clear)
  if (body.mastodon) {
    if (body.mastodon.accessToken !== undefined) current.mastodon.accessToken = body.mastodon.accessToken;
    if (body.mastodon.apiBaseUrl !== undefined) current.mastodon.apiBaseUrl = body.mastodon.apiBaseUrl;
  }
  if (body.linkedin) {
    if (body.linkedin.accessToken !== undefined) current.linkedin.accessToken = body.linkedin.accessToken;
    if (body.linkedin.organizationId !== undefined) current.linkedin.organizationId = body.linkedin.organizationId;
  }
  if (body.facebook) {
    if (body.facebook.accessToken !== undefined) current.facebook.accessToken = body.facebook.accessToken;
    if (body.facebook.pageId !== undefined) current.facebook.pageId = body.facebook.pageId;
  }
  if (body.instagram) {
    if (body.instagram.accessToken !== undefined) current.instagram.accessToken = body.instagram.accessToken;
    if (body.instagram.accountId !== undefined) current.instagram.accountId = body.instagram.accountId;
  }

  saveSettings(current);
  return NextResponse.json({ ok: true });
}

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "***";
  return "***" + token.slice(-8);
}
