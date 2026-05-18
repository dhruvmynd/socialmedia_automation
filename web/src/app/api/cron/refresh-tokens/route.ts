import { NextRequest, NextResponse } from "next/server";

const GRAPH = "https://graph.facebook.com/v19.0";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;

  if (!vercelToken || !vercelProjectId) {
    return NextResponse.json({ error: "VERCEL_TOKEN or VERCEL_PROJECT_ID not set" }, { status: 400 });
  }

  const results: Record<string, string> = {};

  // Refresh Instagram long-lived token (expires every 60 days, refresh keeps it alive)
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAppId = process.env.INSTAGRAM_APP_ID || appId;
  const igAppSecret = process.env.INSTAGRAM_APP_SECRET || appSecret;
  if (igToken && igAppId && igAppSecret) {
    try {
      const resp = await fetch(
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${igAppId}&client_secret=${igAppSecret}&fb_exchange_token=${igToken}`
      );
      if (resp.ok) {
        const { access_token } = await resp.json();
        await updateVercelEnv(vercelToken, vercelProjectId, "INSTAGRAM_ACCESS_TOKEN", access_token);
        results.instagram = "refreshed";
      } else {
        results.instagram = `failed: ${await resp.text()}`;
      }
    } catch (e) {
      results.instagram = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  // Facebook uses a permanent page token — no refresh needed
  results.facebook = "skipped (permanent page token)";

  return NextResponse.json({ results });
}

async function updateVercelEnv(token: string, projectId: string, key: string, value: string) {
  const listResp = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listResp.ok) throw new Error(`Failed to list env vars: ${listResp.status}`);
  const { envs } = await listResp.json();
  const existing = envs.find((e: { key: string }) => e.key === key);

  if (existing) {
    const resp = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      }
    );
    if (!resp.ok) throw new Error(`Failed to update ${key}: ${resp.status}`);
  } else {
    const resp = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, target: ["production"], type: "encrypted" }),
      }
    );
    if (!resp.ok) throw new Error(`Failed to create ${key}: ${resp.status}`);
  }
}
