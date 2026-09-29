import { localAdminFileUrl, localApi, localFileUrl } from "./localApi.js";

export const api = localApi;

export function fileUrl(submissionId, file = "archive") {
  return localFileUrl(submissionId, file);
}

export function adminFileUrl(path) {
  return localAdminFileUrl(path);
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function statusLabel(status) {
  return {
    missing: "미제출",
    submitted: "제출 완료",
    resubmitted: "재제출 완료",
    late: "지각 제출",
    closed: "제출 마감"
  }[status] || status || "-";
}
