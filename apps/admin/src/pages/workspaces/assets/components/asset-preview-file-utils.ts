import { useAuthStore } from "@/stores/use-auth-store";
import type { AssetMasonryItem } from "@/types/assets-masonry";

const CODE_EXTENSIONS = new Set([
  "c",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

export type AssetPreviewKind =
  | "audio"
  | "code"
  | "image"
  | "json"
  | "markdown"
  | "pdf"
  | "svg"
  | "text"
  | "unsupported"
  | "video";

function getNormalizedExt(asset: AssetMasonryItem): string {
  const raw = asset.ext || asset.name.split(".").pop() || "";
  return raw.trim().toLowerCase().replace(/^\./, "");
}

export function getAssetPreviewKind(asset: AssetMasonryItem): AssetPreviewKind {
  const mime = (asset.mimeType || "").toLowerCase();
  const ext = getNormalizedExt(asset);

  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime === "image/svg+xml" || ext === "svg") return "svg";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "application/json" || ext === "json") return "json";
  if (mime === "text/markdown" || ext === "md") return "markdown";

  if (
    mime.startsWith("text/") ||
    mime.endsWith("+xml") ||
    mime.endsWith("+json") ||
    CODE_EXTENSIONS.has(ext)
  ) {
    return CODE_EXTENSIONS.has(ext) ? "code" : "text";
  }

  return "unsupported";
}

export function getAssetCodeLanguage(asset: AssetMasonryItem): string {
  const mime = (asset.mimeType || "").toLowerCase();
  const ext = getNormalizedExt(asset);

  if (ext === "md") return "markdown";
  if (ext === "svg") return "xml";
  if (ext === "yml") return "yaml";
  if (ext === "mjs") return "javascript";
  if (ext === "tsx") return "tsx";
  if (ext === "ts") return "typescript";
  if (ext === "jsx") return "jsx";
  if (ext === "js") return "javascript";
  if (ext === "py") return "python";
  if (ext === "rb") return "ruby";
  if (ext === "rs") return "rust";
  if (ext === "sh") return "bash";
  if (ext === "html") return "html";
  if (ext === "css") return "css";
  if (ext === "xml") return "xml";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";

  if (mime.includes("json")) return "json";
  if (mime.includes("xml") || mime.includes("svg")) return "xml";
  if (mime.includes("javascript")) return "javascript";
  if (mime.includes("typescript")) return "typescript";
  if (mime.includes("markdown")) return "markdown";
  if (mime.includes("html")) return "html";
  if (mime.includes("css")) return "css";
  return "text";
}

export function buildAssetAuthHeaders() {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers();
  if (!token) return headers;
  const value = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  headers.set("authorization", value);
  return headers;
}
