import crypto from "node:crypto";
import path from "node:path";

export function sanitizeFilename(filename) {
  const base = path.basename(filename || "file");
  return base
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 140) || "file";
}

export function getArchiveExtension(filename) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  return path.extname(lower);
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function timestampForFile(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function formatKst(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(iso)).replace(/\. /g, "-").replace(".", "");
}

