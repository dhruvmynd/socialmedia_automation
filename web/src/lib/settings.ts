import fs from "fs";
import path from "path";

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

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");

function ensureDataDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultSettings(): PlatformSettings {
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

export function loadSettings(): PlatformSettings {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    // First run: seed from .env values
    const defaults = defaultSettings();
    saveSettings(defaults);
    return defaults;
  }
  const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
  return JSON.parse(raw);
}

export function saveSettings(settings: PlatformSettings) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}
