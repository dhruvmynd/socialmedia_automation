import { loadSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

/** Meta's Graph API image fetcher rejects `*.vercel.app` URLs (returns
 *  9004/2207052 even when the URL serves valid bytes), so for images we
 *  rewrite our proxy URL to an `lh3.googleusercontent.com` direct URL —
 *  no redirect, JPEG render forced via `=w1080-rj`.
 *
 *  Videos go through the in-app `/api/media/<id>` proxy as-is. The Drive
 *  `/uc?export=download` redirect chain is what FB's video fetcher tolerates
 *  but IG Reels' fetcher does not, so we serve the bytes directly with the
 *  correct `video/mp4` Content-Type from our own host.
 *
 *  Image requirement: the file (or its parent folder) must be shared as
 *  "anyone with the link can view" for lh3's CDN to serve it. */
function toMetaSafeImageUrl(url: string): string {
  const match = url.match(/\/api\/media\/([a-zA-Z0-9_-]+)(?:\.[a-z]+)?(?:\?|$)/i);
  if (!match) return url;
  return `https://lh3.googleusercontent.com/d/${match[1]}=w1080-rj`;
}

/** Poll an IG container until it finishes processing. Returns the actual
 *  status code + status string so the caller can surface real errors. */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts: number,
  pollInterval: number
): Promise<{ ready: boolean; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusResp = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    if (!statusResp.ok) continue;
    const data = await statusResp.json();
    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR") {
      return { ready: false, error: data.status || "Instagram returned ERROR with no reason" };
    }
  }
  return { ready: false, error: "Timed out waiting for Instagram to finish processing" };
}

export async function postToInstagram(
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  extraImages: string[] = []
): Promise<{ success: boolean; id?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken, accountId } = settings.instagram;
  if (!accessToken) return { success: false, error: "Instagram token not configured. Go to Settings to add it." };
  if (!accountId) return { success: false, error: "Instagram account ID not configured. Go to Settings to add it." };

  extraImages = extraImages.filter(Boolean).map(toMetaSafeImageUrl);
  if (imageUrl) imageUrl = toMetaSafeImageUrl(imageUrl);

  // Build full list of images for carousel (primary + extras)
  const allImages = [
    ...(imageUrl ? [imageUrl] : []),
    ...extraImages,
  ];

  const isCarousel = allImages.length > 1 && !videoUrl;

  // ── Carousel ──────────────────────────────────────────────────────────────
  if (isCarousel) {
    const childIds: string[] = [];

    for (const url of allImages.slice(0, 10)) {
      const params = new URLSearchParams({
        access_token: accessToken,
        image_url: url,
        is_carousel_item: "true",
      });
      const resp = await fetch(`${GRAPH}/${accountId}/media?${params}`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.text();
        console.error(`[instagram] carousel item create failed for ${url}: ${resp.status} ${err}`);
        return { success: false, error: `Instagram carousel item error ${resp.status}: ${err}` };
      }
      const { id } = await resp.json();
      const status = await waitForContainer(id, accessToken, 10, 2000);
      if (!status.ready) {
        console.error(`[instagram] carousel item not ready for ${url}: ${status.error}`);
        return { success: false, error: `Instagram carousel item failed (${url}): ${status.error}` };
      }
      childIds.push(id);
    }

    const carouselParams = new URLSearchParams({
      access_token: accessToken,
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: text,
    });
    const carouselResp = await fetch(`${GRAPH}/${accountId}/media?${carouselParams}`, { method: "POST" });
    if (!carouselResp.ok) {
      const err = await carouselResp.text();
      console.error(`[instagram] carousel container failed: ${carouselResp.status} ${err}`);
      return { success: false, error: `Instagram carousel container error ${carouselResp.status}: ${err}` };
    }
    const { id: carouselId } = await carouselResp.json();

    const status = await waitForContainer(carouselId, accessToken, 10, 2000);
    if (!status.ready) {
      console.error(`[instagram] carousel container not ready: ${status.error}`);
      return { success: false, error: `Instagram carousel processing failed: ${status.error}` };
    }

    const publishParams = new URLSearchParams({ access_token: accessToken, creation_id: carouselId });
    const publishResp = await fetch(`${GRAPH}/${accountId}/media_publish?${publishParams}`, { method: "POST" });
    if (!publishResp.ok) {
      const err = await publishResp.text();
      console.error(`[instagram] carousel publish failed: ${publishResp.status} ${err}`);
      return { success: false, error: `Instagram carousel publish error ${publishResp.status}: ${err}` };
    }
    const data = await publishResp.json();
    return { success: true, id: data.id };
  }

  // ── Single image or video ─────────────────────────────────────────────────
  if (!imageUrl && !videoUrl) return { success: false, error: "Instagram requires an image or video URL" };

  const createParams = new URLSearchParams({ access_token: accessToken, caption: text });

  if (videoUrl) {
    createParams.set("media_type", "REELS");
    createParams.set("video_url", videoUrl);
  } else if (imageUrl) {
    createParams.set("image_url", imageUrl);
  }

  const createResp = await fetch(`${GRAPH}/${accountId}/media?${createParams}`, { method: "POST" });
  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error(`[instagram] create container failed (image=${imageUrl ?? "-"}, video=${videoUrl ?? "-"}): ${createResp.status} ${errText}`);
    return { success: false, error: `Instagram API error ${createResp.status}: ${errText}` };
  }
  const { id: containerId } = await createResp.json();

  const maxAttempts = videoUrl ? 30 : 10;
  const pollInterval = videoUrl ? 5000 : 2000;
  const status = await waitForContainer(containerId, accessToken, maxAttempts, pollInterval);
  if (!status.ready) {
    console.error(`[instagram] container ${containerId} not ready: ${status.error}`);
    return { success: false, error: `Instagram media processing failed: ${status.error}` };
  }

  const publishParams = new URLSearchParams({ access_token: accessToken, creation_id: containerId });
  const publishResp = await fetch(`${GRAPH}/${accountId}/media_publish?${publishParams}`, { method: "POST" });
  if (!publishResp.ok) {
    const errText = await publishResp.text();
    console.error(`[instagram] publish failed: ${publishResp.status} ${errText}`);
    return { success: false, error: `Instagram publish error ${publishResp.status}: ${errText}` };
  }
  const data = await publishResp.json();
  return { success: true, id: data.id };
}
