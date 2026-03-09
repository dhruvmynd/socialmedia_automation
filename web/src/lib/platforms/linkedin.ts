import { loadSettings } from "@/lib/settings";

async function getPersonUrn(accessToken: string): Promise<string> {
  const resp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to get LinkedIn profile: ${resp.status}`);
  const data = await resp.json();
  return `urn:li:person:${data.sub}`;
}

export async function postToLinkedIn(text: string, imageUrl?: string, videoUrl?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken, organizationId } = settings.linkedin;
  if (!accessToken) return { success: false, error: "LinkedIn token not configured. Go to Settings to add it." };

  let authorUrn: string;
  if (organizationId) {
    authorUrn = `urn:li:organization:${organizationId}`;
  } else {
    authorUrn = await getPersonUrn(accessToken);
  }

  const mediaUrl = videoUrl || imageUrl;

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: mediaUrl ? "ARTICLE" : "NONE",
  };

  if (mediaUrl) {
    shareContent.media = [
      {
        status: "READY",
        originalUrl: mediaUrl,
      },
    ];
  }

  const body: Record<string, unknown> = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": shareContent,
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const resp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `LinkedIn API error ${resp.status}: ${errText}` };
  }

  const data = await resp.json();
  return { success: true, id: data.id };
}
