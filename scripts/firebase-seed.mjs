import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  fs.readdirSync(projectRoot).find((name) => name.includes("firebase-adminsdk") && name.endsWith(".json"));

if (!serviceAccountPath) {
  console.error("Firebase service account JSON file was not found.");
  process.exit(1);
}

const resolvedServiceAccountPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(projectRoot, serviceAccountPath);

const serviceAccount = JSON.parse(fs.readFileSync(resolvedServiceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "vibe-workceck.firebasestorage.app"
});

const auth = admin.auth();
const db = admin.firestore();

function loginEmail(loginId) {
  return `${String(loginId).trim().toLowerCase()}@knut.local`;
}

async function ensureUser({ loginId, password, name, role, department = "", grade = "", email = "" }) {
  const authEmail = loginEmail(loginId);
  let user;
  try {
    user = await auth.getUserByEmail(authEmail);
  } catch {
    user = await auth.createUser({
      email: authEmail,
      password,
      displayName: name,
      emailVerified: true
    });
  }

  await db.collection("users").doc(user.uid).set({
    student_number: loginId,
    name,
    role,
    department,
    grade,
    email,
    disabled: false,
    created_at: new Date().toISOString()
  }, { merge: true });

  return user.uid;
}

const now = Date.now();
const days = (count) => new Date(now + count * 24 * 60 * 60 * 1000).toISOString();
const maxUploadBytes = 200 * 1024 * 1024;
const archiveExtensions = [".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".gz"];

await ensureUser({
  loginId: "admin",
  password: "admin00",
  name: "관리자",
  role: "professor",
  department: "컴퓨터공학전공"
});

for (const [studentNumber, name, department, grade] of [
  ["2026001", "홍길동", "컴퓨터공학전공", "4"],
  ["2026002", "김학생", "컴퓨터공학전공", "4"],
  ["2026003", "이호열", "컴퓨터공학전공", "4"],
  ["2126055", "이호열", "컴퓨터공학전공", "4"]
]) {
  await ensureUser({
    loginId: studentNumber,
    password: studentNumber,
    name,
    role: "student",
    department,
    grade,
    email: `${studentNumber}@knut.local`
  });
}

const assignments = [
  {
    id: "1",
    title: "C언어 실습 3주차",
    description: "실습한 소스코드를 압축하여 제출하세요. 실행 전 확인사항이 있으면 README.txt를 선택 첨부하세요.",
    open_at: days(-1),
    due_at: days(7),
    allow_late: true,
    max_file_size: maxUploadBytes,
    allowed_extensions: archiveExtensions
  },
  {
    id: "2",
    title: "자료구조 과제 1",
    description: "스택과 큐 구현 파일을 하나의 압축파일로 제출하세요.",
    open_at: days(-2),
    due_at: days(3),
    allow_late: false,
    max_file_size: maxUploadBytes,
    allowed_extensions: [".zip", ".7z", ".rar"]
  },
  {
    id: "3",
    title: "데이터 분석 입문",
    description: "분석 코드와 결과 이미지를 압축해 제출하세요.",
    open_at: days(-5),
    due_at: days(14),
    allow_late: true,
    max_file_size: maxUploadBytes,
    allowed_extensions: [".zip", ".tar.gz", ".tgz"]
  }
];

for (const assignment of assignments) {
  await db.collection("assignments").doc(assignment.id).set({
    ...assignment,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { merge: true });
}

await db.collection("notices").doc("welcome").set({
  title: "Firebase 버전 서비스 안내",
  body: "GitHub Pages 배포본은 Firebase Authentication, Firestore, Storage를 사용합니다.",
  pinned: true,
  created_by: "system",
  author_name: "관리자",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}, { merge: true });

console.log("Firebase seed completed.");
