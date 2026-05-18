import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

async function updateVercelEnv(key: string, value: string) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;
  if (!vercelToken || !vercelProjectId) return;

  const listResp = await fetch(
    `https://api.vercel.com/v9/projects/${vercelProjectId}/env`,
    { headers: { Authorization: `Bearer ${vercelToken}` } }
  );
  if (!listResp.ok) return;
  const { envs } = await listResp.json();
  const existing = envs.find((e: { key: string }) => e.key === key);

  if (existing) {
    await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } else {
    await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/env`, {
      method: "POST",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, target: ["production"], type: "encrypted" }),
    });
  }
}

export async function POST(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await req.json();
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set in environment variables" },
      { status: 400 }
    );
  }

  const settings = loadSettings();

  if (platform === "facebook") {
    const currentToken = settings.facebook.accessToken;
    if (!currentToken) {
      return NextResponse.json({ error: "No Facebook token configured" }, { status: 400 });
    }

    // Step 1: exchange for long-lived user token (60 days)
    const llResp = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`
    );
    if (!llResp.ok) {
      const err = await llResp.text();
      return NextResponse.json({ error: `Failed to get long-lived token: ${err}` }, { status: 400 });
    }
    const { access_token: longLivedToken } = await llResp.json();

    // Step 2: get permanent page token from long-lived user token
    const pageId = settings.facebook.pageId;
    if (!pageId) {
      return NextResponse.json({ error: "FACEBOOK_PAGE_ID not configured" }, { status: 400 });
    }
    const pageResp = await fetch(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${longLivedToken}`
    );
    if (!pageResp.ok) {
      const err = await pageResp.text();
      return NextResponse.json({ error: `Failed to get page token: ${err}` }, { status: 400 });
    }
    const pageData = await pageResp.json();
    const permanentPageToken = pageData.access_token;
    if (!permanentPageToken) {
      return NextResponse.json({ error: "No page token returned. Make sure the token has manage_pages permission." }, { status: 400 });
    }

    // Step 3: auto-save permanent page token to Vercel env vars
    await updateVercelEnv("FACEBOOK_ACCESS_TOKEN", permanentPageToken);

    return NextResponse.json({
      success: true,
      message: "Facebook token upgraded to a permanent page token and saved automatically.",
    });
  }

  if (platform === "instagram") {
    const currentToken = settings.instagram.accessToken;
    if (!currentToken) {
      return NextResponse.json({ error: "No Instagram token configured" }, { status: 400 });
    }

    const igAppId = process.env.INSTAGRAM_APP_ID || appId;
    const igAppSecret = process.env.INSTAGRAM_APP_SECRET || appSecret;

    const llResp = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${igAppId}&client_secret=${igAppSecret}&fb_exchange_token=${currentToken}`
    );
    if (!llResp.ok) {
      const err = await llResp.text();
      return NextResponse.json({ error: `Failed to get long-lived token: ${err}` }, { status: 400 });
    }
    const { access_token: longLivedToken } = await llResp.json();

    await updateVercelEnv("INSTAGRAM_ACCESS_TOKEN", longLivedToken);

    return NextResponse.json({
      success: true,
      message: "Instagram token extended to 60 days and saved automatically.",
    });
  }

  return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
}
