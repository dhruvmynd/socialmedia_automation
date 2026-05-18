import { google } from "googleapis";

function getDriveClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    // Full drive scope is required so we can move posted media into the
    // "Posted" subfolder. The service account also needs Editor access on
    // the working folder (share the folder with the service account email).
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function extractDriveId(url: string): { type: "folder" | "file"; id: string } | null {
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { type: "folder", id: folderMatch[1] };
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { type: "file", id: fileMatch[1] };
  return null;
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mpeg"]);

const SOCIAL_MEDIA_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "16YyHt9KmsIUX9vGx2o9WnXUt8CC1tj4a";

async function listDriveFiles(folderId: string) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    orderBy: "name",
    pageSize: 50,
  });
  return res.data.files || [];
}

async function findFilesByNames(names: string[]): Promise<{ id: string; name: string; mimeType: string }[]> {
  const drive = getDriveClient();
  const nameFilters = names.map((n) => `name='${n.replace(/'/g, "\\'")}'`).join(" or ");
  const res = await drive.files.list({
    q: `(${nameFilters}) and '${SOCIAL_MEDIA_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
  });
  const found = res.data.files || [];
  // Return in the same order as the input names
  return names
    .map((n) => found.find((f) => f.name === n))
    .filter((f): f is { id: string; name: string; mimeType: string } => !!f?.id && !!f?.mimeType);
}

function filesToMedia(
  files: { id?: string | null; mimeType?: string | null }[],
  baseUrl: string
): { image?: string; images: string[]; video?: string } {
  // Use the in-app proxy so platform fetchers always get a stable image/video stream
  // with proper Content-Type. Google's lh3 redirects can fail for Instagram/Facebook.
  const imageUrls = files
    .filter((f) => f.mimeType && IMAGE_MIMES.has(f.mimeType))
    .map((f) => `${baseUrl}/api/media/${f.id}`);

  const videoFile = files.find((f) => f.mimeType && VIDEO_MIMES.has(f.mimeType));
  const videoUrl = videoFile ? `${baseUrl}/api/media/${videoFile.id}` : undefined;

  return { image: imageUrls[0], images: imageUrls.slice(1), video: videoUrl };
}

export async function resolveMedia(
  mediaValue: string,
  baseUrl: string
): Promise<{ image?: string; images: string[]; video?: string }> {
  if (!mediaValue) return { images: [] };

  // Full Google Drive URL (folder or file link)
  if (mediaValue.includes("drive.google.com")) {
    const parsed = extractDriveId(mediaValue);
    if (!parsed) return { images: [] };

    let files: { id?: string | null; name?: string | null; mimeType?: string | null }[] = [];
    if (parsed.type === "folder") {
      files = await listDriveFiles(parsed.id);
    } else {
      const drive = getDriveClient();
      const res = await drive.files.get({ fileId: parsed.id, fields: "id,name,mimeType" });
      if (res.data.id) files = [res.data];
    }
    return filesToMedia(files, baseUrl);
  }

  // Plain direct URL — detect by extension
  if (mediaValue.startsWith("http://") || mediaValue.startsWith("https://")) {
    const lower = mediaValue.toLowerCase().split("?")[0];
    if (lower.match(/\.(mp4|mov|avi|webm|mkv)$/)) {
      return { images: [], video: mediaValue };
    }
    return { image: mediaValue, images: [] };
  }

  // Filename(s) — look up in the SocialMedia folder
  const names = mediaValue.split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return { images: [] };
  const files = await findFilesByNames(names);
  return filesToMedia(files, baseUrl);
}

const POSTED_SUBFOLDER_NAME = "Posted";

async function ensurePostedSubfolder(parentFolderId: string): Promise<string> {
  const drive = getDriveClient();
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${POSTED_SUBFOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name: POSTED_SUBFOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Failed to create Posted subfolder");
  return created.data.id;
}

async function moveFilesToFolder(fileIds: string[], newParentId: string) {
  const drive = getDriveClient();
  await Promise.all(
    fileIds.map(async (fileId) => {
      const meta = await drive.files.get({ fileId, fields: "parents" });
      const previousParents = (meta.data.parents || []).join(",");
      await drive.files.update({
        fileId,
        addParents: newParentId,
        removeParents: previousParents,
        fields: "id, parents",
      });
    })
  );
}

/** After a successful post, move the source media into a "Posted" subfolder
 *  alongside the original folder so the working folder stays focused on
 *  upcoming content. Best-effort: errors are returned but never thrown. */
export async function moveMediaToPosted(
  mediaValue: string
): Promise<{ moved: number; error?: string }> {
  if (!mediaValue) return { moved: 0 };

  // Direct (non-Drive) URLs — nothing to move
  if (
    !mediaValue.includes("drive.google.com") &&
    (mediaValue.startsWith("http://") || mediaValue.startsWith("https://"))
  ) {
    return { moved: 0 };
  }

  try {
    const drive = getDriveClient();
    let parentFolderId: string;
    let fileIds: string[] = [];

    if (mediaValue.includes("drive.google.com")) {
      const parsed = extractDriveId(mediaValue);
      if (!parsed) return { moved: 0, error: "Could not parse Drive URL" };

      if (parsed.type === "folder") {
        parentFolderId = parsed.id;
        const files = await listDriveFiles(parentFolderId);
        fileIds = files
          .filter((f) => f.id && f.mimeType && (IMAGE_MIMES.has(f.mimeType) || VIDEO_MIMES.has(f.mimeType)))
          .map((f) => f.id!);
      } else {
        const meta = await drive.files.get({ fileId: parsed.id, fields: "id,parents" });
        if (!meta.data.parents?.[0]) return { moved: 0, error: "File has no parent folder" };
        parentFolderId = meta.data.parents[0];
        fileIds = meta.data.id ? [meta.data.id] : [];
      }
    } else {
      // Filename(s) in the configured Social Media folder
      parentFolderId = SOCIAL_MEDIA_FOLDER_ID;
      const names = mediaValue.split(",").map((s) => s.trim()).filter(Boolean);
      const files = await findFilesByNames(names);
      fileIds = files.map((f) => f.id);
    }

    if (fileIds.length === 0) return { moved: 0 };

    const postedFolderId = await ensurePostedSubfolder(parentFolderId);
    await moveFilesToFolder(fileIds, postedFolderId);
    return { moved: fileIds.length };
  } catch (e) {
    return { moved: 0, error: e instanceof Error ? e.message : "Unknown error moving media" };
  }
}

export async function getDriveFileStream(fileId: string) {
  const drive = getDriveClient();
  const [meta, stream] = await Promise.all([
    drive.files.get({ fileId, fields: "mimeType,name" }),
    drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
  ]);
  return {
    mimeType: meta.data.mimeType || "application/octet-stream",
    data: Buffer.from(stream.data as ArrayBuffer),
  };
}
