import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";

export async function GET() {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = loadSettings();

  const platforms = [
    {
      id: "mastodon",
      name: "Mastodon",
      connected: !!settings.mastodon.accessToken,
      instance: settings.mastodon.apiBaseUrl,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      connected: !!settings.linkedin.accessToken,
    },
    {
      id: "facebook",
      name: "Facebook",
      connected: !!settings.facebook.accessToken && !!settings.facebook.pageId,
    },
    {
      id: "instagram",
      name: "Instagram",
      connected: !!settings.instagram.accessToken && !!settings.instagram.accountId,
    },
  ];

  return NextResponse.json(platforms);
}
