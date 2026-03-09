import { NextRequest, NextResponse } from "next/server";
import { loadPosts, addPost } from "@/lib/posts";
import { validateSession } from "@/lib/auth";

export async function GET() {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const posts = loadPosts();
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const post = addPost({
    title: body.title || "",
    content: body.content || "",
    image: body.image || "",
    scheduledAt: body.scheduledAt || "",
    ready: body.ready ?? false,
    platforms: body.platforms || [],
    posted: false,
  });
  return NextResponse.json(post);
}
