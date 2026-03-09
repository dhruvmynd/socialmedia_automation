import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { loadSettings, saveSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

export async function POST(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await req.json();
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set in .env.local" },
      { status: 400 }
    );
  }

  const settings = loadSettings();

  if (platform === "facebook") {
    const shortToken = settings.facebook.accessToken;
    const pageId = settings.facebook.pageId;
    if (!shortToken) {
      return NextResponse.json({ error: "No Facebook token configured" }, { status: 400 });
    }

    // Step 1: Exchange short-lived user token for long-lived user token
    const llResp = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    if (!llResp.ok) {
      const err = await llResp.text();
      return NextResponse.json({ error: `Failed to get long-lived token: ${err}` }, { status: 400 });
    }
    const { access_token: longLivedUserToken } = await llResp.json();

    // Step 2: Get permanent page token using long-lived user token
    if (pageId) {
      const pageResp = await fetch(
        `${GRAPH}/${pageId}?fields=access_token&access_token=${longLivedUserToken}`
      );
      if (pageResp.ok) {
        const pageData = await pageResp.json();
        // This page token never expires
        settings.facebook.accessToken = pageData.access_token || longLivedUserToken;
      } else {
        // Fallback to long-lived user token
        settings.facebook.accessToken = longLivedUserToken;
      }
    } else {
      settings.facebook.accessToken = longLivedUserToken;
    }

    saveSettings(settings);
    return NextResponse.json({ success: true, message: "Facebook token extended permanently" });
  }

  if (platform === "instagram") {
    const shortToken = settings.instagram.accessToken;
    if (!shortToken) {
      return NextResponse.json({ error: "No Instagram token configured" }, { status: 400 });
    }

    // Exchange short-lived user token for long-lived user token (60 days)
    const llResp = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    if (!llResp.ok) {
      const err = await llResp.text();
      return NextResponse.json({ error: `Failed to get long-lived token: ${err}` }, { status: 400 });
    }
    const { access_token: longLivedToken } = await llResp.json();

    settings.instagram.accessToken = longLivedToken;
    saveSettings(settings);
    return NextResponse.json({ success: true, message: "Instagram token extended to 60 days" });
  }

  return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
}
