import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import JSZip from "jszip";
import { firebaseAuth, firestore, firebaseStorage, loginEmail } from "./firebaseConfig.js";

const archiveExtensions = [".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".gz"];

function nowIso() {
  return new Date().toISOString();
}

function publicUser(id, data) {
  if (!data) return null;
  return {
    id,
    studentNumber: data.student_number,
    name: data.name,
    department: data.department,
    grade: data.grade,
    email: data.email,
    role: data.role
  };
}

function row(id, data) {
  return { id, ...data };
}

function getArchiveExtension(filename = "") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  return lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
}

function sanitizeFilename(filename = "file") {
  return filename
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 140) || "file";
}

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function currentUser() {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return new Promise((resolve) => {
    const off = onAuthStateChanged(firebaseAuth, (user) => {
      off();
      resolve(user);
    });
  });
}

async function currentProfile() {
  const authUser = await currentUser();
  if (!authUser) return null;
  const snap = await getDoc(doc(firestore, "users", authUser.uid));
  if (!snap.exists()) return null;
  return publicUser(authUser.uid, snap.data());
}

async function requireProfile() {
  const profile = await currentProfile();
  if (!profile) throw new Error("로그인이 필요합니다.");
  return profile;
}

async function requireProfessor() {
  const profile = await requireProfile();
  if (profile.role !== "professor") throw new Error("교수 계정만 접근할 수 있습니다.");
  return profile;
}

async function audit(action, targetType = "", targetId = "", detail = "") {
  const profile = await currentProfile().catch(() => null);
  await addDoc(collection(firestore, "audit_logs"), {
    user_id: profile?.id || null,
    action,
    target_type: targetType,
    target_id: String(targetId || ""),
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
    ip: "github-pages",
    created_at: nowIso()
  }).catch(() => {});
}

async function getAll(name, constraints = []) {
  const snap = await getDocs(constraints.length ? query(collection(firestore, name), ...constraints) : collection(firestore, name));
  return snap.docs.map((item) => row(item.id, item.data()));
}

async function getAssignment(id, profile = null) {
  const snap = await getDoc(doc(firestore, "assignments", String(id)));
  if (!snap.exists()) return null;
  const data = row(snap.id, snap.data());
  data.allow_late = Boolean(data.allow_late);
  data.allowed_extensions = Array.isArray(data.allowed_extensions) ? data.allowed_extensions : archiveExtensions;
  let extension = null;
  if (profile?.role === "student") {
    const extensionId = `${data.id}_${profile.id}`;
    const extensionSnap = await getDoc(doc(firestore, "assignment_extensions", extensionId));
    extension = extensionSnap.exists() ? row(extensionSnap.id, extensionSnap.data()) : null;
  }
  data.extension = extension;
  data.effective_due_at = extension?.due_at || data.due_at;
  data.is_closed = Date.now() > new Date(data.effective_due_at).getTime() && !data.allow_late;
  if (profile?.role === "student") {
    const submissions = await getAll("submissions", [
      where("assignment_id", "==", data.id),
      where("user_id", "==", profile.id)
    ]);
    data.latest_submission = submissions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null;
  }
  return data;
}

async function listAssignments(profile) {
  const items = await getAll("assignments");
  const normalized = await Promise.all(items.map((item) => getAssignment(item.id, profile)));
  return normalized.sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
}

async function latestSubmissions(assignmentId) {
  const submissions = await getAll("submissions", [where("assignment_id", "==", String(assignmentId))]);
  const latest = new Map();
  for (const submission of submissions) {
    const current = latest.get(submission.user_id);
    if (!current || Number(submission.version || 0) > Number(current.version || 0)) {
      latest.set(submission.user_id, submission);
    }
  }
  return [...latest.values()];
}

async function createOrUpdateAssignment(payload, id = null) {
  const assignment = {
    title: String(payload.title || "").trim(),
    description: String(payload.description || "").trim(),
    open_at: new Date(payload.open_at).toISOString(),
    due_at: new Date(payload.due_at).toISOString(),
    allow_late: Boolean(payload.allow_late),
    max_file_size: Number(payload.max_file_size || 200 * 1024 * 1024),
    allowed_extensions: (payload.allowed_extensions || archiveExtensions).map((ext) => ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`),
    updated_at: nowIso()
  };
  if (id) {
    await updateDoc(doc(firestore, "assignments", String(id)), assignment);
    return getAssignment(id);
  }
  assignment.created_at = nowIso();
  const refDoc = doc(collection(firestore, "assignments"));
  await setDoc(refDoc, assignment);
  return getAssignment(refDoc.id);
}

async function createSubmission(assignmentId, formData, onUploadProgress) {
  const profile = await requireProfile();
  if (profile.role !== "student") throw new Error("학생 계정만 사용할 수 있습니다.");
  const assignment = await getAssignment(assignmentId, profile);
  if (!assignment) throw new Error("과제를 찾을 수 없습니다.");
  const archive = formData.get("archive");
  const readme = formData.get("readme");
  if (!archive) throw new Error("압축파일을 첨부해주세요.");

  const now = new Date();
  const dueAt = new Date(assignment.effective_due_at || assignment.due_at);
  if (now < new Date(assignment.open_at)) throw new Error("아직 제출 시작 전입니다.");
  if (now > dueAt && !assignment.allow_late) throw new Error("제출 마감 시간이 지났습니다.");

  const extension = getArchiveExtension(archive.name);
  if (!assignment.allowed_extensions.includes(extension)) {
    throw new Error(`허용되지 않은 확장자입니다. 허용: ${assignment.allowed_extensions.join(", ")}`);
  }
  if (!archive.size) throw new Error("빈 파일은 제출할 수 없습니다.");
  if (archive.size > assignment.max_file_size) throw new Error("파일 크기가 과제 제한을 초과했습니다.");

  const previous = await getAll("submissions", [
    where("assignment_id", "==", String(assignmentId)),
    where("user_id", "==", profile.id)
  ]);
  const version = previous.reduce((max, item) => Math.max(max, Number(item.version || 0)), 0) + 1;
  const stamp = timestampForFile(now);
  const originalName = sanitizeFilename(archive.name);
  const storedFilename = `${stamp}_v${version}_${profile.studentNumber}_${originalName}`;
  const storagePath = `submissions/assignment_${assignment.id}/${profile.studentNumber}/${storedFilename}`;
  const archiveRef = ref(firebaseStorage, storagePath);
  await uploadBytes(archiveRef, archive);
  const downloadUrl = await getDownloadURL(archiveRef);
  onUploadProgress?.({ loaded: archive.size, total: archive.size });

  let readmeData = {};
  if (readme) {
    if (!readme.name.toLowerCase().endsWith(".txt")) throw new Error("README 첨부는 .txt 파일만 가능합니다.");
    const readmeStoredFilename = `${stamp}_v${version}_${profile.studentNumber}_README.txt`;
    const readmePath = `submissions/assignment_${assignment.id}/${profile.studentNumber}/${readmeStoredFilename}`;
    const readmeRef = ref(firebaseStorage, readmePath);
    await uploadBytes(readmeRef, readme);
    readmeData = {
      readme_original_filename: sanitizeFilename(readme.name),
      readme_stored_filename: readmeStoredFilename,
      readme_stored_path: readmePath,
      readme_file_size: readme.size,
      readme_download_url: await getDownloadURL(readmeRef),
      readme_text: (await readme.text()).slice(0, 20000)
    };
  }

  const isLate = now > dueAt;
  const submission = {
    assignment_id: String(assignment.id),
    user_id: profile.id,
    student_name: profile.name,
    student_number: profile.studentNumber,
    original_filename: originalName,
    stored_filename: storedFilename,
    stored_path: storagePath,
    file_size: archive.size,
    file_extension: extension,
    file_hash: "",
    download_url: downloadUrl,
    submitted_at: now.toISOString(),
    status: isLate ? "late" : version > 1 ? "resubmitted" : "submitted",
    is_late: isLate,
    version,
    score: null,
    grade_status: "unreviewed",
    professor_feedback: "",
    private_note: "",
    revision_requested: false,
    ...readmeData
  };
  const submissionRef = await addDoc(collection(firestore, "submissions"), submission);
  await audit("submit_assignment", "submission", submissionRef.id, { assignmentId, version });
  return row(submissionRef.id, submission);
}

function response(data) {
  return Promise.resolve({ data });
}

async function handleGet(url) {
  const profile = await requireProfile();
  if (url === "/auth/me") return response({ user: profile });
  if (url === "/assignments") return response({ assignments: await listAssignments(profile) });
  if (url === "/notices") {
    const notices = await getAll("notices");
    return response({ notices: notices.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20) });
  }
  let match = url.match(/^\/assignments\/([^/]+)$/);
  if (match) return response({ assignment: await getAssignment(match[1], profile) });
  match = url.match(/^\/assignments\/([^/]+)\/my-submissions$/);
  if (match) {
    const submissions = await getAll("submissions", [where("assignment_id", "==", match[1]), where("user_id", "==", profile.id)]);
    return response({ submissions: submissions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0)) });
  }
  match = url.match(/^\/assignments\/([^/]+)\/qna$/);
  if (match) {
    const qna = await getAll("assignment_qna", [where("assignment_id", "==", match[1])]);
    qna.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return response({ qna });
  }
  match = url.match(/^\/assignments\/([^/]+)\/readme-template$/);
  if (match) return response("과제 실행 안내 README\n\n1. 개발 환경\n- OS:\n- 언어/버전:\n\n2. 실행 방법\n- 빌드 명령:\n- 실행 명령:\n");
  match = url.match(/^\/submissions\/([^/]+)\/readme$/);
  if (match) {
    const submission = await getDoc(doc(firestore, "submissions", match[1]));
    const data = submission.data();
    if (!submission.exists() || (profile.role === "student" && data.user_id !== profile.id)) throw new Error("README를 찾을 수 없거나 권한이 없습니다.");
    return response(data.readme_text || "README.txt 미리보기 내용이 없습니다.");
  }
  match = url.match(/^\/submissions\/([^/]+)\/comments$/);
  if (match) {
    const submissionSnap = await getDoc(doc(firestore, "submissions", match[1]));
    const submission = submissionSnap.data();
    if (!submissionSnap.exists() || (profile.role === "student" && submission.user_id !== profile.id)) throw new Error("제출물을 찾을 수 없거나 권한이 없습니다.");
    const comments = await getAll("submission_comments", [where("submission_id", "==", match[1])]);
    return response({ comments: comments.filter((item) => item.visibility === "shared" || profile.role === "professor").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) });
  }

  if (url === "/admin/assignments") {
    await requireProfessor();
    return response({ assignments: await listAssignments(null) });
  }
  if (url === "/admin/summary") {
    await requireProfessor();
    const users = await getAll("users");
    const assignments = await getAll("assignments");
    const submissions = await getAll("submissions");
    const students = users.filter((user) => user.role === "student");
    const latestKeys = new Set(submissions.map((item) => `${item.assignment_id}:${item.user_id}`));
    const recent = submissions
      .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))
      .slice(0, 8)
      .map((item) => ({ ...item, assignment_title: assignments.find((a) => a.id === item.assignment_id)?.title || "" }));
    return response({ summary: { students: students.length, assignments: assignments.length, submissions: submissions.length, missing: Math.max(students.length * assignments.length - latestKeys.size, 0) }, recent });
  }
  if (url === "/admin/students") {
    await requireProfessor();
    const students = (await getAll("users")).filter((user) => user.role === "student").sort((a, b) => String(a.student_number).localeCompare(String(b.student_number)));
    return response({ students });
  }
  match = url.match(/^\/admin\/students\/([^/]+)\/progress$/);
  if (match) {
    await requireProfessor();
    const studentSnap = await getDoc(doc(firestore, "users", match[1]));
    const student = row(studentSnap.id, studentSnap.data());
    const assignments = await listAssignments(publicUser(student.id, student));
    const rows = [];
    for (const assignment of assignments) {
      const submissions = await getAll("submissions", [where("assignment_id", "==", assignment.id), where("user_id", "==", student.id)]);
      rows.push({ assignment, latest: submissions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null });
    }
    return response({ student, assignments: rows });
  }
  match = url.match(/^\/admin\/assignments\/([^/]+)\/submissions$/);
  if (match) {
    await requireProfessor();
    const assignment = await getAssignment(match[1]);
    const students = (await getAll("users")).filter((user) => user.role === "student").sort((a, b) => String(a.student_number).localeCompare(String(b.student_number)));
    const latest = await latestSubmissions(match[1]);
    const latestByUser = new Map(latest.map((item) => [item.user_id, item]));
    const extensions = await getAll("assignment_extensions", [where("assignment_id", "==", match[1])]);
    const extByUser = new Map(extensions.map((item) => [item.user_id, item]));
    const rows = students.map((student) => {
      const submission = latestByUser.get(student.id) || null;
      return { student, extension: extByUser.get(student.id) || null, submission, status: submission ? submission.is_late ? "late" : "submitted" : "missing" };
    });
    const allSubmissions = await getAll("submissions", [where("assignment_id", "==", match[1])]);
    return response({ assignment, rows, allSubmissions });
  }
  if (url.startsWith("/admin/audit-logs")) {
    await requireProfessor();
    const logs = (await getAll("audit_logs")).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 80);
    return response({ logs });
  }
  throw new Error(`지원하지 않는 Firebase GET 경로입니다: ${url}`);
}

async function handlePost(url, data, config = {}) {
  if (url === "/auth/login") {
    const firebasePassword = String(data.loginId).trim().toLowerCase() === "admin" && data.password === "admin"
      ? "admin00"
      : data.password;
    const credential = await signInWithEmailAndPassword(firebaseAuth, loginEmail(data.loginId), firebasePassword);
    const snap = await getDoc(doc(firestore, "users", credential.user.uid));
    if (!snap.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
    await audit("login", "user", credential.user.uid, data.loginId);
    return response({ user: publicUser(credential.user.uid, snap.data()) });
  }
  if (url === "/auth/logout") {
    await signOut(firebaseAuth);
    return response({ ok: true });
  }
  if (url === "/auth/register") {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, loginEmail(data.studentNumber), data.password);
    const user = {
      student_number: String(data.studentNumber).trim(),
      name: String(data.name).trim(),
      department: data.department || "",
      grade: data.grade || "",
      email: data.email || "",
      role: "student",
      created_at: nowIso(),
      disabled: false
    };
    await setDoc(doc(firestore, "users", credential.user.uid), user);
    return response({ user: publicUser(credential.user.uid, user) });
  }

  let match = url.match(/^\/assignments\/([^/]+)\/submissions$/);
  if (match) return response({ submission: await createSubmission(match[1], data, config.onUploadProgress), message: "과제가 정상적으로 제출되었습니다." });
  match = url.match(/^\/assignments\/([^/]+)\/qna$/);
  if (match) {
    const profile = await requireProfile();
    const item = {
      assignment_id: match[1],
      user_id: profile.id,
      body: String(data.body || "").trim(),
      parent_id: data.parentId || null,
      is_answer: profile.role === "professor",
      name: profile.name,
      student_number: profile.studentNumber,
      role: profile.role,
      created_at: nowIso()
    };
    const refDoc = await addDoc(collection(firestore, "assignment_qna"), item);
    await audit("write_qna", "assignment", match[1], { qnaId: refDoc.id });
    return response({ id: refDoc.id });
  }
  match = url.match(/^\/submissions\/([^/]+)\/comments$/);
  if (match) {
    const profile = await requireProfile();
    const submissionSnap = await getDoc(doc(firestore, "submissions", match[1]));
    if (!submissionSnap.exists()) throw new Error("제출물을 찾을 수 없습니다.");
    const submission = submissionSnap.data();
    if (profile.role === "student" && submission.user_id !== profile.id) {
      throw new Error("댓글을 작성할 권한이 없습니다.");
    }
    const item = {
      submission_id: match[1],
      submission_owner_id: submission.user_id,
      assignment_id: submission.assignment_id,
      user_id: profile.id,
      body: String(data.body || "").trim(),
      visibility: profile.role === "professor" && data.visibility === "private" ? "private" : "shared",
      name: profile.name,
      student_number: profile.studentNumber,
      role: profile.role,
      created_at: nowIso()
    };
    const refDoc = await addDoc(collection(firestore, "submission_comments"), item);
    await audit("write_submission_comment", "submission", match[1], { commentId: refDoc.id });
    return response({ id: refDoc.id });
  }

  if (url === "/admin/assignments") {
    await requireProfessor();
    const assignment = await createOrUpdateAssignment(data);
    await audit("create_assignment", "assignment", assignment.id, assignment.title);
    return response({ assignment });
  }
  match = url.match(/^\/admin\/assignments\/([^/]+)\/duplicate$/);
  if (match) {
    await requireProfessor();
    const current = await getAssignment(match[1]);
    const assignment = await createOrUpdateAssignment({ ...current, title: `${current.title} 복사본` });
    return response({ assignment });
  }
  match = url.match(/^\/admin\/assignments\/([^/]+)\/extensions$/);
  if (match) {
    await requireProfessor();
    const id = `${match[1]}_${data.studentId}`;
    await setDoc(doc(firestore, "assignment_extensions", id), { assignment_id: match[1], user_id: data.studentId, due_at: new Date(data.dueAt).toISOString(), note: data.note || "", created_at: nowIso(), updated_at: nowIso() });
    return response({ ok: true });
  }
  if (url === "/admin/notices") {
    const profile = await requireProfessor();
    const refDoc = await addDoc(collection(firestore, "notices"), { title: data.title, body: data.body, pinned: Boolean(data.pinned), created_by: profile.id, author_name: profile.name, created_at: nowIso(), updated_at: nowIso() });
    return response({ id: refDoc.id });
  }
  if (url === "/admin/students/import-csv") {
    await requireProfessor();
    return response({ created: 0, skipped: 0, message: "GitHub Pages 모드에서는 CSV 계정 생성은 scripts/firebase-seed.mjs 또는 Firebase Console에서 처리하세요." });
  }
  match = url.match(/^\/admin\/students\/([^/]+)\/reset-password$/);
  if (match) return response({ ok: true, password: "Firebase Console에서 비밀번호를 재설정하세요." });
  throw new Error(`지원하지 않는 Firebase POST 경로입니다: ${url}`);
}

async function handlePut(url, data) {
  let match = url.match(/^\/admin\/assignments\/([^/]+)$/);
  if (match) {
    await requireProfessor();
    return response({ assignment: await createOrUpdateAssignment(data, match[1]) });
  }
  match = url.match(/^\/admin\/submissions\/([^/]+)\/review$/);
  if (match) {
    await requireProfessor();
    const update = {
      score: data.score === "" || data.score == null ? null : Number(data.score),
      grade_status: data.gradeStatus || "reviewed",
      professor_feedback: data.feedback || "",
      private_note: data.privateNote || "",
      revision_requested: Boolean(data.revisionRequested),
      reviewed_at: nowIso()
    };
    await updateDoc(doc(firestore, "submissions", match[1]), update);
    return response({ submission: row(match[1], { ...(await getDoc(doc(firestore, "submissions", match[1]))).data() }) });
  }
  throw new Error(`지원하지 않는 Firebase PUT 경로입니다: ${url}`);
}

async function handleDelete(url) {
  await requireProfessor();
  let match = url.match(/^\/admin\/assignments\/([^/]+)$/);
  if (match) {
    await deleteDoc(doc(firestore, "assignments", match[1]));
    return response({ ok: true });
  }
  match = url.match(/^\/admin\/notices\/([^/]+)$/);
  if (match) {
    await deleteDoc(doc(firestore, "notices", match[1]));
    return response({ ok: true });
  }
  match = url.match(/^\/admin\/assignments\/([^/]+)\/extensions\/([^/]+)$/);
  if (match) {
    await deleteDoc(doc(firestore, "assignment_extensions", `${match[1]}_${match[2]}`));
    return response({ ok: true });
  }
  throw new Error(`지원하지 않는 Firebase DELETE 경로입니다: ${url}`);
}

export const firebaseApi = {
  get: handleGet,
  post: handlePost,
  put: handlePut,
  delete: handleDelete
};

export function firebaseFileUrl(_submissionId, _file = "archive") {
  return "#";
}

export function firebaseAdminFileUrl(_path) {
  return "#";
}

export async function downloadCsvFromRows(assignment, rows) {
  const lines = ["학번,이름,상태,제출시간,파일명,README,버전,점수,검토상태,수정요청"];
  for (const { student, submission, status } of rows) {
    lines.push([
      student.student_number,
      student.name,
      status,
      submission?.submitted_at || "",
      submission?.original_filename || "",
      submission?.readme_original_filename || "",
      submission?.version || "",
      submission?.score ?? "",
      submission?.grade_status || "",
      submission?.revision_requested ? "Y" : ""
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  }
  downloadBlob(new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }), `${assignment.title}_submissions.csv`);
}

export async function downloadZipFromRows(assignment, rows) {
  const zip = new JSZip();
  for (const { student, submission } of rows) {
    if (!submission?.download_url) continue;
    const folder = zip.folder(`${student.student_number}_${student.name}`);
    const archive = await fetch(submission.download_url).then((res) => res.blob());
    folder.file(submission.original_filename, archive);
    if (submission.readme_download_url) {
      const readme = await fetch(submission.readme_download_url).then((res) => res.blob());
      folder.file("README.txt", readme);
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${assignment.title}_submissions.zip`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
