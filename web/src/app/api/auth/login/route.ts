import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (
    username === process.env.AUTH_USERNAME &&
    password === process.env.AUTH_PASSWORD
  ) {
    await createSession();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
}
