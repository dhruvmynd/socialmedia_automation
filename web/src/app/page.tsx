"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FaMastodon, FaLinkedinIn, FaFacebookF, FaInstagram } from "react-icons/fa";

interface Post {
  id: string;
  title: string;
  content: string;
  media: string;
  scheduledAt: string;
  ready: boolean;
  platforms: string[];
  posted: boolean;
  postedAt?: string;
}

interface Platform {
  id: string;
  name: string;
  connected: boolean;
  instance?: string;
}

const ALL_PLATFORMS = ["mastodon", "linkedin", "facebook", "instagram"];

/** Canonical display timezone — matches SHEET_TZ on the server so what you
 *  see here is exactly what the cron will fire on, regardless of where the
 *  viewer's browser thinks it is. */
const DISPLAY_TZ = "America/Vancouver";

function formatInDisplayTz(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: DISPLAY_TZ,
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZoneName: "short",
  });
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  mastodon: <FaMastodon />,
  linkedin: <FaLinkedinIn />,
  facebook: <FaFacebookF />,
  instagram: <FaInstagram />,
};

const PLATFORM_COLORS: Record<string, string> = {
  mastodon: "bg-purple-600/20 text-purple-400 border-purple-600",
  linkedin: "bg-blue-600/20 text-blue-400 border-blue-600",
  facebook: "bg-indigo-600/20 text-indigo-400 border-indigo-600",
  instagram: "bg-pink-600/20 text-pink-400 border-pink-600",
};

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<
    Record<string, Record<string, { success: boolean; url?: string; error?: string }>>
  >({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const router = useRouter();

  const fetchPosts = useCallback(async () => {
    const res = await fetch("/api/posts");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      setPosts(data);
      setPostsError(null);
    } else {
      setPosts([]);
      setPostsError(data?.error || `Failed to load posts (${res.status})`);
    }
    setLoading(false);
  }, [router]);

  const fetchPlatforms = useCallback(async () => {
    const res = await fetch("/api/platforms");
    if (res.ok) setPlatforms(await res.json());
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchPlatforms();
    // Auto-refresh every 15 seconds to pick up cron-published posts
    const interval = setInterval(fetchPosts, 15000);
    return () => clearInterval(interval);
  }, [fetchPosts, fetchPlatforms]);

  async function deletePost(id: string) {
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function publishPost(id: string) {
    setPublishing(id);
    setPublishResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
    const data = await res.json();
    if (data.results) {
      setPublishResults((prev) => ({ ...prev, [id]: data.results }));
    }
    if (data.allSucceeded) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, posted: true, postedAt: new Date().toISOString() } : p
        )
      );
    }
    setPublishing(null);
  }

  async function resetPost(id: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    fetchPosts();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function syncSheets(direction: "push" | "pull") {
    setSyncing(direction);
    setSyncMsg(null);
    const res = await fetch(`/api/sync/google-sheets?direction=${direction}`, { method: "POST" });
    const data = await res.json();
    setSyncMsg(data.message || data.error || "Done");
    setSyncing(null);
    if (direction === "pull") fetchPosts();
    setTimeout(() => setSyncMsg(null), 5000);
  }

  function openNewPost() {
    setEditingPost(null);
    setFormOpen(true);
  }

  function openEditPost(post: Post) {
    setEditingPost(post);
    setFormOpen(true);
  }

  async function handleFormSave(data: Partial<Post>) {
    if (editingPost) {
      await fetch(`/api/posts/${editingPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, posted: false }),
      });
    }
    setFormOpen(false);
    setEditingPost(null);
    fetchPosts();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const pendingPosts = posts.filter((p) => !p.posted);
  const postedPosts = posts.filter((p) => p.posted);

  return (
    <div className="min-h-screen bg-gray-950 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Social Media Automation</h1>
            <div className="flex gap-1.5">
              {platforms.map((p) => (
                <span
                  key={p.id}
                  title={`${p.name} ${p.connected ? "Connected" : "Not connected"}`}
                  className={`text-base p-1.5 rounded-full ${
                    p.connected
                      ? "text-green-400"
                      : "text-gray-600"
                  }`}
                >
                  {PLATFORM_ICONS[p.id] || p.name[0]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openNewPost}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              + Create Post
            </button>
            <button
              onClick={() => syncSheets("pull")}
              disabled={!!syncing}
              title="Import posts from Google Sheets"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
            >
              {syncing === "pull" ? "Importing..." : "↓ Sheets"}
            </button>
            <Link
              href="/settings"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700 flex items-center"
            >
              Settings
            </Link>
            <button
              onClick={logout}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Posts error */}
      {postsError && (
        <div className="mb-4 p-3 rounded-lg text-sm border bg-red-900/50 border-red-800 text-red-400">
          Failed to load posts: {postsError}
        </div>
      )}

      {/* Sync message */}
      {syncMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${
          syncMsg.toLowerCase().includes("error") || syncMsg.toLowerCase().includes("not set")
            ? "bg-red-900/50 border-red-800 text-red-400"
            : "bg-green-900/50 border-green-800 text-green-400"
        }`}>
          {syncMsg}
        </div>
      )}

      {/* Pending Posts */}
      {pendingPosts.length === 0 && postedPosts.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg mb-4">No posts yet</p>
          <button
            onClick={openNewPost}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Create Your First Post
          </button>
        </div>
      )}

      {pendingPosts.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            Pending ({pendingPosts.length})
          </h2>
          <div className="grid gap-4">
            {pendingPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                publishing={publishing === post.id}
                publishResult={publishResults[post.id]}
                onEdit={() => openEditPost(post)}
                onDelete={() => deletePost(post.id)}
                onPublish={() => publishPost(post.id)}
                onReset={() => resetPost(post.id)}
              />
            ))}
          </div>
        </div>
      )}

      {postedPosts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            Post History ({postedPosts.length})
          </h2>
          <div className="grid gap-4">
            {postedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                publishing={false}
                publishResult={publishResults[post.id]}
                onEdit={() => openEditPost(post)}
                onDelete={() => deletePost(post.id)}
                onPublish={() => publishPost(post.id)}
                onReset={() => resetPost(post.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {formOpen && (
        <PostFormModal
          post={editingPost}
          onSave={handleFormSave}
          onClose={() => {
            setFormOpen(false);
            setEditingPost(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Post Card ─── */
function PostCard({
  post,
  publishing,
  publishResult,
  onEdit,
  onDelete,
  onPublish,
  onReset,
}: {
  post: Post;
  publishing: boolean;
  publishResult?: Record<string, { success: boolean; url?: string; error?: string }>;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors ${
        post.posted ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-white font-medium text-base truncate">
              {post.title || "Untitled Post"}
            </h3>
            {post.posted && (
              <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full border border-green-800 shrink-0">
                Posted
              </span>
            )}
            {!post.posted && post.ready && (
              <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-800 shrink-0">
                Ready
              </span>
            )}
            {!post.posted && !post.ready && (
              <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700 shrink-0">
                Draft
              </span>
            )}
          </div>

          <p className="text-gray-400 text-sm line-clamp-2 mb-3 whitespace-pre-line">
            {post.content || "No content"}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {(post.platforms && post.platforms.length > 0
              ? post.platforms
              : ALL_PLATFORMS
            ).map((plat) => (
              <span
                key={plat}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  PLATFORM_COLORS[plat] || "bg-gray-800 text-gray-400 border-gray-700"
                }`}
              >
                {plat}
              </span>
            ))}
            {post.media && (
              <span className="text-xs text-gray-500 ml-2">Has media</span>
            )}
            {post.scheduledAt && (
              <span className="text-xs text-gray-500 ml-2">
                Scheduled: {formatInDisplayTz(post.scheduledAt)}
              </span>
            )}
            {post.postedAt && (
              <span className="text-xs text-gray-500 ml-2">
                Posted: {formatInDisplayTz(post.postedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors"
          >
            Edit
          </button>
          {!post.posted && (
            <button
              onClick={onPublish}
              disabled={publishing}
              title="Bypass schedule and post immediately"
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {publishing ? "Posting..." : "Publish Now"}
            </button>
          )}
          {post.posted && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-xs transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-400 rounded-lg text-xs transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Publish results */}
      {publishResult && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-1">
          {Object.entries(publishResult).map(([plat, res]) => (
            <div
              key={plat}
              className={`text-xs break-all whitespace-pre-wrap ${
                res.success ? "text-green-400" : "text-red-400"
              }`}
            >
              <span className="font-medium">{plat}:</span>{" "}
              {res.success ? "Done" : res.error || "(no error message returned)"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Post Form Modal ─── */
/** Convert any stored scheduled-at value to the `YYYY-MM-DDTHH:mm` format
 *  required by <input type="datetime-local">, expressed in DISPLAY_TZ
 *  (Vancouver) — NOT the viewer's browser timezone. This keeps the form,
 *  the card display, and the cron all anchored to the same TZ. */
function toLocalDatetimeInput(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const hh = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}`;
}

/** Convert a `YYYY-MM-DDTHH:mm` (interpreted as Vancouver wall-clock) to an
 *  unambiguous ISO UTC string. Uses the same offset-resolution trick as the
 *  server-side helper. */
function localDatetimeInputToISO(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return value;
  const [year, month, day, hour, minute, second] =
    [+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0];
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess)).map((p) => [p.type, p.value])
  );
  const asLocal = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return new Date(guess - (asLocal - guess)).toISOString();
}

function PostFormModal({
  post,
  onSave,
  onClose,
}: {
  post: Post | null;
  onSave: (data: Partial<Post>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(post?.title || "");
  const [content, setContent] = useState(post?.content || "");
  const [media, setMedia] = useState(post?.media || "");
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeInput(post?.scheduledAt));
  const [ready, setReady] = useState(post?.ready ?? false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    post?.platforms || []
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerText = content;
    }
    // Only set initial content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlatform(plat: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(plat) ? prev.filter((p) => p !== plat) : [...prev, plat]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setScheduleError(null);
    const editorContent = editorRef.current?.innerText || content;
    const scheduledISO = localDatetimeInputToISO(scheduledAt);

    // Marking Ready with a past/empty schedule causes the cron to fire on its
    // next tick (~1 min) — that's why "flipping YES posted immediately" felt
    // like a bug. Force a future time, or send users to Publish Now.
    if (ready) {
      if (!scheduledISO) {
        setScheduleError("Pick a future schedule time to mark Ready, or use 'Publish Now' for immediate posting.");
        return;
      }
      if (new Date(scheduledISO).getTime() <= Date.now()) {
        setScheduleError("Schedule time is in the past. Pick a future time, or save without Ready and click 'Publish Now' for immediate posting.");
        return;
      }
    }

    onSave({
      title,
      content: editorContent,
      media,
      scheduledAt: scheduledISO,
      ready,
      platforms: selectedPlatforms,
    });
  }

  function applyFormat(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">
            {post ? "Edit Post" : "Create Post"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              className="w-full bg-gray-800 text-white text-sm px-4 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Rich Text Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Content
            </label>
            <div className="border border-gray-700 rounded-lg overflow-hidden focus-within:border-blue-500">
              {/* Toolbar */}
              <div className="flex items-center gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700">
                <button
                  type="button"
                  onClick={() => applyFormat("bold")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm font-bold"
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("italic")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm italic"
                  title="Italic"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("underline")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm underline"
                  title="Underline"
                >
                  U
                </button>
                <div className="w-px h-5 bg-gray-700 mx-1" />
                <button
                  type="button"
                  onClick={() => applyFormat("insertUnorderedList")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
                  title="Bullet List"
                >
                  &bull; List
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("insertOrderedList")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
                  title="Numbered List"
                >
                  1. List
                </button>
                <div className="w-px h-5 bg-gray-700 mx-1" />
                <button
                  type="button"
                  onClick={() => {
                    const url = prompt("Enter link URL:");
                    if (url) applyFormat("createLink", url);
                  }}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
                  title="Insert Link"
                >
                  Link
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("removeFormat")}
                  className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm ml-auto"
                  title="Clear Formatting"
                >
                  Clear
                </button>
              </div>

              {/* Editable area */}
              <div
                ref={editorRef}
                contentEditable
                onInput={() => {
                  if (editorRef.current) {
                    setContent(editorRef.current.innerText);
                  }
                }}
                className="min-h-[160px] px-4 py-3 text-sm text-white bg-gray-800/50 focus:outline-none whitespace-pre-wrap"
                data-placeholder="Write your post content here..."
                style={{ minHeight: "160px" }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {content.length} characters
            </p>
          </div>

          {/* Media */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Media
            </label>
            <input
              type="text"
              value={media}
              onChange={(e) => setMedia(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/... or direct image/video URL"
              className="w-full bg-gray-800 text-white text-sm px-4 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              Paste a Google Drive folder link (images + video auto-detected) or a direct image/video URL.
            </p>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((plat) => {
                const selected = selectedPlatforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => togglePlatform(plat)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      selected
                        ? PLATFORM_COLORS[plat] || "bg-blue-600/20 text-blue-400 border-blue-600"
                        : "bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500"
                    }`}
                  >
                    {plat.charAt(0).toUpperCase() + plat.slice(1)}
                  </button>
                );
              })}
            </div>
            {selectedPlatforms.length === 0 && (
              <p className="text-xs text-gray-600 mt-1">
                No platforms selected — will post to all connected platforms
              </p>
            )}
          </div>

          {/* Schedule & Ready */}
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Schedule {ready ? "(required)" : "(optional)"}{" "}
                <span className="text-xs text-gray-500 font-normal">— Vancouver time (America/Vancouver)</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-gray-800 text-gray-300 text-sm px-4 py-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ready}
                onChange={(e) => setReady(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-gray-400">Ready to publish</span>
            </label>
          </div>
          {scheduleError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
              {scheduleError}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {post ? "Save Changes" : "Create Post"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
