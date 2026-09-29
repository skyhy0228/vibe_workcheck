import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { publicUser, requireAuth, signToken } from "../middleware/auth.js";
import { logAudit } from "../services/auditService.js";

export const authRoutes = express.Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  maxAge: 8 * 60 * 60 * 1000
};

authRoutes.post("/register", (req, res) => {
  const { name, studentNumber, password, passwordConfirm, department, grade, email } = req.body;
  if (!name?.trim() || !studentNumber?.trim() || !password) {
    return res.status(400).json({ message: "이름, 학번, 비밀번호를 입력해주세요." });
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ message: "비밀번호 확인이 일치하지 않습니다." });
  }
  if (String(studentNumber).toLowerCase() === "admin") {
    return res.status(400).json({ message: "사용할 수 없는 학번입니다." });
  }

  const exists = db.prepare("SELECT id FROM users WHERE student_number = ?").get(studentNumber);
  if (exists) return res.status(409).json({ message: "이미 가입된 학번입니다." });

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO users (student_number, name, password_hash, department, grade, email, role)
    VALUES (?, ?, ?, ?, ?, ?, 'student')
  `).run(
    String(studentNumber).trim(),
    String(name).trim(),
    passwordHash,
    department?.trim() || "",
    grade?.trim() || "",
    email?.trim() || ""
  );

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = signToken(user);
  res.cookie("knut_token", token, cookieOptions);
  res.status(201).json({ user: publicUser(user) });
});

authRoutes.post("/login", (req, res) => {
  const { loginId, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE student_number = ?").get(String(loginId || "").trim());
  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash)) {
    return res.status(401).json({ message: "학번 또는 비밀번호를 확인해주세요." });
  }
  if (user.disabled) return res.status(403).json({ message: "비활성화된 계정입니다." });
  const token = signToken(user);
  req.user = user;
  logAudit(req, "login", "user", user.id, user.student_number);
  res.cookie("knut_token", token, cookieOptions);
  res.json({ user: publicUser(user) });
});

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie("knut_token", { httpOnly: true, sameSite: "lax", secure: false });
  res.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
