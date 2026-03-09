import { cookies } from "next/headers";
import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "default-secret-change-me";

function sign(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

export async function createSession() {
  const token = crypto.randomUUID();
  const signature = sign(token);
  const cookieStore = await cookies();
  cookieStore.set("session", `${token}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return false;
  const [token, signature] = session.split(".");
  if (!token || !signature) return false;
  return sign(token) === signature;
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
