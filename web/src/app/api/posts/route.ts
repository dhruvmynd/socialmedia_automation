import { NextRequest, NextResponse } from "next/server";
import { loadPosts, addPost } from "@/lib/posts";
import { validateSession } from "@/lib/auth";

export async function GET() {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const posts = await loadPosts();
    return NextResponse.json(posts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const post = await addPost({
    title: body.title || "",
    content: body.content || "",
    media: body.media || "",
    scheduledAt: body.scheduledAt || "",
    ready: body.ready ?? false,
    platforms: body.platforms || [],
    posted: false,
  });
  return NextResponse.json(post);
}
