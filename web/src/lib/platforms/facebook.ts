import { loadSettings } from "@/lib/settings";

const GRAPH = "https://graph.facebook.com/v19.0";

async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const resp = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
  if (!resp.ok) throw new Error("Failed to get page token");
  const data = await resp.json();
  return data.access_token || userToken;
}

export async function postToFacebook(text: string, imageUrl?: string, videoUrl?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken: userToken, pageId } = settings.facebook;
  if (!userToken) return { success: false, error: "Facebook token not configured. Go to Settings to add it." };
  if (!pageId) return { success: false, error: "Facebook page ID not configured. Go to Settings to add it." };

  let accessToken: string;
  try {
    accessToken = await getPageToken(userToken, pageId);
  } catch {
    return { success: false, error: "Failed to exchange user token for page token. Token may be expired." };
  }

  // Video post
  if (videoUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      file_url: videoUrl,
      description: text,
    });
    const resp = await fetch(`${GRAPH}/${pageId}/videos?${params}`, { method: "POST" });
    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Facebook video API error ${resp.status}: ${errText}` };
    }
    const data = await resp.json();
    return { success: true, id: data.id };
  }

  // Image post
  if (imageUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      url: imageUrl,
      message: text,
    });
    const resp = await fetch(`${GRAPH}/${pageId}/photos?${params}`, { method: "POST" });
    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Facebook API error ${resp.status}: ${errText}` };
    }
    const data = await resp.json();
    return { success: true, id: data.id };
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
  return { success: true, id: data.id };
}
