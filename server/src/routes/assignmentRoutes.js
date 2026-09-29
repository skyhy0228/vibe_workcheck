import fs from "node:fs";
import express from "express";
import multer from "multer";
import { config } from "../config.js";
import { requireAuth, requireStudent } from "../middleware/auth.js";
import { db } from "../db.js";
import { getAssignment, listAssignments } from "../services/assignmentService.js";
import { createSubmission, getSubmissionForDownload } from "../services/submissionService.js";
import { logAudit } from "../services/auditService.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

export const assignmentRoutes = express.Router();

assignmentRoutes.get("/assignments", requireAuth, (req, res) => {
  res.json({ assignments: listAssignments(req.user) });
});

assignmentRoutes.get("/assignments/:id", requireAuth, (req, res) => {
  const assignment = getAssignment(req.params.id, req.user);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  res.json({ assignment });
});

assignmentRoutes.get("/assignments/:id/qna", requireAuth, (req, res) => {
  const assignment = getAssignment(req.params.id, req.user);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const qna = db.prepare(`
    SELECT q.*, u.name, u.student_number, u.role
    FROM assignment_qna q
    JOIN users u ON u.id = q.user_id
    WHERE q.assignment_id = ?
    ORDER BY COALESCE(q.parent_id, q.id) DESC, q.parent_id IS NOT NULL ASC, q.created_at ASC
  `).all(req.params.id);
  res.json({ qna });
});

assignmentRoutes.post("/assignments/:id/qna", requireAuth, (req, res) => {
  const assignment = getAssignment(req.params.id, req.user);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ message: "내용을 입력해주세요." });
  const parentId = req.body.parentId || null;
  if (parentId) {
    const parent = db.prepare("SELECT id FROM assignment_qna WHERE id = ? AND assignment_id = ?").get(parentId, req.params.id);
    if (!parent) return res.status(404).json({ message: "원글을 찾을 수 없습니다." });
  }
  const result = db.prepare(`
    INSERT INTO assignment_qna (assignment_id, user_id, body, parent_id, is_answer)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, req.user.id, body, parentId, req.user.role === "professor" ? 1 : 0);
  logAudit(req, "write_qna", "assignment", req.params.id, { qnaId: result.lastInsertRowid });
  res.status(201).json({ id: result.lastInsertRowid });
});

assignmentRoutes.get("/notices", requireAuth, (_req, res) => {
  const notices = db.prepare(`
    SELECT n.*, u.name AS author_name
    FROM notices n
    JOIN users u ON u.id = n.created_by
    ORDER BY n.pinned DESC, n.created_at DESC
    LIMIT 20
  `).all();
  res.json({ notices });
});

assignmentRoutes.post(
  "/assignments/:id/submissions",
  requireAuth,
  requireStudent,
  upload.fields([
    { name: "archive", maxCount: 1 },
    { name: "readme", maxCount: 1 }
  ]),
  (req, res, next) => {
    try {
      const assignment = getAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
      const submission = createSubmission({
        assignment,
        user: req.user,
        archiveFile: req.files?.archive?.[0],
        readmeFile: req.files?.readme?.[0]
      });
      logAudit(req, "submit_assignment", "submission", submission.id, { assignmentId: assignment.id, version: submission.version });
      res.status(201).json({ submission, message: "과제가 정상적으로 제출되었습니다." });
    } catch (error) {
      next(error);
    }
  }
);

assignmentRoutes.get("/assignments/:id/my-submissions", requireAuth, requireStudent, (req, res) => {
  const assignment = getAssignment(req.params.id);
  if (!assignment) return res.status(404).json({ message: "과제를 찾을 수 없습니다." });
  const submissions = db.prepare(`
    SELECT * FROM submissions
    WHERE assignment_id = ? AND user_id = ?
    ORDER BY version DESC
  `).all(req.params.id, req.user.id);
  res.json({ submissions });
});

assignmentRoutes.get("/assignments/:id/readme-template", requireAuth, (_req, res) => {
  res.type("text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=\"README.txt\"");
  res.send([
    "과제 실행 안내 README",
    "",
    "1. 개발 환경",
    "- OS:",
    "- 언어/버전:",
    "- 필요한 라이브러리:",
    "",
    "2. 실행 방법",
    "- 압축 해제 후 실행할 파일:",
    "- 빌드 명령:",
    "- 실행 명령:",
    "",
    "3. 제출 파일 구성",
    "- 주요 파일:",
    "- 제외한 파일:",
    "",
    "4. 참고 사항",
    "- 실행 전 알아야 할 내용:",
    "- 오류 발생 시 확인할 내용:"
  ].join("\n"));
});

assignmentRoutes.get("/submissions/:id/readme", requireAuth, (req, res) => {
  const submission = getSubmissionForDownload(req.params.id, req.user);
  if (!submission) return res.status(404).json({ message: "README를 찾을 수 없거나 권한이 없습니다." });
  if (!submission.readme_stored_path || !fs.existsSync(submission.readme_stored_path)) {
    return res.status(404).json({ message: "README.txt가 첨부되지 않았습니다." });
  }
  res.type("text/plain").send(fs.readFileSync(submission.readme_stored_path, "utf8").slice(0, 20000));
});

assignmentRoutes.get("/submissions/:id/comments", requireAuth, (req, res) => {
  const submission = getSubmissionForDownload(req.params.id, req.user);
  if (!submission) return res.status(404).json({ message: "제출물을 찾을 수 없거나 권한이 없습니다." });
  const comments = db.prepare(`
    SELECT c.*, u.name, u.student_number, u.role
    FROM submission_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.submission_id = ?
      AND (c.visibility = 'shared' OR ? = 'professor')
    ORDER BY c.created_at ASC
  `).all(req.params.id, req.user.role);
  res.json({ comments });
});

assignmentRoutes.post("/submissions/:id/comments", requireAuth, (req, res) => {
  const submission = getSubmissionForDownload(req.params.id, req.user);
  if (!submission) return res.status(404).json({ message: "제출물을 찾을 수 없거나 권한이 없습니다." });
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ message: "내용을 입력해주세요." });
  const visibility = req.user.role === "professor" && req.body.visibility === "private" ? "private" : "shared";
  const result = db.prepare(`
    INSERT INTO submission_comments (submission_id, user_id, body, visibility)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.user.id, body, visibility);
  logAudit(req, "write_submission_comment", "submission", req.params.id, { commentId: result.lastInsertRowid, visibility });
  res.status(201).json({ id: result.lastInsertRowid });
});

assignmentRoutes.get("/submissions/:id/download", requireAuth, (req, res) => {
  const submission = getSubmissionForDownload(req.params.id, req.user);
  if (!submission) return res.status(404).json({ message: "파일을 찾을 수 없거나 권한이 없습니다." });

  const kind = req.query.file === "readme" ? "readme" : "archive";
  const filePath = kind === "readme" ? submission.readme_stored_path : submission.stored_path;
  const originalName = kind === "readme" ? submission.readme_original_filename : submission.original_filename;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: "저장된 파일을 찾을 수 없습니다." });
  }
  res.download(filePath, originalName);
});
