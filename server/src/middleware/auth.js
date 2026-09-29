import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { db } from "../db.js";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, studentNumber: user.student_number },
    config.jwtSecret,
    { expiresIn: "8h" }
  );
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    studentNumber: user.student_number,
    name: user.name,
    department: user.department,
    grade: user.grade,
    email: user.email,
    role: user.role
  };
}

export function requireAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.knut_token || bearer;
  if (!token) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ message: "유효하지 않은 계정입니다." });
    if (user.disabled) return res.status(403).json({ message: "비활성화된 계정입니다." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "인증이 만료되었습니다." });
  }
}

export function requireProfessor(req, res, next) {
  if (req.user?.role !== "professor") {
    return res.status(403).json({ message: "교수 계정만 접근할 수 있습니다." });
  }
  next();
}

export function requireStudent(req, res, next) {
  if (req.user?.role !== "student") {
    return res.status(403).json({ message: "학생 계정만 사용할 수 있습니다." });
  }
  next();
}
