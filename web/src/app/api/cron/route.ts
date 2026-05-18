import { NextRequest, NextResponse } from "next/server";
import { loadPosts, moveToPosted, updatePostFields } from "@/lib/posts";
import { resolveMedia, moveMediaToPosted } from "@/lib/googleDrive";
import { PLATFORMS, postOnePlatform, resolvePlatform } from "@/lib/platforms/dispatch";

const ALL_PLATFORMS = Object.keys(PLATFORMS);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const posts = await loadPosts();
  const duePosts = posts.filter((p) => {
    if (p.posted || !p.ready || !p.scheduledAt) return false;
    // scheduledAt is normalized to ISO upstream in coerceScheduledAt; we
    // only fall back to space→T for legacy values that might still slip in.
    const iso = p.scheduledAt.includes("T") ? p.scheduledAt : p.scheduledAt.replace(" ", "T");
    const due = new Date(iso);
    if (isNaN(due.getTime())) {
      console.warn(`[cron] post ${p.id} has unparseable scheduledAt=${JSON.stringify(p.scheduledAt)} — skipping`);
      return false;
    }
    const isDue = due <= now;
    console.log(`[cron] post ${p.id} scheduledAt=${p.scheduledAt} parsed=${due.toISOString()} now=${now.toISOString()} due=${isDue}`);
    return isDue;
  });

  if (duePosts.length === 0) {
    return NextResponse.json({ message: "No posts due", checked: posts.length });
  }

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const allResults: Record<string, Record<string, { success: boolean; error?: string }>> = {};

  for (const post of duePosts) {
    // Title is internal-only — only the content body is posted
    const text = post.content;
    const { image, images, video } = await resolveMedia(post.media, baseUrl);
    const targets = post.platforms && post.platforms.length > 0 ? post.platforms : ALL_PLATFORMS;

    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const rawPlatform of targets) {
      const platform = resolvePlatform(rawPlatform);
      const config = PLATFORMS[platform];
      if (!config) {
        console.error(`[cron] unknown platform "${rawPlatform}" — expected one of ${Object.keys(PLATFORMS).join("/")}`);
        results[rawPlatform] = {
          success: false,
          error: `Unknown platform "${rawPlatform}". Use one of: ${Object.keys(PLATFORMS).join(", ")} (case-insensitive).`,
        };
        continue;
      }
      try {
        results[platform] = await postOnePlatform(text, image, video, images, config);
      } catch (e) {
        const msg = e instanceof Error ? `${e.message}` : String(e);
        console.error(`[cron] ${platform} threw:`, e);
        results[platform] = { success: false, error: `Exception: ${msg}` };
      }
    }

    const anySucceeded = Object.values(results).some((r) => r.success);
    const errors = Object.entries(results)
      .filter(([, r]) => !r.success && r.error)
      .map(([platform, r]) => `${platform}: ${r.error}`)
      .join(" | ");

    if (anySucceeded) {
      await moveToPosted(post.id, new Date().toISOString(), errors || undefined);
      await moveMediaToPosted(post.media);
    } else {
      // Mark not-ready so we stop hammering the platforms (and the sheet)
      // every minute. The user must fix the issue and re-tick "Ready".
      // Skip the write entirely if nothing has changed to avoid spurious
      // sheet flashes when the same error repeats.
      const newError = errors || "Unknown error";
      if (post.error !== newError || post.ready) {
        await updatePostFields(post.id, { error: newError, ready: false });
      }
    }

    allResults[post.id] = results;
  }

  return NextResponse.json({
    message: `Processed ${duePosts.length} post(s)`,
    results: allResults,
  });
}
