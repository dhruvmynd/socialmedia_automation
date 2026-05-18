import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { loadPosts } from "@/lib/posts";

// POST /api/sync/google-sheets?direction=pull
// Since posts are now stored directly in Google Sheets, "pull" refreshes the view
// and "push" is a no-op (data is already in the sheet).
export async function POST(req: NextRequest) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction") || "pull";

  try {
    if (direction === "pull" || direction === "push") {
      const posts = await loadPosts();
      return NextResponse.json({
        success: true,
        message: `Synced ${posts.length} post(s) from Google Sheets`,
      });
    }

    return NextResponse.json({ error: "Invalid direction. Use push or pull." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
