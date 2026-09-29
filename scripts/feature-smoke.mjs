import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(projectRoot, "server", "package.json"));
const Database = require("better-sqlite3");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:228";
const databasePath = path.join(projectRoot, "data", "database", "app.sqlite");

function cleanup() {
  const db = new Database(databasePath);
  const rows = db.prepare("SELECT stored_path, readme_stored_path FROM submissions WHERE original_filename = ?").all("feature_smoke.zip");
  for (const row of rows) {
    for (const filePath of [row.stored_path, row.readme_stored_path]) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
  db.prepare("DELETE FROM submissions WHERE original_filename = ?").run("feature_smoke.zip");
  db.prepare("DELETE FROM notices WHERE title = ?").run("feature-smoke-notice");
  db.prepare("DELETE FROM assignment_qna WHERE body IN (?, ?)").run("feature smoke question", "feature smoke answer");
  db.prepare("DELETE FROM submission_comments WHERE body = ?").run("학생 댓글 테스트");
  db.prepare("DELETE FROM assignment_extensions WHERE note = ?").run("테스트 연장");
  db.close();
}

cleanup();

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `${response.status} ${response.statusText}`);
  return data;
}

async function login(loginId, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password })
  });
  const data = await json(response);
  return { user: data.user, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

const student = await login("2026001", "2026001");
const admin = await login("admin", "admin");
const assignments = await json(await fetch(`${baseUrl}/api/assignments`, { headers: { Cookie: student.cookie } }));
const assignment = assignments.assignments.find((item) => !item.is_closed && new Date(item.open_at).getTime() <= Date.now())
  || assignments.assignments.find((item) => item.allow_late)
  || assignments.assignments[0];
const assignmentId = assignment.id;

await json(await fetch(`${baseUrl}/api/admin/notices`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: admin.cookie },
  body: JSON.stringify({ title: "feature-smoke-notice", body: "공지 테스트", pinned: false })
}));
const notices = await json(await fetch(`${baseUrl}/api/notices`, { headers: { Cookie: student.cookie } }));

const qna = await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/qna`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: student.cookie },
  body: JSON.stringify({ body: "feature smoke question" })
}));
await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/qna`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: admin.cookie },
  body: JSON.stringify({ body: "feature smoke answer", parentId: qna.id })
}));

const form = new FormData();
form.append("archive", new Blob(["feature smoke archive"], { type: "application/zip" }), "feature_smoke.zip");
form.append("readme", new Blob(["Run: node index.js"], { type: "text/plain" }), "README.txt");
await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/submissions`, {
  method: "POST",
  headers: { Cookie: student.cookie },
  body: form
}));
const history = await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/my-submissions`, {
  headers: { Cookie: student.cookie }
}));
const submission = history.submissions[0];

await json(await fetch(`${baseUrl}/api/submissions/${submission.id}/comments`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: student.cookie },
  body: JSON.stringify({ body: "학생 댓글 테스트" })
}));
await json(await fetch(`${baseUrl}/api/admin/submissions/${submission.id}/review`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: admin.cookie },
  body: JSON.stringify({ score: 95, gradeStatus: "reviewed", feedback: "좋습니다.", privateNote: "내부 메모", revisionRequested: false })
}));
await json(await fetch(`${baseUrl}/api/admin/assignments/${assignmentId}/extensions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: admin.cookie },
  body: JSON.stringify({ studentId: student.user.id, dueAt: new Date(Date.now() + 9 * 86400000).toISOString(), note: "테스트 연장" })
}));

const progress = await json(await fetch(`${baseUrl}/api/admin/students/${student.user.id}/progress`, {
  headers: { Cookie: admin.cookie }
}));
const backup = await fetch(`${baseUrl}/api/admin/system/backup`, { headers: { Cookie: admin.cookie } });
if (!backup.ok) throw new Error("backup failed");
await backup.arrayBuffer();

console.log(JSON.stringify({
  noticeSeen: notices.notices.some((notice) => notice.title === "feature-smoke-notice"),
  qnaId: qna.id,
  reviewedScore: 95,
  progressRows: progress.assignments.length,
  backupStatus: backup.status
}, null, 2));

cleanup();
