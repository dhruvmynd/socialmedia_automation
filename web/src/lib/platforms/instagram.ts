import { loadSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

export async function postToInstagram(text: string, imageUrl?: string, videoUrl?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken, accountId } = settings.instagram;
  if (!accessToken) return { success: false, error: "Instagram token not configured. Go to Settings to add it." };
  if (!accountId) return { success: false, error: "Instagram account ID not configured. Go to Settings to add it." };
  if (!imageUrl && !videoUrl) return { success: false, error: "Instagram requires an image or video URL" };

  // Step 1: Create media container
  const createParams = new URLSearchParams({
    access_token: accessToken,
    caption: text,
  });

  if (videoUrl) {
    createParams.set("media_type", "REELS");
    createParams.set("video_url", videoUrl);
  } else if (imageUrl) {
    createParams.set("image_url", imageUrl);
  }

  const createResp = await fetch(`${GRAPH}/${accountId}/media?${createParams}`, { method: "POST" });
  if (!createResp.ok) {
    const errText = await createResp.text();
    return { success: false, error: `Instagram API error ${createResp.status}: ${errText}` };
  }
  const { id: containerId } = await createResp.json();

  // Step 2: Wait for container to be ready (videos take longer)
  const maxAttempts = videoUrl ? 30 : 10;
  const pollInterval = videoUrl ? 5000 : 2000;
  let ready = false;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusResp = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      if (statusData.status_code === "FINISHED") {
        ready = true;
        break;
      }
      if (statusData.status_code === "ERROR") {
        return { success: false, error: "Instagram media processing failed" };
      }
    }
  }
  if (!ready) return { success: false, error: "Instagram media processing timed out" };

  // Step 3: Publish
  const publishParams = new URLSearchParams({
    access_token: accessToken,
    creation_id: containerId,
  });
  const publishResp = await fetch(`${GRAPH}/${accountId}/media_publish?${publishParams}`, { method: "POST" });
  if (!publishResp.ok) {
    const errText = await publishResp.text();
    return { success: false, error: `Instagram publish error ${publishResp.status}: ${errText}` };
  }
  const data = await publishResp.json();
  return { success: true, id: data.id };
}
