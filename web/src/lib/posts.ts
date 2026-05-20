import { pullPostsFromSheet, pushPostsToSheet, addToPostedSheet, loadPostedPosts, removeFromPostedSheet, stableId, updateRowInPendingSheet, deletePendingRow } from "@/lib/googleSheets";

export interface Post {
  id: string;
  title: string;
  content: string;
  media: string;
  scheduledAt: string;
  ready: boolean;
  platforms: string[];
  posted: boolean;
  postedAt?: string;
  error?: string;
}

export async function loadPosts(): Promise<Post[]> {
  const [pending, posted] = await Promise.all([pullPostsFromSheet(), loadPostedPosts()]);

  const pendingPosts: Post[] = pending.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    media: r.media,
    scheduledAt: r.scheduledAt,
    ready: r.ready,
    platforms: r.platforms,
    posted: false,
    error: r.error,
  }));

  const postedPosts: Post[] = posted.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    media: r.media,
    scheduledAt: r.scheduledAt,
    ready: true,
    platforms: r.platforms,
    posted: true,
    postedAt: r.postedAt,
    error: r.error,
  }));

  return [...pendingPosts, ...postedPosts];
}

export async function addPost(post: Omit<Post, "id">): Promise<Post> {
  const rows = await pullPostsFromSheet();
  const id = stableId(post.title, post.content, post.scheduledAt);
  await pushPostsToSheet([...rows, post]);
  return { ...post, id };
}

export async function updatePost(id: string, updates: Partial<Omit<Post, "posted" | "postedAt">>): Promise<Post | null> {
  const rows = await pullPostsFromSheet();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const updated = { ...rows[idx], ...updates };
  rows[idx] = updated;
  await pushPostsToSheet(rows);
  return { ...updated, posted: false };
}

/** Targeted in-place update — only rewrites the matched row, not the whole sheet.
 *  Use for high-frequency, non-id-changing updates (e.g. cron error logging). */
export async function updatePostFields(
  id: string,
  updates: Partial<Pick<Post, "ready" | "error">>
): Promise<boolean> {
  return updateRowInPendingSheet(id, updates);
}

export async function deletePost(id: string): Promise<boolean> {
  const rows = await pullPostsFromSheet();
  const filtered = rows.filter((r) => r.id !== id);
  if (filtered.length === rows.length) return false;
  await pushPostsToSheet(filtered);
  return true;
}

export async function moveToPosted(id: string, postedAt: string, error?: string): Promise<boolean> {
  const rows = await pullPostsFromSheet();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;

  const post = rows[idx];
  await addToPostedSheet({
    id: post.id,
    title: post.title,
    content: post.content,
    media: post.media,
    platforms: post.platforms,
    scheduledAt: post.scheduledAt,
    postedAt,
    error,
  });

  // Targeted row delete instead of full sheet rewrite — preserves the
  // Ready-column checkbox data validation on the remaining rows.
  await deletePendingRow(id);
  return true;
}

export async function resetPost(id: string): Promise<boolean> {
  const post = await removeFromPostedSheet(id);
  if (!post) return false;

  const rows = await pullPostsFromSheet();
  await pushPostsToSheet([...rows, { ...post, ready: false }]);
  return true;
}
