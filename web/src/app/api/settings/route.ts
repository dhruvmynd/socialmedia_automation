import { NextResponse } from "next/server";
import { loadSettings } from "@/lib/settings";
import { validateSession } from "@/lib/auth";

export async function GET() {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = loadSettings();
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

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "***";
  return "***" + token.slice(-8);
}
