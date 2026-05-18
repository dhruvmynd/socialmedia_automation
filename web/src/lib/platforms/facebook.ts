import { loadSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

/** See instagram.ts: Meta's fetcher rejects *.vercel.app URLs with 9004/2207052.
 *  Hand it a drive.google.com CDN URL instead so the host is trusted. */
function toMetaSafeImageUrl(url: string): string {
  const match = url.match(/\/api\/media\/([a-zA-Z0-9_-]+)(?:\.[a-z]+)?(?:\?|$)/i);
  if (!match) return url;
  // lh3 direct (=w1080-rj forces JPEG render). thumbnail endpoint redirects
  // to lh3 and Meta's fetcher won't follow redirects.
  return `https://lh3.googleusercontent.com/d/${match[1]}=w1080-rj`;
}

function toMetaSafeVideoUrl(url: string): string {
  const match = url.match(/\/api\/media\/([a-zA-Z0-9_-]+)(?:\.[a-z]+)?(?:\?|$)/i);
  if (!match) return url;
  return `https://drive.google.com/uc?id=${match[1]}&export=download&confirm=1`;
}

async function resolvePageToken(userOrPageToken: string, pageId: string): Promise<string> {
  // Works whether the stored token is a user token or already a page token
  const resp = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userOrPageToken}`);
  if (!resp.ok) throw new Error(`Failed to get page token: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.access_token || userOrPageToken;
}

async function getPostUrl(postId: string, pageId: string, accessToken: string): Promise<string | undefined> {
  const resp = await fetch(`${GRAPH}/${postId}?fields=permalink_url&access_token=${accessToken}`);
  if (!resp.ok) return undefined;
  const data = await resp.json();
  return data.permalink_url;
}

async function uploadUnpublishedPhoto(
  imageUrl: string,
  pageId: string,
  accessToken: string
): Promise<string> {
  const params = new URLSearchParams({
    access_token: accessToken,
    url: imageUrl,
    published: "false",
  });
  const resp = await fetch(`${GRAPH}/${pageId}/photos?${params}`, { method: "POST" });
  if (!resp.ok) {
    throw new Error(`Facebook photo upload ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  if (!data.id) throw new Error("Facebook photo upload returned no id");
  return data.id;
}

export async function postToFacebook(
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  extraImages: string[] = []
): Promise<{ success: boolean; id?: string; url?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken: storedToken, pageId } = settings.facebook;
  if (!storedToken) return { success: false, error: "Facebook token not configured. Go to Settings to add it." };
  if (!pageId) return { success: false, error: "Facebook page ID not configured. Go to Settings to add it." };

  let accessToken: string;
  try {
    accessToken = await resolvePageToken(storedToken, pageId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to get page token" };
  }

  const allImages = [
    ...(imageUrl ? [imageUrl] : []),
    ...extraImages.filter(Boolean),
  ].map(toMetaSafeImageUrl);

  // Video-only post
  if (videoUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      file_url: toMetaSafeVideoUrl(videoUrl),
      description: text,
    });
    const resp = await fetch(`${GRAPH}/${pageId}/videos?${params}`, { method: "POST" });
    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Facebook video API error ${resp.status}: ${errText}` };
    }
    const data = await resp.json();
    const url = await getPostUrl(data.id, pageId, accessToken);
    return { success: true, id: data.id, url };
  }

  // Multi-image post: upload each as unpublished, then attach to a single feed post
  if (allImages.length > 1) {
    let photoIds: string[];
    try {
      photoIds = await Promise.all(
        allImages.map((url) => uploadUnpublishedPhoto(url, pageId, accessToken))
      );
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Facebook multi-image upload failed" };
    }

    const feedParams = new URLSearchParams({
      access_token: accessToken,
      message: text,
      attached_media: JSON.stringify(photoIds.map((id) => ({ media_fbid: id }))),
    });
    const feedResp = await fetch(`${GRAPH}/${pageId}/feed?${feedParams}`, { method: "POST" });
    if (!feedResp.ok) {
      return { success: false, error: `Facebook feed API error ${feedResp.status}: ${await feedResp.text()}` };
    }
    const data = await feedResp.json();
    const url = await getPostUrl(data.id, pageId, accessToken);
    return { success: true, id: data.id, url };
  }

  // Single image post
  if (allImages.length === 1) {
    const params = new URLSearchParams({
      access_token: accessToken,
      url: allImages[0],
      message: text,
      published: "true",
    });
    const resp = await fetch(`${GRAPH}/${pageId}/photos?${params}`, { method: "POST" });
    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Facebook API error ${resp.status}: ${errText}` };
    }
    const data = await resp.json();
    // /photos returns { id: photoId, post_id: feedPostId } — use post_id for the timeline post URL
    const feedPostId = data.post_id || data.id;
    const url = await getPostUrl(feedPostId, pageId, accessToken);
    return { success: true, id: feedPostId, url };
  }

  // Text-only post
  const params = new URLSearchParams({
    access_token: accessToken,
    message: text,
  });
  const resp = await fetch(`${GRAPH}/${pageId}/feed?${params}`, { method: "POST" });
  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `Facebook API error ${resp.status}: ${errText}` };
  }
  const data = await resp.json();
  const url = await getPostUrl(data.id, pageId, accessToken);
  return { success: true, id: data.id, url };
}
