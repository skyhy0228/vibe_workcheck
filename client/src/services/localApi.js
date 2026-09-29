import axios from "axios";

export const localApi = axios.create({
  baseURL: "/api",
  withCredentials: true
});

export function localFileUrl(submissionId, file = "archive") {
  return `/api/submissions/${submissionId}/download?file=${file}`;
}

export function localAdminFileUrl(path) {
  return `/api/admin${path}`;
}

