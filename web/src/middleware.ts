import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.SESSION_SECRET || "default-secret-change-me";

async function verify(cookieValue: string): Promise<boolean> {
  const [token, signature] = cookieValue.split(".");
  if (!token || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and login API
  if (pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/api/cron") || pathname.startsWith("/api/media")) {
    return NextResponse.next();
  }

  const session = req.cookies.get("session")?.value;
  if (!session || !(await verify(session))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
