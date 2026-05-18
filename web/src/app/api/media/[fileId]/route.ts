import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getDriveFileStream } from "@/lib/googleDrive";

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId: rawFileId } = await params;
  // Meta's Graph API image fetcher dislikes query strings — using a path-style
  // `.jpg` suffix on the fileId (e.g. /api/media/<id>.jpg) is treated by Meta
  // as a real image URL. Strip the extension before calling Drive and force
  // JPEG conversion when it's present.
  const wantJpeg =
    /\.(jpe?g)$/i.test(rawFileId) ||
    req.nextUrl.searchParams.get("format") === "jpg";
  const fileId = rawFileId.replace(/\.(jpe?g|png|webp)$/i, "");

  try {
    const { mimeType, data } = await getDriveFileStream(fileId);

    if (wantJpeg && mimeType !== "image/jpeg") {
      const converted = await sharp(data)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 90 })
        .toBuffer();
      return new NextResponse(new Uint8Array(converted), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": converted.length.toString(),
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[media] failed to serve", fileId, e);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
