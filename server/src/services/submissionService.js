import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { config } from "../config.js";
import { getArchiveExtension, sanitizeFilename, sha256, timestampForFile } from "../utils/files.js";

export function latestSubmissionRows(assignmentId) {
  return db.prepare(`
    SELECT s.*
    FROM submissions s
    JOIN (
      SELECT user_id, MAX(version) AS latest_version
      FROM submissions
      WHERE assignment_id = ?
      GROUP BY user_id
    ) latest ON latest.user_id = s.user_id AND latest.latest_version = s.version
    WHERE s.assignment_id = ?
  `).all(assignmentId, assignmentId);
}

export function createSubmission({ assignment, user, archiveFile, readmeFile }) {
  if (!archiveFile) {
    const error = new Error("압축파일을 첨부해주세요.");
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const openAt = new Date(assignment.open_at);
  const extension = db.prepare(`
    SELECT due_at FROM assignment_extensions
    WHERE assignment_id = ? AND user_id = ?
  `).get(assignment.id, user.id);
  const dueAt = new Date(extension?.due_at || assignment.effective_due_at || assignment.due_at);
  if (now < openAt) {
    const error = new Error("아직 제출 시작 전입니다.");
    error.status = 400;
    throw error;
  }
  if (now > dueAt && !assignment.allow_late) {
    const error = new Error("제출 마감 시간이 지났습니다.");
    error.status = 400;
    throw error;
  }

  const ext = getArchiveExtension(archiveFile.originalname);
  const allowed = assignment.allowed_extensions.map((item) => item.toLowerCase());
  if (!allowed.includes(ext)) {
    const error = new Error(`허용되지 않은 확장자입니다. 허용: ${allowed.join(", ")}`);
    error.status = 400;
    throw error;
  }
  if (archiveFile.size <= 0) {
    const error = new Error("빈 파일은 제출할 수 없습니다.");
    error.status = 400;
    throw error;
  }
  if (archiveFile.size > assignment.max_file_size) {
    const error = new Error("파일 크기가 과제 제한을 초과했습니다.");
    error.status = 400;
    throw error;
  }
  if (readmeFile) {
    const readmeName = sanitizeFilename(readmeFile.originalname).toLowerCase();
    if (readmeName !== "readme.txt" && !readmeName.endsWith(".txt")) {
      const error = new Error("README 첨부는 .txt 파일만 가능합니다.");
      error.status = 400;
      throw error;
    }
    if (readmeFile.size > config.maxReadmeBytes) {
      const error = new Error("README.txt는 2MB 이하만 첨부할 수 있습니다.");
      error.status = 400;
      throw error;
    }
  }

  const latest = db.prepare(`
    SELECT MAX(version) AS version FROM submissions
    WHERE assignment_id = ? AND user_id = ?
  `).get(assignment.id, user.id);
  const version = Number(latest.version || 0) + 1;
  const stamp = timestampForFile(now);
  const dir = path.join(config.submissionsDir, `assignment_${assignment.id}`, user.student_number);
  fs.mkdirSync(dir, { recursive: true });

  const originalName = sanitizeFilename(archiveFile.originalname);
  const storedFilename = `${stamp}_v${version}_${user.student_number}_${originalName}`;
  const storedPath = path.join(dir, storedFilename);
  fs.writeFileSync(storedPath, archiveFile.buffer, { flag: "wx" });

  let readme = {};
  if (readmeFile) {
    const readmeOriginal = sanitizeFilename(readmeFile.originalname);
    const readmeStored = `${stamp}_v${version}_${user.student_number}_README.txt`;
    const readmePath = path.join(dir, readmeStored);
    fs.writeFileSync(readmePath, readmeFile.buffer, { flag: "wx" });
    readme = {
      readme_original_filename: readmeOriginal,
      readme_stored_filename: readmeStored,
      readme_stored_path: readmePath,
      readme_file_size: readmeFile.size,
      readme_file_hash: sha256(readmeFile.buffer)
    };
  }

  const submittedAt = now.toISOString();
  const isLate = now > dueAt;
  const status = isLate ? "late" : version > 1 ? "resubmitted" : "submitted";

  const result = db.prepare(`
    INSERT INTO submissions (
      assignment_id, user_id, student_name, student_number,
      original_filename, stored_filename, stored_path, file_size, file_extension, file_hash,
      readme_original_filename, readme_stored_filename, readme_stored_path, readme_file_size, readme_file_hash,
      submitted_at, status, is_late, version
    ) VALUES (
      @assignment_id, @user_id, @student_name, @student_number,
      @original_filename, @stored_filename, @stored_path, @file_size, @file_extension, @file_hash,
      @readme_original_filename, @readme_stored_filename, @readme_stored_path, @readme_file_size, @readme_file_hash,
      @submitted_at, @status, @is_late, @version
    )
  `).run({
    assignment_id: assignment.id,
    user_id: user.id,
    student_name: user.name,
    student_number: user.student_number,
    original_filename: originalName,
    stored_filename: storedFilename,
    stored_path: storedPath,
    file_size: archiveFile.size,
    file_extension: ext,
    file_hash: sha256(archiveFile.buffer),
    readme_original_filename: readme.readme_original_filename || null,
    readme_stored_filename: readme.readme_stored_filename || null,
    readme_stored_path: readme.readme_stored_path || null,
    readme_file_size: readme.readme_file_size || null,
    readme_file_hash: readme.readme_file_hash || null,
    submitted_at: submittedAt,
    status,
    is_late: isLate ? 1 : 0,
    version
  });

  return db.prepare("SELECT * FROM submissions WHERE id = ?").get(result.lastInsertRowid);
}

export function getSubmissionForDownload(id, user) {
  const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
  if (!submission) return null;
  if (user.role === "student" && submission.user_id !== user.id) return null;
  return submission;
}

export function studentAssignmentStatus(assignment, latest) {
  const now = Date.now();
  if (!latest && now > new Date(assignment.due_at).getTime() && !assignment.allow_late) return "closed";
  if (!latest) return "missing";
  if (latest.is_late) return "late";
  if (latest.version > 1) return "resubmitted";
  return "submitted";
}
