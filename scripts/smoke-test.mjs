import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(projectRoot, "server", "package.json"));
const Database = require("better-sqlite3");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:228";
const databasePath = path.join(projectRoot, "data", "database", "app.sqlite");

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `${response.status} ${response.statusText}`);
  }
  return data;
}

async function login(loginId, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password })
  });
  const data = await json(response);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  return { user: data.user, cookie };
}

const student = await login("2026001", "2026001");
const assignments = await json(await fetch(`${baseUrl}/api/assignments`, {
  headers: { Cookie: student.cookie }
}));

const assignment = assignments.assignments.find((item) => !item.is_closed && new Date(item.open_at).getTime() <= Date.now())
  || assignments.assignments.find((item) => item.allow_late)
  || assignments.assignments[0];
const assignmentId = assignment.id;
const form = new FormData();
form.append("archive", new Blob(["sample archive content"], { type: "application/zip" }), "smoke_homework.zip");
form.append("readme", new Blob(["Build: gcc main.c\nRun: ./a.exe"], { type: "text/plain" }), "README.txt");

await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/submissions`, {
  method: "POST",
  headers: { Cookie: student.cookie },
  body: form
}));

const history = await json(await fetch(`${baseUrl}/api/assignments/${assignmentId}/my-submissions`, {
  headers: { Cookie: student.cookie }
}));
const submissionId = history.submissions[0].id;

const readmeDownload = await fetch(`${baseUrl}/api/submissions/${submissionId}/download?file=readme`, {
  headers: { Cookie: student.cookie }
});
if (!readmeDownload.ok) throw new Error("README download failed");

const admin = await login("admin", "admin");
const status = await json(await fetch(`${baseUrl}/api/admin/assignments/${assignmentId}/submissions`, {
  headers: { Cookie: admin.cookie }
}));
const csv = await fetch(`${baseUrl}/api/admin/assignments/${assignmentId}/submissions.csv`, {
  headers: { Cookie: admin.cookie }
});
if (!csv.ok) throw new Error("CSV download failed");
const zip = await fetch(`${baseUrl}/api/admin/assignments/${assignmentId}/download-all`, {
  headers: { Cookie: admin.cookie }
});
if (!zip.ok) throw new Error("ZIP download failed");

console.log(JSON.stringify({
  student: student.user.studentNumber,
  assignmentId,
  latestVersion: history.submissions[0].version,
  readme: history.submissions[0].readme_original_filename,
  adminRows: status.rows.length,
  csvStatus: csv.status,
  zipStatus: zip.status
}, null, 2));

const db = new Database(databasePath);
const rows = db.prepare("SELECT stored_path, readme_stored_path FROM submissions WHERE original_filename = ?").all("smoke_homework.zip");
for (const row of rows) {
  for (const filePath of [row.stored_path, row.readme_stored_path]) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
db.prepare("DELETE FROM submissions WHERE original_filename = ?").run("smoke_homework.zip");
db.close();
