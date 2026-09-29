import { db } from "../db.js";

export function logAudit(req, action, targetType = "", targetId = "", detail = "") {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, target_type, target_id, detail, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.id || null,
      action,
      targetType,
      String(targetId || ""),
      typeof detail === "string" ? detail : JSON.stringify(detail),
      req.ip || req.socket?.remoteAddress || ""
    );
  } catch (error) {
    console.error("audit log failed", error);
  }
}
