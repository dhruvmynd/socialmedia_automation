import { NextRequest, NextResponse } from "next/server";
import { loadPosts, updatePost } from "@/lib/posts";
import { validateSession } from "@/lib/auth";
import { postToMastodon } from "@/lib/platforms/mastodon";
import { postToLinkedIn } from "@/lib/platforms/linkedin";
import { postToFacebook } from "@/lib/platforms/facebook";
import { postToInstagram } from "@/lib/platforms/instagram";

const ALL_PLATFORMS = ["mastodon", "linkedin", "facebook", "instagram"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const posts = loadPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const text = post.title
    ? `${post.title}\n\n${post.content}`
    : post.content;
  const image = post.image || undefined;
  const video = post.video || undefined;

  const targets = post.platforms && post.platforms.length > 0
    ? post.platforms
    : ALL_PLATFORMS;

  const results: Record<string, { success: boolean; url?: string; id?: string; error?: string }> = {};

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

  const allSucceeded = Object.values(results).every((r) => r.success);
  const anySucceeded = Object.values(results).some((r) => r.success);

  if (anySucceeded) {
    updatePost(id, { posted: true, postedAt: new Date().toISOString() });
  }

  return NextResponse.json({ results, allSucceeded });
}
