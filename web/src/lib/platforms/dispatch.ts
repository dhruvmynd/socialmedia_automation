import { postToMastodon } from "./mastodon";
import { postToLinkedIn } from "./linkedin";
import { postToFacebook } from "./facebook";
import { postToInstagram } from "./instagram";

export type PostResult = {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
};

type PostFn = (
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  extraImages?: string[]
) => Promise<PostResult>;

type PlatformConfig = {
  fn: PostFn;
  /** True when the platform's API can compose a single post containing both a
   *  video and image(s). FB's web composer can do this, but the Graph API
   *  endpoint that supports it (`/feed?attached_media` with mixed media_fbids)
   *  is gated behind an additional permission that requires FB app review —
   *  apps without it get error code 10 ("Application does not have permission
   *  for this action"). For that reason no platform here is set to true; we
   *  always fall back to two consecutive posts when a row has both. */
  supportsMixedMedia?: boolean;
};

export const PLATFORMS: Record<string, PlatformConfig> = {
  mastodon: { fn: postToMastodon },
  linkedin: { fn: postToLinkedIn },
  facebook: { fn: postToFacebook },
  instagram: { fn: postToInstagram },
};

/** Common typos and abbreviations the spreadsheet picks up. We normalize on
 *  the read side so a misspelled cell still routes correctly instead of
 *  failing the publish and forcing the user to fix the sheet first. */
const PLATFORM_ALIASES: Record<string, string> = {
  mastadon: "mastodon",
  masto: "mastodon",
  fb: "facebook",
  insta: "instagram",
  ig: "instagram",
  "linked-in": "linkedin",
  li: "linkedin",
};

export function resolvePlatform(raw: string): string {
  const key = raw.trim().toLowerCase();
  return PLATFORM_ALIASES[key] ?? key;
}

/** When a row has both a video and image(s), most platform APIs reject mixed
 *  attachments — we fall back to publishing two consecutive posts (video first,
 *  then images) with the same caption. Platforms that *do* support mixed media
 *  natively (`supportsMixedMedia: true`) get a single call instead. */
export async function postOnePlatform(
  text: string,
  image: string | undefined,
  video: string | undefined,
  extraImages: string[],
  config: PlatformConfig
): Promise<PostResult> {
  const { fn: postFn, supportsMixedMedia } = config;
  const hasVideo = !!video;
  const hasImages = !!image || extraImages.length > 0;

  // Single media kind, text-only, or platform handles mixed natively → one call.
  if (!hasVideo || !hasImages || supportsMixedMedia) {
    return postFn(text, image, video, extraImages);
  }

  // Mixed media on a platform that doesn't compose them natively — two posts.
  const videoRes = await postFn(text, undefined, video, []);
  const imageRes = await postFn(text, image, undefined, extraImages);

  const ids = [videoRes.id, imageRes.id].filter(Boolean).join(", ");
  const errors = [
    !videoRes.success && `video: ${videoRes.error ?? "unknown error"}`,
    !imageRes.success && `images: ${imageRes.error ?? "unknown error"}`,
  ].filter(Boolean) as string[];

  return {
    success: videoRes.success && imageRes.success,
    id: ids || undefined,
    url: videoRes.url || imageRes.url,
    error: errors.length > 0 ? errors.join(" | ") : undefined,
  };
}
