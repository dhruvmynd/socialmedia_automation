import { NextRequest, NextResponse } from "next/server";
import { loadPosts, moveToPosted } from "@/lib/posts";
import { validateSession } from "@/lib/auth";
import { resolveMedia, moveMediaToPosted } from "@/lib/googleDrive";
import { PLATFORMS, postOnePlatform, resolvePlatform } from "@/lib/platforms/dispatch";

const ALL_PLATFORMS = Object.keys(PLATFORMS);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const posts = await loadPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Title is internal-only — only the content body is posted
  const text = post.content;

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const { image, images, video } = await resolveMedia(post.media, baseUrl);

  const targets = post.platforms && post.platforms.length > 0 ? post.platforms : ALL_PLATFORMS;

  const results: Record<string, { success: boolean; url?: string; id?: string; error?: string }> = {};

  for (const rawPlatform of targets) {
    const platform = resolvePlatform(rawPlatform);
    const config = PLATFORMS[platform];
    if (!config) {
      console.error(`[publish] unknown platform "${rawPlatform}" — expected one of ${Object.keys(PLATFORMS).join("/")}`);
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
      console.error(`[publish] ${platform} threw:`, e);
      results[platform] = { success: false, error: `Exception: ${msg}` };
    }
  }

  const allSucceeded = Object.values(results).every((r) => r.success);
  const anySucceeded = Object.values(results).some((r) => r.success);

  let mediaMoved: { moved: number; error?: string } | undefined;
  if (anySucceeded) {
    const errors = Object.entries(results)
      .filter(([, r]) => !r.success && r.error)
      .map(([platform, r]) => `${platform}: ${r.error}`)
      .join(" | ");
    await moveToPosted(id, new Date().toISOString(), errors || undefined);
    mediaMoved = await moveMediaToPosted(post.media);
  }

  return NextResponse.json({ results, allSucceeded, mediaMoved });
}
