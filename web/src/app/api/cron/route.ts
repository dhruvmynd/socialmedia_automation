import { NextRequest, NextResponse } from "next/server";
import { loadPosts, updatePost } from "@/lib/posts";
import { postToMastodon } from "@/lib/platforms/mastodon";
import { postToLinkedIn } from "@/lib/platforms/linkedin";
import { postToFacebook } from "@/lib/platforms/facebook";
import { postToInstagram } from "@/lib/platforms/instagram";

const ALL_PLATFORMS = ["mastodon", "linkedin", "facebook", "instagram"];

export async function GET(req: NextRequest) {
  // Optional: verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const posts = loadPosts();
  const duePosts = posts.filter(
    (p) =>
      !p.posted &&
      p.ready &&
      p.scheduledAt &&
      new Date(p.scheduledAt) <= now
  );

  if (duePosts.length === 0) {
    return NextResponse.json({ message: "No posts due", checked: posts.length });
  }

  const allResults: Record<string, Record<string, { success: boolean; error?: string }>> = {};

  for (const post of duePosts) {
    const text = post.title ? `${post.title}\n\n${post.content}` : post.content;
    const image = post.image || undefined;
    const video = post.video || undefined;
    const targets =
      post.platforms && post.platforms.length > 0 ? post.platforms : ALL_PLATFORMS;

    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const platform of targets) {
      switch (platform) {
        case "mastodon":
          results.mastodon = await postToMastodon(text, image, video);
          break;
        case "linkedin":
          results.linkedin = await postToLinkedIn(text, image, video);
          break;
        case "facebook":
          results.facebook = await postToFacebook(text, image, video);
          break;
        case "instagram":
          results.instagram = await postToInstagram(text, image, video);
          break;
      }
    }

    const anySucceeded = Object.values(results).some((r) => r.success);
    if (anySucceeded) {
      updatePost(post.id, { posted: true, postedAt: new Date().toISOString() });
    }

    allResults[post.id] = results;
  }

  return NextResponse.json({
    message: `Processed ${duePosts.length} post(s)`,
    results: allResults,
  });
}
