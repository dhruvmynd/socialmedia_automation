export interface PlatformSettings {
  mastodon: {
    accessToken: string;
    apiBaseUrl: string;
  };
  linkedin: {
    accessToken: string;
    organizationId: string;
  };
  facebook: {
    accessToken: string;
    pageId: string;
  };
  instagram: {
    accessToken: string;
    accountId: string;
  };
}

export function loadSettings(): PlatformSettings {
  return {
    mastodon: {
      accessToken: process.env.MASTODON_ACCESS_TOKEN || "",
      apiBaseUrl: process.env.MASTODON_API_BASE_URL || "https://mastodon.social",
    },
    linkedin: {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
      organizationId: process.env.LINKEDIN_ORGANIZATION_ID || "",
    },
    facebook: {
      accessToken: process.env.FACEBOOK_ACCESS_TOKEN || "",
      pageId: process.env.FACEBOOK_PAGE_ID || "",
    },
    instagram: {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",
      accountId: process.env.INSTAGRAM_ACCOUNT_ID || "",
    },
  };
}
