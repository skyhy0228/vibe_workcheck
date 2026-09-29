import { db } from "../db.js";
import { config } from "../config.js";

export const DEFAULT_EXTENSIONS = [".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".gz"];

function parseExtensions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return DEFAULT_EXTENSIONS;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return DEFAULT_EXTENSIONS;
}

export function normalizeAssignment(row, userId = null) {
  if (!row) return null;
  let extension = null;
  if (userId) {
    extension = db.prepare(`
      SELECT * FROM assignment_extensions
      WHERE assignment_id = ? AND user_id = ?
    `).get(row.id, userId) || null;
  }
  const effectiveDueAt = extension?.due_at || row.due_at;
  const assignment = {
    ...row,
    allow_late: Boolean(row.allow_late),
    allowed_extensions: parseExtensions(row.allowed_extensions),
    effective_due_at: effectiveDueAt,
    extension,
    is_closed: Date.now() > new Date(effectiveDueAt).getTime() && !row.allow_late
  };
  if (userId) {
    assignment.latest_submission = db.prepare(`
      SELECT * FROM submissions
      WHERE assignment_id = ? AND user_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(row.id, userId) || null;
  }
  return assignment;
}

export function listAssignments(user = null) {
  const rows = db.prepare("SELECT * FROM assignments ORDER BY due_at ASC").all();
  return rows.map((row) => normalizeAssignment(row, user?.role === "student" ? user.id : null));
}

export function getAssignment(id, user = null) {
  return normalizeAssignment(
    db.prepare("SELECT * FROM assignments WHERE id = ?").get(id),
    user?.role === "student" ? user.id : null
  );
}

export function createAssignment(input) {
  const extensions = parseExtensions(input.allowed_extensions).map((ext) =>
    ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  );
  const result = db.prepare(`
    INSERT INTO assignments
      (title, description, open_at, due_at, allow_late, max_file_size, allowed_extensions)
    VALUES (@title, @description, @open_at, @due_at, @allow_late, @max_file_size, @allowed_extensions)
  `).run({
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    open_at: new Date(input.open_at).toISOString(),
    due_at: new Date(input.due_at).toISOString(),
    allow_late: input.allow_late ? 1 : 0,
    max_file_size: Number(input.max_file_size || config.maxUploadBytes),
    allowed_extensions: JSON.stringify(extensions)
  });
  return getAssignment(result.lastInsertRowid);
}

export function updateAssignment(id, input) {
  const current = getAssignment(id);
  if (!current) return null;
  const extensions = parseExtensions(input.allowed_extensions ?? current.allowed_extensions).map((ext) =>
    ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  );
  db.prepare(`
    UPDATE assignments
    SET title = @title,
        description = @description,
        open_at = @open_at,
        due_at = @due_at,
        allow_late = @allow_late,
        max_file_size = @max_file_size,
        allowed_extensions = @allowed_extensions,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    title: String(input.title ?? current.title).trim(),
    description: String(input.description ?? current.description).trim(),
    open_at: new Date(input.open_at ?? current.open_at).toISOString(),
    due_at: new Date(input.due_at ?? current.due_at).toISOString(),
    allow_late: input.allow_late ?? current.allow_late ? 1 : 0,
    max_file_size: Number(input.max_file_size ?? current.max_file_size),
    allowed_extensions: JSON.stringify(extensions)
  });
  return getAssignment(id);
}
