import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.submissionsDir, { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      department TEXT,
      grade TEXT,
      email TEXT,
      role TEXT NOT NULL CHECK (role IN ('professor', 'student')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      open_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      allow_late INTEGER NOT NULL DEFAULT 0,
      max_file_size INTEGER NOT NULL,
      allowed_extensions TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      student_number TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_extension TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      readme_original_filename TEXT,
      readme_stored_filename TEXT,
      readme_stored_path TEXT,
      readme_file_size INTEGER,
      readme_file_hash TEXT,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL,
      is_late INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_assignment_user
      ON submissions (assignment_id, user_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_assignment
      ON submissions (assignment_id, submitted_at DESC);

    CREATE TABLE IF NOT EXISTS assignment_extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      due_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (assignment_id, user_id),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignment_qna (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      parent_id INTEGER,
      is_answer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES assignment_qna(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submission_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_qna_assignment ON assignment_qna (assignment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_submission ON submission_comments (submission_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
  `);

  const submissionColumns = db.prepare("PRAGMA table_info(submissions)").all().map((column) => column.name);
  const addSubmissionColumn = (name, definition) => {
    if (!submissionColumns.includes(name)) db.exec(`ALTER TABLE submissions ADD COLUMN ${name} ${definition}`);
  };
  addSubmissionColumn("score", "REAL");
  addSubmissionColumn("grade_status", "TEXT DEFAULT 'unreviewed'");
  addSubmissionColumn("professor_feedback", "TEXT");
  addSubmissionColumn("private_note", "TEXT");
  addSubmissionColumn("revision_requested", "INTEGER NOT NULL DEFAULT 0");
  addSubmissionColumn("reviewed_at", "TEXT");

  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("disabled")) db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
}

function insertUser(user) {
  const passwordHash = bcrypt.hashSync(user.password, 12);
  db.prepare(`
    INSERT OR IGNORE INTO users
      (student_number, name, password_hash, department, grade, email, role)
    VALUES (@studentNumber, @name, @passwordHash, @department, @grade, @email, @role)
  `).run({ ...user, passwordHash });
}

export function seed() {
  migrate();

  insertUser({
    studentNumber: config.admin.id,
    name: config.admin.name,
    password: config.admin.password,
    department: "컴퓨터공학전공",
    grade: "",
    email: "",
    role: "professor"
  });

  [
    ["2026001", "홍길동", "컴퓨터공학전공", "4"],
    ["2026002", "김학생", "컴퓨터공학전공", "4"],
    ["2026003", "이호열", "컴퓨터공학전공", "4"],
    ["2126055", "이호열", "컴퓨터공학전공", "4"]
  ].forEach(([studentNumber, name, department, grade]) => {
    insertUser({
      studentNumber,
      name,
      password: studentNumber,
      department,
      grade,
      email: `${studentNumber}@knut.local`,
      role: "student"
    });
  });

  const count = db.prepare("SELECT COUNT(*) AS count FROM assignments").get().count;
  if (count === 0) {
    const now = new Date();
    const days = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
    const insert = db.prepare(`
      INSERT INTO assignments
        (title, description, open_at, due_at, allow_late, max_file_size, allowed_extensions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      "C언어 실습 3주차",
      "실습한 소스코드를 압축하여 제출하세요. 실행 전 확인사항이 있으면 README.txt를 선택 첨부하세요.",
      days(-1),
      days(7),
      1,
      config.maxUploadBytes,
      JSON.stringify([".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".gz"])
    );
    insert.run(
      "자료구조 과제 1",
      "스택과 큐 구현 파일을 하나의 압축파일로 제출하세요.",
      days(-2),
      days(3),
      0,
      config.maxUploadBytes,
      JSON.stringify([".zip", ".7z", ".rar"])
    );
    insert.run(
      "데이터 분석 입문",
      "분석 코드와 결과 이미지를 압축해 제출하세요.",
      days(-5),
      days(14),
      1,
      config.maxUploadBytes,
      JSON.stringify([".zip", ".tar.gz", ".tgz"])
    );
  }
}

migrate();
seed();
