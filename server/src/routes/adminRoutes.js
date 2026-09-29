import fs from "node:fs";
import path from "node:path";
import express from "express";
import archiver from "archiver";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { requireAuth, requireProfessor } from "../middleware/auth.js";
import { db } from "../db.js";
import { createAssignment, getAssignment, listAssignments, updateAssignment } from "../services/assignmentService.js";
import { latestSubmissionRows } from "../services/submissionService.js";
import { sanitizeFilename } from "../utils/files.js";
import { logAudit } from "../services/auditService.js";

export const adminRoutes = express.Router();

adminRoutes.use(requireAuth, requireProfessor);

adminRoutes.get("/summary", (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student'").get().count;
  const assignments = db.prepare("SELECT COUNT(*) AS count FROM assignments").get().count;
  const submissions = db.prepare("SELECT COUNT(*) AS count FROM submissions").get().count;
  const totalExpected = students * assignments;
  const latestCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT assignment_id, user_id
      FROM submissions
      GROUP BY assignment_id, user_id
    )
  `).get().count;
  const recent = db.prepare(`
    SELECT s.*, a.title AS assignment_title
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    ORDER BY s.submitted_at DESC
    LIMIT 8
  `).all();
  res.json({
    summary: {
      students,
      assignments,
      submissions,
      missing: Math.max(totalExpected - latestCount, 0)
    },
    recent
  });
});

adminRoutes.get("/students", (_req, res) => {
  const students = db.prepare(`
    SELECT id, student_number, name, department, grade, email, created_at
    FROM users
    WHERE role = 'student'
    ORDER BY student_number ASC
  `).all();
  res.json({ students });
});

adminRoutes.get("/students/:id/progress", (req, res) => {
  const student = db.prepare(`
    SELECT id, student_number, name, department, grade, email, created_at
    FROM users WHERE id = ? AND role = 'student'
  `).get(req.params.id);
  if (!student) return res.status(404).json({ message: "학생을 찾을 수 없습니다." });
  const assignments = listAssignments(student).map((assignment) => {
    const latest = db.prepare(`
      SELECT * FROM submissions
      WHERE assignment_id = ? AND user_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(assignment.id, student.id) || null;
    return { assignment, latest };
  });
  res.json({ student, assignments });
});

adminRoutes.post("/students/import-csv", (req, res) => {
  const csv = String(req.body.csv || "");
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let created = 0;
  let skipped = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (student_number, name, password_hash, department, grade, email, role)
    VALUES (?, ?, ?, ?, ?, ?, 'student')
  `);
  for (const line of lines) {
    const [studentNumber, name, department = "", grade = "", email = ""] = line.split(",").map((value) => value.trim());
    if (!studentNumber || !name || studentNumber === "학번") {
      skipped += 1;
      continue;
    }
    const result = insert.run(studentNumber, name, bcrypt.hashSync(studentNumber, 12), department, grade, email);
    if (result.changes) created += 1;
    else skipped += 1;
  }
  logAudit(req, "import_students_csv", "user", "", { created, skipped });
  res.json({ created, skipped });
});

adminRoutes.post("/students/:id/reset-password", (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ message: "학생을 찾을 수 없습니다." });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(student.student_number, 12), student.id);
  logAudit(req, "reset_student_password", "user", student.id, student.student_number);
  res.json({ ok: true, password: student.student_number });
});

adminRoutes.post("/notices", (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  if (!title || !body) return res.status(400).json({ message: "공지 제목과 내용을 입력해주세요." });
  const result = db.prepare(`
    INSERT INTO notices (title, body, pinned, created_by)
    VALUES (?, ?, ?, ?)
  `).run(title, body, req.body.pinned ? 1 : 0, req.user.id);
  logAudit(req, "create_notice", "notice", result.lastInsertRowid, title);
  res.status(201).json({ id: result.lastInsertRowid });
});

adminRoutes.delete("/notices/:id", (req, res) => {
  const result = db.prepare("DELETE FROM notices WHERE id = ?").run(req.params.id);
  logAudit(req, "delete_notice", "notice", req.params.id, "");
  res.json({ ok: Boolean(result.changes) });
});

adminRoutes.put("/notices/:id", (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  if (!title || !body) return res.status(400).json({ message: "공지 제목과 내용을 입력해주세요." });
  const result = db.prepare(`
    UPDATE notices
    SET title = ?, body = ?, pinned = ?, updated_at = ?
    WHERE id = ?
  `).run(title, body, req.body.pinned ? 1 : 0, new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ message: "공지를 찾을 수 없습니다." });
  logAudit(req, "update_notice", "notice", req.params.id, title);
  res.json({ notice: db.prepare("SELECT * FROM notices WHERE id = ?").get(req.params.id) });
});

adminRoutes.post("/assignments", (req, res, next) => {
  try {
    if (!req.body.title || !req.body.description || !req.body.open_at || !req.body.due_at) {
      return res.status(400).json({ message: "과제 제목, 설명, 제출 기간을 입력해주세요." });
    }
    const assignment = createAssignment(req.body);
    logAudit(req, "create_assignment", "assignment", assignment.id, assignment.title);
    res.status(201).json({ assignment });
  } catch (error) {
    next(error);
  }
});

adminRoutes.put("/assignments/:id", (req, res, next) => {
  try {
    const assignment = updateAssignment(req.params.id, req.body);
    if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
    logAudit(req, "update_assignment", "assignment", req.params.id, assignment.title);
    res.json({ assignment });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/assignments/:id", (req, res) => {
  const result = db.prepare("DELETE FROM assignments WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  logAudit(req, "delete_assignment", "assignment", req.params.id, "");
  res.json({ ok: true });
});

adminRoutes.post("/assignments/:id/duplicate", (req, res) => {
  const current = getAssignment(req.params.id);
  if (!current) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const copy = createAssignment({
    ...current,
    title: `${current.title} 복사본`,
    allow_late: current.allow_late,
    allowed_extensions: current.allowed_extensions
  });
  logAudit(req, "duplicate_assignment", "assignment", copy.id, { from: req.params.id });
  res.status(201).json({ assignment: copy });
});

adminRoutes.post("/assignments/:id/extensions", (req, res) => {
  const assignment = getAssignment(req.params.id);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.body.studentId);
  if (!student) return res.status(404).json({ message: "학생을 찾을 수 없습니다." });
  const dueAt = new Date(req.body.dueAt).toISOString();
  db.prepare(`
    INSERT INTO assignment_extensions (assignment_id, user_id, due_at, note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(assignment_id, user_id)
    DO UPDATE SET due_at = excluded.due_at, note = excluded.note, updated_at = CURRENT_TIMESTAMP
  `).run(req.params.id, req.body.studentId, dueAt, String(req.body.note || ""));
  logAudit(req, "set_assignment_extension", "assignment", req.params.id, { studentId: req.body.studentId, dueAt });
  res.json({ ok: true });
});

adminRoutes.delete("/assignments/:id/extensions/:studentId", (req, res) => {
  db.prepare("DELETE FROM assignment_extensions WHERE assignment_id = ? AND user_id = ?").run(req.params.id, req.params.studentId);
  logAudit(req, "delete_assignment_extension", "assignment", req.params.id, { studentId: req.params.studentId });
  res.json({ ok: true });
});

adminRoutes.get("/assignments/:id/submissions", (req, res) => {
  const assignment = getAssignment(req.params.id);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const students = db.prepare(`
    SELECT id, student_number, name, department, grade, email
    FROM users
    WHERE role = 'student'
    ORDER BY student_number ASC
  `).all();
  const latest = latestSubmissionRows(req.params.id);
  const latestByUser = new Map(latest.map((row) => [row.user_id, row]));
  const rows = students.map((student) => {
    const submission = latestByUser.get(student.id) || null;
    const extension = db.prepare(`
      SELECT * FROM assignment_extensions
      WHERE assignment_id = ? AND user_id = ?
    `).get(req.params.id, student.id) || null;
    return {
      student,
      extension,
      submission,
      status: submission ? (submission.is_late ? "late" : "submitted") : "missing"
    };
  });
  const allSubmissions = db.prepare(`
    SELECT * FROM submissions
    WHERE assignment_id = ?
    ORDER BY student_number ASC, version DESC
  `).all(req.params.id);
  res.json({ assignment, rows, allSubmissions });
});

adminRoutes.get("/assignments/:id/missing", (req, res) => {
  const rows = db.prepare(`
    SELECT id, student_number, name, department, grade, email
    FROM users
    WHERE role = 'student'
      AND id NOT IN (
        SELECT user_id FROM submissions WHERE assignment_id = ?
      )
    ORDER BY student_number ASC
  `).all(req.params.id);
  res.json({ missing: rows });
});

adminRoutes.get("/assignments/:id/submissions.csv", (req, res) => {
  const assignment = getAssignment(req.params.id);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const latest = latestSubmissionRows(req.params.id);
  const latestByUser = new Map(latest.map((row) => [row.user_id, row]));
  const students = db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY student_number ASC").all();
  const lines = ["학번,이름,상태,제출시간,파일명,README,버전,점수,검토상태,수정요청"];
  students.forEach((student) => {
    const row = latestByUser.get(student.id);
    lines.push([
      student.student_number,
      student.name,
      row ? (row.is_late ? "지각 제출" : "제출 완료") : "미제출",
      row?.submitted_at || "",
      row?.original_filename || "",
      row?.readme_original_filename || "",
      row?.version || "",
      row?.score ?? "",
      row?.grade_status || "",
      row?.revision_requested ? "Y" : ""
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(assignment.title)}_submissions.csv"`);
  res.send(`\uFEFF${lines.join("\n")}`);
});

adminRoutes.put("/submissions/:id/review", (req, res) => {
  const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id);
  if (!submission) return res.status(404).json({ message: "제출물을 찾을 수 없습니다." });
  db.prepare(`
    UPDATE submissions
    SET score = ?,
        grade_status = ?,
        professor_feedback = ?,
        private_note = ?,
        revision_requested = ?,
        reviewed_at = ?
    WHERE id = ?
  `).run(
    req.body.score === "" || req.body.score == null ? null : Number(req.body.score),
    req.body.gradeStatus || "reviewed",
    String(req.body.feedback || ""),
    String(req.body.privateNote || ""),
    req.body.revisionRequested ? 1 : 0,
    new Date().toISOString(),
    req.params.id
  );
  logAudit(req, "review_submission", "submission", req.params.id, { score: req.body.score });
  res.json({ submission: db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id) });
});

adminRoutes.get("/audit-logs", (req, res) => {
  const logs = db.prepare(`
    SELECT l.*, u.name, u.student_number, u.role
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(Number(req.query.limit || 80));
  res.json({ logs });
});

adminRoutes.get("/system/backup", (req, res, next) => {
  logAudit(req, "download_backup", "system", "backup", "");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=\"knut-assignment-backup.zip\"");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("warning", (error) => {
    if (error.code !== "ENOENT") next(error);
  });
  archive.on("error", (error) => {
    if (error.code === "ENOENT") return;
    next(error);
  });
  archive.pipe(res);
  if (fs.existsSync(config.databasePath)) archive.file(config.databasePath, { name: "database/app.sqlite" });
  if (fs.existsSync(config.submissionsDir)) archive.directory(config.submissionsDir, "submissions");
  archive.finalize();
});

adminRoutes.delete("/system/submissions", (req, res) => {
  const password = String(req.body.password || "");
  if (!password || !bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(403).json({ message: "관리자 비밀번호를 확인해주세요." });
  }
  db.transaction(() => {
    db.prepare("DELETE FROM submission_comments").run();
    db.prepare("DELETE FROM submissions").run();
    db.prepare("DELETE FROM assignment_extensions").run();
  })();
  if (fs.existsSync(config.submissionsDir)) {
    for (const entry of fs.readdirSync(config.submissionsDir)) {
      fs.rmSync(path.join(config.submissionsDir, entry), { recursive: true, force: true });
    }
  }
  logAudit(req, "reset_submissions", "system", "submissions", "");
  res.json({ ok: true });
});

adminRoutes.get("/assignments/:id/download-all", (req, res, next) => {
  const assignment = getAssignment(req.params.id);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const latest = latestSubmissionRows(req.params.id);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(sanitizeFilename(assignment.title))}_submissions.zip"`
  );
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", next);
  archive.pipe(res);
  latest.forEach((submission) => {
    const folder = sanitizeFilename(`${submission.student_number}_${submission.student_name}`);
    if (fs.existsSync(submission.stored_path)) {
      archive.file(submission.stored_path, {
        name: path.posix.join(folder, sanitizeFilename(submission.original_filename))
      });
    }
    if (submission.readme_stored_path && fs.existsSync(submission.readme_stored_path)) {
      archive.file(submission.readme_stored_path, {
        name: path.posix.join(folder, "README.txt")
      });
    }
  });
  archive.finalize();
});

adminRoutes.get("/assignments", (_req, res) => {
  const assignments = listAssignments();
  res.json({ assignments });
});
