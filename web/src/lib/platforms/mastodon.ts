import { loadSettings } from "@/lib/settings";

async function uploadMedia(mediaUrl: string, baseUrl: string, accessToken: string, isVideo: boolean): Promise<string | null> {
  const resp = await fetch(mediaUrl);
  if (!resp.ok) return null;
  const blob = await resp.blob();

  const form = new FormData();
  form.append("file", blob, isVideo ? "video.mp4" : "image.jpg");

  const uploadResp = await fetch(`${baseUrl}/api/v2/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!uploadResp.ok) return null;
  const data = await uploadResp.json();

  // For videos, Mastodon returns 202 and processes async — poll until ready
  if (isVideo && uploadResp.status === 202) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const checkResp = await fetch(`${baseUrl}/api/v1/media/${data.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (checkResp.status === 200) return data.id;
    }
    return null; // timed out
  }

  return data.id;
}

export async function postToMastodon(
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  extraImages: string[] = []
): Promise<{ success: boolean; url?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken, apiBaseUrl } = settings.mastodon;
  if (!accessToken) return { success: false, error: "Mastodon token not configured. Go to Settings to add it." };

  const body: Record<string, unknown> = { status: text };
  const mediaIds: string[] = [];

  if (videoUrl) {
    const id = await uploadMedia(videoUrl, apiBaseUrl, accessToken, true);
    if (id) {
      mediaIds.push(id);
    } else {
      return { success: false, error: "Failed to upload video to Mastodon" };
    }
  } else {
    // Mastodon allows up to 4 attachments per status
    const allImages = [
      ...(imageUrl ? [imageUrl] : []),
      ...extraImages.filter(Boolean),
    ].slice(0, 4);

    for (const url of allImages) {
      const id = await uploadMedia(url, apiBaseUrl, accessToken, false);
      if (id) mediaIds.push(id);
    }

    if (allImages.length > 0 && mediaIds.length === 0) {
      return { success: false, error: "Failed to upload images to Mastodon" };
    }
  }

  if (mediaIds.length > 0) {
    body.media_ids = mediaIds;
  }

  const resp = await fetch(`${apiBaseUrl}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Mastodon API error ${resp.status}: ${errText}` };
  }

  const data = await resp.json();
  return { success: true, url: data.url };
}
