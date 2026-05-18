import { loadSettings } from "@/lib/settings";

const LINKEDIN_VERSION = "202604";

/** LinkedIn's Posts API uses "Little Text" format. These reserved chars must
 *  be backslash-escaped in `commentary`, or the parser truncates the post at
 *  the first unescaped one (e.g. an open paren ends up cutting the body). */
function escapeLinkedInText(text: string): string {
  return text.replace(/[\\()<>@~_*[\]{}|#]/g, "\\$&");
}

async function getPersonUrn(accessToken: string): Promise<string> {
  const resp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to get LinkedIn profile: ${resp.status}`);
  const data = await resp.json();
  return `urn:li:person:${data.sub}`;
}

async function uploadImage(
  imageUrl: string,
  authorUrn: string,
  accessToken: string
): Promise<string> {
  // 1. Initialize upload
  const initResp = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
  });
  if (!initResp.ok) {
    throw new Error(`LinkedIn image init failed: ${initResp.status} ${await initResp.text()}`);
  }
  const { value } = await initResp.json();
  const { uploadUrl, image: imageUrn } = value;

  // 2. Fetch source image bytes
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch source image: ${imgResp.status}`);
  const imageBytes = Buffer.from(await imgResp.arrayBuffer());

  // 3. Upload bytes
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: imageBytes,
  });
  if (!uploadResp.ok) {
    throw new Error(`LinkedIn image upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
  }

  return imageUrn;
}

/** LinkedIn's Videos API: initializeUpload returns one or more presigned URLs
 *  (one per chunk for >4MB files). PUT bytes to each, collect ETags, then
 *  finalize. The post can reference the resulting video URN even while it's
 *  still PROCESSING — LinkedIn renders the video once processing completes. */
async function uploadVideo(
  videoUrl: string,
  authorUrn: string,
  accessToken: string
): Promise<string> {
  // 1. Fetch source bytes — we need the size before init.
  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) throw new Error(`Failed to fetch source video: ${videoResp.status}`);
  const videoBytes = Buffer.from(await videoResp.arrayBuffer());
  const fileSizeBytes = videoBytes.length;

  // 2. Initialize upload — returns chunked upload instructions.
  const initResp = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });
  if (!initResp.ok) {
    throw new Error(`LinkedIn video init failed: ${initResp.status} ${await initResp.text()}`);
  }
  const { value } = await initResp.json();
  const { video: videoUrn, uploadInstructions, uploadToken } = value as {
    video: string;
    uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[];
    uploadToken?: string;
  };

  // 3. PUT each chunk to its presigned URL, collecting ETags.
  const uploadedPartIds: string[] = [];
  for (const inst of uploadInstructions) {
    const chunk = videoBytes.subarray(inst.firstByte, inst.lastByte + 1);
    const putResp = await fetch(inst.uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: chunk,
    });
    if (!putResp.ok) {
      throw new Error(`LinkedIn video chunk upload failed: ${putResp.status} ${await putResp.text()}`);
    }
    const etag = putResp.headers.get("etag");
    if (!etag) throw new Error("LinkedIn video upload returned no ETag header");
    uploadedPartIds.push(etag);
  }

  // 4. Finalize — commits the chunks into the video URN.
  const finalizeResp = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken: uploadToken ?? "",
        uploadedPartIds,
      },
    }),
  });
  if (!finalizeResp.ok) {
    throw new Error(`LinkedIn video finalize failed: ${finalizeResp.status} ${await finalizeResp.text()}`);
  }

  return videoUrn;
}

export async function postToLinkedIn(
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  extraImages: string[] = []
): Promise<{ success: boolean; id?: string; error?: string }> {
  const settings = loadSettings();
  const { accessToken, organizationId } = settings.linkedin;
  if (!accessToken) return { success: false, error: "LinkedIn token not configured. Go to Settings to add it." };

  let authorUrn: string;
  try {
    authorUrn = organizationId
      ? `urn:li:organization:${organizationId}`
      : await getPersonUrn(accessToken);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to resolve LinkedIn author" };
  }

  const body: Record<string, unknown> = {
    author: authorUrn,
    commentary: escapeLinkedInText(text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED" },
    lifecycleState: "PUBLISHED",
  };

  try {
    const allImages = [
      ...(imageUrl ? [imageUrl] : []),
      ...extraImages.filter(Boolean),
    ];

    if (videoUrl) {
      const videoUrn = await uploadVideo(videoUrl, authorUrn, accessToken);
      body.content = { media: { id: videoUrn } };
    } else if (allImages.length > 1) {
      const imageUrns = await Promise.all(
        allImages.slice(0, 20).map((url) => uploadImage(url, authorUrn, accessToken))
      );
      body.content = {
        multiImage: { images: imageUrns.map((id) => ({ id })) },
      };
    } else if (allImages.length === 1) {
      const imageUrn = await uploadImage(allImages[0], authorUrn, accessToken);
      body.content = { media: { id: imageUrn } };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "LinkedIn media upload failed" };
  }

  const resp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { success: false, error: `LinkedIn API error ${resp.status}: ${errText}` };
  }

  const postId = resp.headers.get("x-restli-id") || "";
  return { success: true, id: postId };
}
