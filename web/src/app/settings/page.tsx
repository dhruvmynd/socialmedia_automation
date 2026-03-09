"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PlatformConfig {
  accessToken: string;
  connected: boolean;
  [key: string]: string | boolean;
}

interface Settings {
  mastodon: PlatformConfig & { apiBaseUrl: string };
  linkedin: PlatformConfig & { organizationId: string };
  facebook: PlatformConfig & { pageId: string };
  instagram: PlatformConfig & { accountId: string };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  // Draft values for editing
  const [mastodonToken, setMastodonToken] = useState("");
  const [mastodonUrl, setMastodonUrl] = useState("");
  const [linkedinToken, setLinkedinToken] = useState("");
  const [linkedinOrgId, setLinkedinOrgId] = useState("");
  const [facebookToken, setFacebookToken] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [instagramToken, setInstagramToken] = useState("");
  const [instagramAccountId, setInstagramAccountId] = useState("");
  const [extending, setExtending] = useState<string | null>(null);
  const [extendMsg, setExtendMsg] = useState<string | null>(null);

  async function extendToken(platform: string) {
    setExtending(platform);
    setExtendMsg(null);
    const res = await fetch("/api/settings/extend-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    const data = await res.json();
    if (res.ok) {
      setExtendMsg(data.message);
      const r = await fetch("/api/settings");
      if (r.ok) setSettings(await r.json());
    } else {
      setExtendMsg(`Error: ${data.error}`);
    }
    setExtending(null);
    setTimeout(() => setExtendMsg(null), 5000);
  }

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setSettings(data);
      setMastodonUrl(data.mastodon.apiBaseUrl || "https://mastodon.social");
      setLinkedinOrgId(data.linkedin.organizationId || "");
      setFacebookPageId(data.facebook.pageId || "");
      setInstagramAccountId(data.instagram.accountId || "");
    });
  }, [router]);

  async function handleSave(platform: string) {
    setSaving(true);
    setSaved(false);

    let body: Record<string, Record<string, string>> = {};

    switch (platform) {
      case "mastodon":
        body = { mastodon: { apiBaseUrl: mastodonUrl } };
        if (mastodonToken) body.mastodon.accessToken = mastodonToken;
        break;
      case "linkedin":
        body = { linkedin: { organizationId: linkedinOrgId } };
        if (linkedinToken) body.linkedin.accessToken = linkedinToken;
        break;
      case "facebook":
        body = { facebook: { pageId: facebookPageId } };
        if (facebookToken) body.facebook.accessToken = facebookToken;
        break;
      case "instagram":
        body = { instagram: { accountId: instagramAccountId } };
        if (instagramToken) body.instagram.accessToken = instagramToken;
        break;
    }

    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Clear token fields and refresh settings
    setMastodonToken("");
    setLinkedinToken("");
    setFacebookToken("");
    setInstagramToken("");

    const res = await fetch("/api/settings");
    if (res.ok) setSettings(await res.json());

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDisconnect(platform: string) {
    const body: Record<string, Record<string, string>> = {
      [platform]: { accessToken: "" },
    };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await fetch("/api/settings");
    if (res.ok) setSettings(await res.json());
  }

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-gray-400 text-sm mt-1">Connect your social media accounts</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Back to Posts
          </Link>
        </div>

        {saved && (
          <div className="mb-4 p-3 bg-green-900/50 border border-green-800 rounded-lg text-green-400 text-sm">
            Settings saved successfully.
          </div>
        )}

        {extendMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm border ${
            extendMsg.startsWith("Error")
              ? "bg-red-900/50 border-red-800 text-red-400"
              : "bg-green-900/50 border-green-800 text-green-400"
          }`}>
            {extendMsg}
          </div>
        )}

        <div className="space-y-6">
          {/* Mastodon */}
          <PlatformCard
            name="Mastodon"
            connected={settings.mastodon.connected}
            maskedToken={settings.mastodon.accessToken}
            onSave={() => handleSave("mastodon")}
            onDisconnect={() => handleDisconnect("mastodon")}
            saving={saving}
          >
            <Field label="Instance URL" value={mastodonUrl} onChange={setMastodonUrl} placeholder="https://mastodon.social" />
            <Field label="Access Token" value={mastodonToken} onChange={setMastodonToken} placeholder="Paste new token to update" password />
          </PlatformCard>

          {/* LinkedIn */}
          <PlatformCard
            name="LinkedIn"
            connected={settings.linkedin.connected}
            maskedToken={settings.linkedin.accessToken}
            onSave={() => handleSave("linkedin")}
            onDisconnect={() => handleDisconnect("linkedin")}
            saving={saving}
          >
            <Field label="Access Token" value={linkedinToken} onChange={setLinkedinToken} placeholder="Paste new token to update" password />
            <Field label="Organization ID" value={linkedinOrgId} onChange={setLinkedinOrgId} placeholder="Leave blank for personal posts" />
          </PlatformCard>

          {/* Facebook */}
          <PlatformCard
            name="Facebook"
            connected={settings.facebook.connected}
            maskedToken={settings.facebook.accessToken}
            onSave={() => handleSave("facebook")}
            onDisconnect={() => handleDisconnect("facebook")}
            saving={saving}
          >
            <Field label="Page Access Token" value={facebookToken} onChange={setFacebookToken} placeholder="Paste new token to update" password />
            <Field label="Page ID" value={facebookPageId} onChange={setFacebookPageId} placeholder="Your Facebook Page ID" />
            {settings.facebook.connected && (
              <button
                onClick={() => extendToken("facebook")}
                disabled={extending === "facebook"}
                className="mt-1 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-yellow-900 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {extending === "facebook" ? "Extending..." : "Extend Token (make permanent)"}
              </button>
            )}
          </PlatformCard>

          {/* Instagram */}
          <PlatformCard
            name="Instagram"
            connected={settings.instagram.connected}
            maskedToken={settings.instagram.accessToken}
            onSave={() => handleSave("instagram")}
            onDisconnect={() => handleDisconnect("instagram")}
            saving={saving}
          >
            <Field label="Access Token" value={instagramToken} onChange={setInstagramToken} placeholder="Paste new token to update" password />
            <Field label="Account ID" value={instagramAccountId} onChange={setInstagramAccountId} placeholder="Instagram Business Account ID" />
            {settings.instagram.connected && (
              <button
                onClick={() => extendToken("instagram")}
                disabled={extending === "instagram"}
                className="mt-1 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-yellow-900 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {extending === "instagram" ? "Extending..." : "Extend Token (60 days)"}
              </button>
            )}
          </PlatformCard>
        </div>
      </div>
    </div>
  );
}

function PlatformCard({
  name,
  connected,
  maskedToken,
  onSave,
  onDisconnect,
  saving,
  children,
}: {
  name: string;
  connected: boolean;
  maskedToken: string;
  onSave: () => void;
  onDisconnect: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{name}</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              connected
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : "bg-gray-800 text-gray-500 border border-gray-700"
            }`}
          >
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>
        {connected && (
          <button
            onClick={onDisconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>
      {connected && maskedToken && (
        <p className="text-xs text-gray-500 mb-3 font-mono">Current token: {maskedToken}</p>
      )}
      <div className="space-y-3">
        {children}
      </div>
      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  password,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type={password ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
