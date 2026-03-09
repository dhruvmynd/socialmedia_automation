import fs from "fs";
import path from "path";

export interface Post {
  id: string;
  title: string;
  content: string;
  image: string;
  video: string;
  scheduledAt: string;
  ready: boolean;
  platforms: string[];
  posted: boolean;
  postedAt?: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "posts.json");

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
  }
}

export function loadPosts(): Post[] {
  ensureDataDir();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

export function savePosts(posts: Post[]) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), "utf-8");
}

export function addPost(post: Omit<Post, "id">): Post {
  const posts = loadPosts();
  const newPost: Post = {
    ...post,
    id: crypto.randomUUID(),
  };
  posts.push(newPost);
  savePosts(posts);
  return newPost;
}

export function updatePost(id: string, updates: Partial<Post>): Post | null {
  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  posts[idx] = { ...posts[idx], ...updates };
  savePosts(posts);
  return posts[idx];
}

export function deletePost(id: string): boolean {
  const posts = loadPosts();
  const filtered = posts.filter((p) => p.id !== id);
  if (filtered.length === posts.length) return false;
  savePosts(filtered);
  return true;
}
