import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Download,
  Eye,
  FileArchive,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { adminFileUrl, api, fileUrl, formatBytes, formatDate, statusLabel } from "./services/api.js";

const RouterContext = createContext(null);

function useRouter() {
  return useContext(RouterContext);
}

function Link({ to, children, ...props }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

function Navigate({ to }) {
  const { navigate } = useRouter();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return null;
}

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { user, setUser, loading, refresh };
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onClose, 3200);
    return () => clearTimeout(id);
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.type || "info"}`}>{toast.message}</div>;
}

function Brand({ compact = false }) {
  return (
    <Link to="/" className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-mark"><GraduationCap size={compact ? 20 : 28} /></span>
      <span>
        <strong>국립한국교통대학교</strong>
        <small>과제제출시스템</small>
      </span>
    </Link>
  );
}

function LoginPage({ setUser, showToast }) {
  const { navigate } = useRouter();
  const [form, setForm] = useState({ loginId: "2126055", password: "2126055" });
  const [busy, setBusy] = useState(false);

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", form);
      setUser(data.user);
      navigate(data.user.role === "professor" ? "/admin" : "/student");
    } catch (error) {
      showToast(error.response?.data?.message || "로그인에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-hero">
        <Brand />
        <div className="hero-copy">
          <h1>나의 과제,<br /><span>스마트하게</span></h1>
          <p>과제 확인부터 압축파일 제출, README.txt 선택 첨부, 제출 이력 관리까지 한 곳에서 처리하세요.</p>
        </div>
        <div className="hero-actions">
          <div><ClipboardList size={24} /><strong>과제목록</strong><small>마감 확인</small></div>
          <div><Upload size={24} /><strong>제출관리</strong><small>압축파일 제출</small></div>
          <div><FileText size={24} /><strong>README</strong><small>선택 첨부</small></div>
        </div>
        <footer>COPYRIGHT(C) Korea National University of Transportation. ALL RIGHTS RESERVED.</footer>
      </section>
      <section className="login-panel">
        <form onSubmit={login} className="auth-card">
          <h2>로그인</h2>
          <p>학번 또는 관리자 ID와 비밀번호를 입력해 주세요.</p>
          <div className="notice"><ShieldCheck size={18} /> 중복 로그인을 제한하는 실제 서비스 형태의 인증 흐름입니다.</div>
          <label>아이디 (학번)<input value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} /></label>
          <label>비밀번호<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="primary" disabled={busy}>{busy ? "확인 중..." : "로그인 ->"}</button>
          <Link className="secondary" to="/register">학생 회원가입</Link>
          <div className="login-help">교수 계정: admin / admin<br />학생 테스트 계정: 2126055 / 2126055</div>
        </form>
      </section>
    </main>
  );
}

function RegisterPage({ setUser, showToast }) {
  const { navigate } = useRouter();
  const [form, setForm] = useState({
    name: "",
    studentNumber: "",
    password: "",
    passwordConfirm: "",
    department: "컴퓨터공학전공",
    grade: "4",
    email: ""
  });

  const submit = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post("/auth/register", form);
      setUser(data.user);
      showToast("회원가입이 완료되었습니다.", "success");
      navigate("/student");
    } catch (error) {
      showToast(error.response?.data?.message || "회원가입에 실패했습니다.", "error");
    }
  };

  return (
    <main className="grid-page auth-page">
      <Brand compact />
      <form className="form-card" onSubmit={submit}>
        <h1>학생 회원가입</h1>
        <div className="form-grid">
          <label>이름<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>학번<input value={form.studentNumber} onChange={(e) => setForm({ ...form, studentNumber: e.target.value })} /></label>
          <label>비밀번호<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>비밀번호 확인<input type="password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} /></label>
          <label>학과<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
          <label>학년<input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
          <label className="full">이메일<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        </div>
        <button className="primary">가입하기</button>
      </form>
    </main>
  );
}

function AppLayout({ user, setUser, children }) {
  const { navigate } = useRouter();
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    navigate("/");
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand compact />
        <nav>
          {user.role === "professor" ? (
            <>
              <Link to="/admin">메인</Link>
              <Link to="/admin/students">학생목록</Link>
              <Link to="/admin/tools">관리도구</Link>
            </>
          ) : (
            <Link to="/student">과제목록</Link>
          )}
        </nav>
        <div className="session">
          <span>{user.department || "컴퓨터공학전공"} | {user.name} 님</span>
          <button className="icon-btn" onClick={logout} title="로그아웃"><LogOut size={18} /></button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Protected({ user, loading, role, children }) {
  if (loading) return <div className="loading">로딩 중...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === "professor" ? "/admin" : "/student"} replace />;
  return children;
}

function HeroTitle({ kicker, title, body }) {
  return (
    <section className="page-hero">
      <span>{kicker}</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  );
}

function StatCard({ icon, label, value, tone = "" }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function StudentDashboard({ user }) {
  const [assignments, setAssignments] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([api.get("/assignments"), api.get("/notices")])
      .then(([assignmentRes, noticeRes]) => {
        setAssignments(assignmentRes.data.assignments);
        setNotices(noticeRes.data.notices);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const total = assignments.length;
    const submitted = assignments.filter((a) => a.latest_submission).length;
    const urgent = assignments.filter((a) => {
      const left = new Date(a.due_at).getTime() - Date.now();
      return left > 0 && left < 3 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, submitted, missing: total - submitted, urgent };
  }, [assignments]);

  return (
    <main className="grid-page">
      <HeroTitle
        kicker={`${user.name} / ${user.studentNumber}`}
        title="편리하고 공정한 과제 제출 서비스"
        body="압축파일을 제출하고, 필요한 경우 실행 안내 README.txt를 함께 첨부할 수 있습니다."
      />
      <section className="stats-row">
        <StatCard icon={<BookOpen />} label="전체 과제" value={stats.total} />
        <StatCard icon={<CheckCircle2 />} label="제출 완료" value={stats.submitted} tone="green" />
        <StatCard icon={<Archive />} label="미제출" value={stats.missing} tone="orange" />
        <StatCard icon={<RefreshCcw />} label="마감 임박" value={stats.urgent} tone="blue" />
      </section>
      {notices.length > 0 && (
        <section className="panel notice-board">
          <div className="panel-head"><h2><Bell size={22} /> 공지사항</h2></div>
          <div className="notice-list">
            {notices.slice(0, 4).map((notice) => (
              <article key={notice.id}>
                <strong>{notice.pinned ? "[중요] " : ""}{notice.title}</strong>
                <p>{notice.body}</p>
                <small>{notice.author_name} · {formatDate(notice.created_at)}</small>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head"><h2>과제 목록</h2><small>{loading ? "불러오는 중" : `${assignments.length}개 과제`}</small></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>과제명</th><th>마감일</th><th>상태</th><th>최근 제출</th><th>기능</th></tr></thead>
            <tbody>
              {assignments.map((item) => {
                const status = item.latest_submission
                  ? item.latest_submission.is_late ? "late" : item.latest_submission.version > 1 ? "resubmitted" : "submitted"
                  : item.is_closed ? "closed" : "missing";
                return (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><small>{item.allowed_extensions.join(", ")}</small></td>
                    <td>{formatDate(item.due_at)}</td>
                    <td><span className={`badge ${status}`}>{statusLabel(status)}</span></td>
                    <td>{item.latest_submission ? formatDate(item.latest_submission.submitted_at) : "-"}</td>
                    <td><Link className="mini-btn" to={`/student/assignments/${item.id}`}>상세보기</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function AssignmentDetail({ showToast, id, user }) {
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [qna, setQna] = useState([]);
  const [qnaBody, setQnaBody] = useState("");
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [readmePreview, setReadmePreview] = useState(null);
  const [archive, setArchive] = useState(null);
  const [readme, setReadme] = useState(null);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef(null);

  const load = async () => {
    const [a, s] = await Promise.all([
      api.get(`/assignments/${id}`),
      api.get(`/assignments/${id}/my-submissions`)
    ]);
    setAssignment(a.data.assignment);
    setSubmissions(s.data.submissions);
    const q = await api.get(`/assignments/${id}/qna`);
    setQna(q.data.qna);
    if (s.data.submissions[0]) {
      const c = await api.get(`/submissions/${s.data.submissions[0].id}/comments`);
      setComments(c.data.comments);
    } else {
      setComments([]);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const submit = async () => {
    if (!archive) return showToast("제출할 압축파일을 선택해주세요.", "error");
    if (!window.confirm(`${archive.name} 파일을 제출하시겠습니까?`)) return;
    const formData = new FormData();
    formData.append("archive", archive);
    if (readme) formData.append("readme", readme);
    try {
      await api.post(`/assignments/${id}/submissions`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => setProgress(Math.round((event.loaded / event.total) * 100))
      });
      setArchive(null);
      setReadme(null);
      setProgress(0);
      showToast("과제가 정상적으로 제출되었습니다.", "success");
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || "파일 업로드 중 오류가 발생했습니다.", "error");
    }
  };

  const addQna = async (parentId = null) => {
    const body = qnaBody.trim();
    if (!body) return showToast("질문 내용을 입력해주세요.", "error");
    await api.post(`/assignments/${id}/qna`, { body, parentId });
    setQnaBody("");
    const q = await api.get(`/assignments/${id}/qna`);
    setQna(q.data.qna);
  };

  const addComment = async () => {
    if (!latest) return;
    const body = commentBody.trim();
    if (!body) return showToast("댓글 내용을 입력해주세요.", "error");
    await api.post(`/submissions/${latest.id}/comments`, { body });
    setCommentBody("");
    const c = await api.get(`/submissions/${latest.id}/comments`);
    setComments(c.data.comments);
  };

  const previewReadme = async (submissionId) => {
    try {
      const { data } = await api.get(`/submissions/${submissionId}/readme`, { responseType: "text" });
      setReadmePreview(data);
    } catch (error) {
      showToast(error.response?.data?.message || "README 미리보기를 불러오지 못했습니다.", "error");
    }
  };

  if (!assignment) return <div className="loading">과제 정보를 불러오는 중...</div>;
  const closed = assignment.is_closed;
  const latest = submissions[0];
  const filenameWarning = archive && !archive.name.includes(user.studentNumber);

  return (
    <main className="grid-page">
      <section className="detail-grid">
        <article className="panel">
          <div className="panel-head">
            <h1>{assignment.title}</h1>
            <span className={`badge ${closed ? "closed" : "submitted"}`}>{closed ? "제출 마감" : "제출 가능"}</span>
          </div>
          <p className="description">{assignment.description}</p>
          <dl className="meta-grid">
            <div><dt>제출 시작</dt><dd>{formatDate(assignment.open_at)}</dd></div>
            <div><dt>마감</dt><dd>{formatDate(assignment.due_at)}</dd></div>
            <div><dt>지각 제출</dt><dd>{assignment.allow_late ? "허용" : "미허용"}</dd></div>
            <div><dt>최대 용량</dt><dd>{formatBytes(assignment.max_file_size)}</dd></div>
          </dl>
        </article>
        <article className="panel upload-panel">
          <h2>과제 제출</h2>
          <a className="mini-btn" href={`/api/assignments/${id}/readme-template`}><Download size={15} /> README 템플릿</a>
          <div
            className={`drop-zone ${archive ? "ready" : ""}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setArchive(e.dataTransfer.files?.[0] || null);
            }}
          >
            <FileArchive size={34} />
            <strong>{archive ? archive.name : "압축파일을 선택하거나 드래그하세요"}</strong>
            <small>허용 확장자: {assignment.allowed_extensions.join(", ")}</small>
            {archive && <small>{formatBytes(archive.size)}</small>}
          </div>
          {filenameWarning && <div className="inline-warning"><FileText size={17} /> 파일명에 학번이 없어요. 권장 형식: 학번_이름_과제명.zip</div>}
          <input ref={fileInput} type="file" hidden onChange={(e) => setArchive(e.target.files?.[0] || null)} />
          <label className="readme-picker">
            <FileText size={18} />
            <span>{readme ? readme.name : "README.txt 선택 첨부"}</span>
            <input type="file" accept=".txt,text/plain" onChange={(e) => setReadme(e.target.files?.[0] || null)} />
          </label>
          {progress > 0 && <div className="progress"><span style={{ width: `${progress}%` }} /></div>}
          <button className="primary" onClick={submit} disabled={closed}>제출하기</button>
        </article>
      </section>
      {latest && (latest.score != null || latest.professor_feedback || latest.revision_requested) && (
        <section className="panel feedback-panel">
          <div className="panel-head"><h2><Star size={21} /> 교수 피드백</h2><span className="badge submitted">{latest.score != null ? `${latest.score}점` : latest.grade_status}</span></div>
          {latest.revision_requested ? <div className="inline-warning">수정 요청이 있습니다. 피드백을 확인하고 재제출하세요.</div> : null}
          <p>{latest.professor_feedback || "아직 공개 피드백이 없습니다."}</p>
        </section>
      )}
      <section className="panel">
        <div className="panel-head"><h2>제출 이력</h2>{latest && <span className="badge submitted">최종 제출본 v{latest.version}</span>}</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>버전</th><th>제출시간</th><th>압축파일</th><th>README</th><th>상태</th><th>점수</th><th>다운로드</th></tr></thead>
            <tbody>
              {submissions.map((item) => (
                <tr key={item.id}>
                  <td>v{item.version}</td>
                  <td>{formatDate(item.submitted_at)}</td>
                  <td>{item.original_filename}<small>{formatBytes(item.file_size)}</small></td>
                  <td>{item.readme_original_filename || "-"}</td>
                  <td><span className={`badge ${item.is_late ? "late" : item.version > 1 ? "resubmitted" : "submitted"}`}>{statusLabel(item.is_late ? "late" : item.version > 1 ? "resubmitted" : "submitted")}</span></td>
                  <td>{item.score ?? "-"}</td>
                  <td className="actions">
                    <a className="icon-btn" href={fileUrl(item.id)} title="압축파일 다운로드"><Download size={17} /></a>
                    {item.readme_original_filename && <a className="icon-btn" href={fileUrl(item.id, "readme")} title="README 다운로드"><FileText size={17} /></a>}
                    {item.readme_original_filename && <button className="icon-btn" onClick={() => previewReadme(item.id)} title="README 미리보기"><Eye size={17} /></button>}
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && <tr><td colSpan="7" className="empty">아직 제출한 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {readmePreview != null && (
        <section className="panel">
          <div className="panel-head"><h2>README 미리보기</h2><button className="secondary compact-btn" onClick={() => setReadmePreview(null)}>닫기</button></div>
          <pre className="readme-preview">{readmePreview}</pre>
        </section>
      )}
      {latest && (
        <section className="panel">
          <div className="panel-head"><h2><MessageSquare size={21} /> 제출물 댓글</h2></div>
          <div className="comment-list">
            {comments.map((comment) => (
              <article key={comment.id}><strong>{comment.name}</strong><p>{comment.body}</p><small>{formatDate(comment.created_at)}</small></article>
            ))}
            {comments.length === 0 && <p className="muted">아직 댓글이 없습니다.</p>}
          </div>
          <div className="comment-box"><input placeholder="교수님께 남길 문의 또는 답변" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} /><button className="primary compact-btn" onClick={addComment}>등록</button></div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head"><h2><MessageSquare size={21} /> 과제 Q&A</h2></div>
        <div className="comment-box"><input placeholder="과제에 대한 질문을 남기세요" value={qnaBody} onChange={(e) => setQnaBody(e.target.value)} /><button className="primary compact-btn" onClick={() => addQna(null)}>질문 등록</button></div>
        <div className="comment-list">
          {qna.map((item) => (
            <article key={item.id} className={item.parent_id ? "reply" : ""}>
              <strong>{item.role === "professor" ? "교수 답변" : item.name}</strong>
              <p>{item.body}</p>
              <small>{formatDate(item.created_at)}</small>
            </article>
          ))}
          {qna.length === 0 && <p className="muted">아직 질문이 없습니다.</p>}
        </div>
      </section>
    </main>
  );
}

function AssignmentForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || "",
    description: initial?.description || "",
    open_at: initial?.open_at ? initial.open_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
    due_at: initial?.due_at ? initial.due_at.slice(0, 16) : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    allow_late: Boolean(initial?.allow_late),
    max_file_size: initial?.max_file_size || 200 * 1024 * 1024,
    allowed_extensions: (initial?.allowed_extensions || [".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".gz"]).join(", ")
  }));
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, allowed_extensions: form.allowed_extensions.split(",").map((v) => v.trim()) }); }}>
        <h2>{initial ? "과제 수정" : "과제 생성"}</h2>
        <label>과제 제목<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label>설명<textarea rows="5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="form-grid">
          <label>제출 시작<input type="datetime-local" value={form.open_at} onChange={(e) => setForm({ ...form, open_at: e.target.value })} /></label>
          <label>마감<input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label>
          <label>최대 크기(byte)<input type="number" value={form.max_file_size} onChange={(e) => setForm({ ...form, max_file_size: Number(e.target.value) })} /></label>
          <label>허용 확장자<input value={form.allowed_extensions} onChange={(e) => setForm({ ...form, allowed_extensions: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.allow_late} onChange={(e) => setForm({ ...form, allow_late: e.target.checked })} /> 지각 제출 허용</label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>취소</button><button className="primary">저장</button></div>
      </form>
    </div>
  );
}

function ProfessorDashboard({ showToast }) {
  const [summary, setSummary] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [notices, setNotices] = useState([]);
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "", pinned: true });
  const [form, setForm] = useState(null);

  const load = async () => {
    const [s, a, n] = await Promise.all([api.get("/admin/summary"), api.get("/admin/assignments"), api.get("/notices")]);
    setSummary(s.data);
    setAssignments(a.data.assignments);
    setNotices(n.data.notices);
  };
  useEffect(() => { load(); }, []);

  const save = async (payload) => {
    try {
      if (form?.id) await api.put(`/admin/assignments/${form.id}`, payload);
      else await api.post("/admin/assignments", payload);
      setForm(null);
      showToast("과제가 저장되었습니다.", "success");
      load();
    } catch (error) {
      showToast(error.response?.data?.message || "저장에 실패했습니다.", "error");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("과제와 제출 이력이 함께 삭제됩니다. 계속할까요?")) return;
    await api.delete(`/admin/assignments/${id}`);
    showToast("과제가 삭제되었습니다.", "success");
    load();
  };

  const saveNotice = async () => {
    try {
      await api.post("/admin/notices", noticeForm);
      setNoticeForm({ title: "", body: "", pinned: true });
      showToast("공지가 등록되었습니다.", "success");
      load();
    } catch (error) {
      showToast(error.response?.data?.message || "공지 등록에 실패했습니다.", "error");
    }
  };

  const deleteNotice = async (id) => {
    await api.delete(`/admin/notices/${id}`);
    showToast("공지가 삭제되었습니다.", "success");
    load();
  };

  return (
    <main className="grid-page">
      <HeroTitle kicker="Professor Dashboard" title="제출 현황을 한눈에 관리하세요" body="과제 생성, 제출률, 미제출자, 전체 다운로드를 관리할 수 있습니다." />
      <section className="stats-row">
        <StatCard icon={<Users />} label="전체 학생" value={summary?.summary.students ?? 0} />
        <StatCard icon={<ClipboardList />} label="등록 과제" value={summary?.summary.assignments ?? 0} tone="blue" />
        <StatCard icon={<Upload />} label="제출 건수" value={summary?.summary.submissions ?? 0} tone="green" />
        <StatCard icon={<Archive />} label="미제출 누계" value={summary?.summary.missing ?? 0} tone="orange" />
      </section>
      <section className="panel notice-admin">
        <div className="panel-head"><h2><Bell size={22} /> 공지사항</h2></div>
        <div className="notice-editor">
          <input placeholder="공지 제목" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} />
          <textarea rows="3" placeholder="공지 내용" value={noticeForm.body} onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })} />
          <label className="check"><input type="checkbox" checked={noticeForm.pinned} onChange={(e) => setNoticeForm({ ...noticeForm, pinned: e.target.checked })} /> 중요 공지</label>
          <button className="primary compact-btn" onClick={saveNotice}>공지 등록</button>
        </div>
        <div className="notice-list">
          {notices.slice(0, 4).map((notice) => (
            <article key={notice.id}>
              <strong>{notice.pinned ? "[중요] " : ""}{notice.title}</strong>
              <p>{notice.body}</p>
              <button className="mini-btn" onClick={() => deleteNotice(notice.id)}>삭제</button>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>과제 관리</h2><button className="primary compact-btn" onClick={() => setForm({})}><Plus size={17} /> 과제 생성</button></div>
        <div className="assignment-grid">
          {assignments.map((item) => (
            <article className="assignment-card" key={item.id}>
              <div><span className="new-label">NEW</span><h3>{item.title}</h3><p>{item.description}</p></div>
              <dl><dt>마감</dt><dd>{formatDate(item.due_at)}</dd><dt>확장자</dt><dd>{item.allowed_extensions.join(", ")}</dd></dl>
              <div className="card-actions">
                <Link className="primary compact-btn" to={`/admin/assignments/${item.id}`}>현황 보기</Link>
                <button className="secondary compact-btn" onClick={() => setForm(item)}>수정</button>
                <button className="icon-btn danger" onClick={() => remove(item.id)} title="삭제"><Trash2 size={17} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>최근 제출</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>과제</th><th>학번</th><th>이름</th><th>파일명</th><th>README</th><th>제출시간</th></tr></thead>
            <tbody>
              {(summary?.recent || []).map((item) => (
                <tr key={item.id}><td>{item.assignment_title}</td><td>{item.student_number}</td><td>{item.student_name}</td><td>{item.original_filename}</td><td>{item.readme_original_filename || "-"}</td><td>{formatDate(item.submitted_at)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {form && <AssignmentForm initial={form.id ? form : null} onSubmit={save} onCancel={() => setForm(null)} />}
    </main>
  );
}

function ReviewModal({ row, onClose, onSaved, showToast }) {
  const submission = row.submission;
  const [form, setForm] = useState({
    score: submission?.score ?? "",
    gradeStatus: submission?.grade_status || "reviewed",
    feedback: submission?.professor_feedback || "",
    privateNote: submission?.private_note || "",
    revisionRequested: Boolean(submission?.revision_requested)
  });

  const save = async () => {
    try {
      await api.put(`/admin/submissions/${submission.id}/review`, form);
      showToast("검토 내용이 저장되었습니다.", "success");
      onSaved();
    } catch (error) {
      showToast(error.response?.data?.message || "검토 저장에 실패했습니다.", "error");
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{row.student.name} 제출물 검토</h2>
        <div className="form-grid">
          <label>점수<input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></label>
          <label>검토 상태<select value={form.gradeStatus} onChange={(e) => setForm({ ...form, gradeStatus: e.target.value })}><option value="reviewed">검토 완료</option><option value="needs_revision">수정 필요</option><option value="excellent">우수</option></select></label>
        </div>
        <label>학생에게 보이는 피드백<textarea rows="4" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} /></label>
        <label>교수 비공개 메모<textarea rows="3" value={form.privateNote} onChange={(e) => setForm({ ...form, privateNote: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={form.revisionRequested} onChange={(e) => setForm({ ...form, revisionRequested: e.target.checked })} /> 수정 요청 표시</label>
        <div className="modal-actions"><button className="secondary" onClick={onClose}>닫기</button><button className="primary" onClick={save}>저장</button></div>
      </div>
    </div>
  );
}

function AdminAssignmentStatus({ id, showToast }) {
  const [data, setData] = useState(null);
  const [qna, setQna] = useState([]);
  const [answerBody, setAnswerBody] = useState("");
  const [reviewRow, setReviewRow] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("student_number");

  const loadStatus = async () => {
    const [status, qnaRes] = await Promise.all([
      api.get(`/admin/assignments/${id}/submissions`),
      api.get(`/assignments/${id}/qna`)
    ]);
    setData(status.data);
    setQna(qnaRes.data.qna);
  };

  useEffect(() => { loadStatus(); }, [id]);

  const saveExtension = async (studentId) => {
    const dueAt = window.prompt("개별 연장 마감일을 입력하세요. 예: 2026-09-30T23:59");
    if (!dueAt) return;
    await api.post(`/admin/assignments/${id}/extensions`, { studentId, dueAt, note: "교수 개별 연장" });
    await loadStatus();
  };

  const removeExtension = async (studentId) => {
    await api.delete(`/admin/assignments/${id}/extensions/${studentId}`);
    await loadStatus();
  };

  const answerQna = async (parentId) => {
    if (!answerBody.trim()) return;
    await api.post(`/assignments/${id}/qna`, { body: answerBody, parentId });
    setAnswerBody("");
    const qnaRes = await api.get(`/assignments/${id}/qna`);
    setQna(qnaRes.data.qna);
  };

  const rows = useMemo(() => {
    const list = data?.rows || [];
    return list
      .filter((row) => filter === "all" || row.status === filter)
      .filter((row) => `${row.student.student_number} ${row.student.name}`.includes(query))
      .sort((a, b) => {
        if (sort === "submitted_at") return String(b.submission?.submitted_at || "").localeCompare(String(a.submission?.submitted_at || ""));
        if (sort === "status") return a.status.localeCompare(b.status);
        return String(a.student[sort] || "").localeCompare(String(b.student[sort] || ""));
      });
  }, [data, query, filter, sort]);

  if (!data) return <div className="loading">제출 현황을 불러오는 중...</div>;
  const submitted = data.rows.filter((r) => r.submission).length;
  const percent = data.rows.length ? Math.round((submitted / data.rows.length) * 100) : 0;

  return (
    <main className="grid-page">
      <section className="panel status-hero">
        <div>
          <Link to="/admin" className="sub-link">← 관리자 메인</Link>
          <h1>{data.assignment.title}</h1>
          <p>{data.assignment.description}</p>
        </div>
        <div className="rate">
          <strong>{percent}%</strong>
          <span>{submitted} / {data.rows.length} 제출</span>
          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        </div>
      </section>
      <section className="panel">
        <div className="toolbar">
          <div className="search"><Search size={17} /><input placeholder="이름 또는 학번 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체</option>
            <option value="submitted">제출 완료</option>
            <option value="missing">미제출</option>
            <option value="late">지각 제출</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="student_number">학번순</option>
            <option value="name">이름순</option>
            <option value="submitted_at">제출시간순</option>
            <option value="status">상태순</option>
          </select>
          <a className="secondary compact-btn" href={adminFileUrl(`/assignments/${id}/submissions.csv`)}>CSV</a>
          <a className="primary compact-btn" href={adminFileUrl(`/assignments/${id}/download-all`)}><Download size={17} /> 전체 ZIP</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>학번</th><th>이름</th><th>상태</th><th>마감</th><th>제출시간</th><th>파일명</th><th>README</th><th>점수</th><th>관리</th></tr></thead>
            <tbody>
              {rows.map(({ student, submission, status, extension }) => (
                <tr key={student.id}>
                  <td>{student.student_number}</td>
                  <td>{student.name}</td>
                  <td><span className={`badge ${status}`}>{statusLabel(status)}</span></td>
                  <td>{extension ? <span className="badge resubmitted">개별 {formatDate(extension.due_at)}</span> : formatDate(data.assignment.due_at)}</td>
                  <td>{submission ? formatDate(submission.submitted_at) : "-"}</td>
                  <td>{submission?.original_filename || "-"}</td>
                  <td>{submission?.readme_original_filename || "-"}</td>
                  <td>{submission?.score ?? "-"}</td>
                  <td className="actions">
                    {submission && <a className="icon-btn" href={fileUrl(submission.id)}><Download size={17} /></a>}
                    {submission?.readme_original_filename && <a className="icon-btn" href={fileUrl(submission.id, "readme")}><FileText size={17} /></a>}
                    {submission && <button className="mini-btn" onClick={() => setReviewRow({ student, submission })}>검토</button>}
                    <button className="mini-btn" onClick={() => saveExtension(student.id)}><Clock size={14} /> 연장</button>
                    {extension && <button className="mini-btn" onClick={() => removeExtension(student.id)}>연장취소</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2><MessageSquare size={21} /> 과제 Q&A 답변</h2></div>
        <div className="comment-box"><input placeholder="선택한 질문에 공통 답변을 남길 수 있습니다" value={answerBody} onChange={(e) => setAnswerBody(e.target.value)} /></div>
        <div className="comment-list">
          {qna.map((item) => (
            <article key={item.id} className={item.parent_id ? "reply" : ""}>
              <strong>{item.role === "professor" ? "교수 답변" : `${item.name} (${item.student_number})`}</strong>
              <p>{item.body}</p>
              <small>{formatDate(item.created_at)}</small>
              {!item.parent_id && <button className="mini-btn" onClick={() => answerQna(item.id)}>이 질문에 답변</button>}
            </article>
          ))}
        </div>
      </section>
      {reviewRow && <ReviewModal row={reviewRow} onClose={() => setReviewRow(null)} onSaved={() => { setReviewRow(null); loadStatus(); }} showToast={showToast} />}
    </main>
  );
}

function StudentsPage({ showToast }) {
  const [students, setStudents] = useState([]);
  const [csv, setCsv] = useState("");
  const [progress, setProgress] = useState(null);
  const load = () => api.get("/admin/students").then(({ data }) => setStudents(data.students));
  useEffect(() => { load(); }, []);

  const importCsv = async () => {
    try {
      const { data } = await api.post("/admin/students/import-csv", { csv });
      showToast(`학생 ${data.created}명 등록, ${data.skipped}명 건너뜀`, "success");
      setCsv("");
      load();
    } catch (error) {
      showToast(error.response?.data?.message || "CSV 등록에 실패했습니다.", "error");
    }
  };

  const resetPassword = async (id) => {
    if (!window.confirm("이 학생의 비밀번호를 학번으로 초기화할까요?")) return;
    const { data } = await api.post(`/admin/students/${id}/reset-password`);
    showToast(`초기 비밀번호: ${data.password}`, "success");
  };

  const showProgress = async (id) => {
    const { data } = await api.get(`/admin/students/${id}/progress`);
    setProgress(data);
  };

  return (
    <main className="grid-page">
      <HeroTitle kicker="Students" title="학생 목록" body="학생 개인정보와 비밀번호 원문은 표시하지 않습니다." />
      <section className="panel">
        <div className="panel-head"><h2>CSV 학생 일괄 등록</h2><small>학번,이름,학과,학년,이메일</small></div>
        <textarea rows="4" placeholder={"2026999,신학생,컴퓨터공학전공,4,2026999@knut.local"} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <button className="primary compact-btn" onClick={importCsv}>CSV 등록</button>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>학번</th><th>이름</th><th>학과</th><th>학년</th><th>이메일</th><th>가입일</th><th>관리</th></tr></thead>
            <tbody>{students.map((s) => <tr key={s.id}><td>{s.student_number}</td><td>{s.name}</td><td>{s.department}</td><td>{s.grade}</td><td>{s.email}</td><td>{formatDate(s.created_at)}</td><td className="actions"><button className="mini-btn" onClick={() => showProgress(s.id)}>현황</button><button className="mini-btn" onClick={() => resetPassword(s.id)}>PW 초기화</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      {progress && (
        <section className="panel">
          <div className="panel-head"><h2>{progress.student.name} 전체 제출 현황</h2><button className="secondary compact-btn" onClick={() => setProgress(null)}>닫기</button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>과제</th><th>상태</th><th>마감</th><th>제출시간</th><th>점수</th><th>수정요청</th></tr></thead>
              <tbody>{progress.assignments.map(({ assignment, latest }) => <tr key={assignment.id}><td>{assignment.title}</td><td><span className={`badge ${latest ? latest.is_late ? "late" : "submitted" : "missing"}`}>{latest ? latest.is_late ? "지각 제출" : "제출 완료" : "미제출"}</span></td><td>{formatDate(assignment.effective_due_at)}</td><td>{latest ? formatDate(latest.submitted_at) : "-"}</td><td>{latest?.score ?? "-"}</td><td>{latest?.revision_requested ? "Y" : "-"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function AdminToolsPage({ showToast }) {
  const [logs, setLogs] = useState([]);
  const load = () => api.get("/admin/audit-logs").then(({ data }) => setLogs(data.logs));
  useEffect(() => { load(); }, []);

  const resetSubmissions = async () => {
    if (!window.confirm("제출물과 제출 댓글, 개별 연장을 초기화합니다. 먼저 백업을 권장합니다. 계속할까요?")) return;
    await api.delete("/admin/system/submissions");
    showToast("제출 데이터가 초기화되었습니다.", "success");
    load();
  };

  return (
    <main className="grid-page">
      <HeroTitle kicker="Admin Tools" title="운영 관리 도구" body="백업, 제출 데이터 초기화, 감사 로그를 관리합니다." />
      <section className="stats-row">
        <a className="stat-card blue" href={adminFileUrl("/system/backup")}><span><Database /></span><small>백업</small><strong>ZIP</strong></a>
        <button className="stat-card orange reset-card" onClick={resetSubmissions}><span><RefreshCcw /></span><small>제출 데이터</small><strong>초기화</strong></button>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>감사 로그</h2><button className="secondary compact-btn" onClick={load}>새로고침</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>시간</th><th>사용자</th><th>행동</th><th>대상</th><th>상세</th><th>IP</th></tr></thead>
            <tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.created_at)}</td><td>{log.name || "-"}</td><td>{log.action}</td><td>{log.target_type} {log.target_id}</td><td>{log.detail}</td><td>{log.ip}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const { user, setUser, loading } = useAuth();
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "info") => setToast({ message, type });
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const router = useMemo(() => ({
    path,
    navigate: (to, options = {}) => {
      if (window.location.pathname === to) return;
      const method = options.replace ? "replaceState" : "pushState";
      window.history[method]({}, "", to);
      setPath(to);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }), [path]);

  const studentAssignmentMatch = path.match(/^\/student\/assignments\/(\d+)$/);
  const adminAssignmentMatch = path.match(/^\/admin\/assignments\/(\d+)$/);

  let page;
  if (path === "/") {
    page = user ? <Navigate to={user.role === "professor" ? "/admin" : "/student"} /> : <LoginPage setUser={setUser} showToast={showToast} />;
  } else if (path === "/register") {
    page = <RegisterPage setUser={setUser} showToast={showToast} />;
  } else if (path === "/student") {
    page = <Protected user={user} loading={loading} role="student"><AppLayout user={user} setUser={setUser}><StudentDashboard user={user} /></AppLayout></Protected>;
  } else if (studentAssignmentMatch) {
    page = <Protected user={user} loading={loading} role="student"><AppLayout user={user} setUser={setUser}><AssignmentDetail id={studentAssignmentMatch[1]} user={user} showToast={showToast} /></AppLayout></Protected>;
  } else if (path === "/admin") {
    page = <Protected user={user} loading={loading} role="professor"><AppLayout user={user} setUser={setUser}><ProfessorDashboard showToast={showToast} /></AppLayout></Protected>;
  } else if (adminAssignmentMatch) {
    page = <Protected user={user} loading={loading} role="professor"><AppLayout user={user} setUser={setUser}><AdminAssignmentStatus id={adminAssignmentMatch[1]} showToast={showToast} /></AppLayout></Protected>;
  } else if (path === "/admin/students") {
    page = <Protected user={user} loading={loading} role="professor"><AppLayout user={user} setUser={setUser}><StudentsPage showToast={showToast} /></AppLayout></Protected>;
  } else if (path === "/admin/tools") {
    page = <Protected user={user} loading={loading} role="professor"><AppLayout user={user} setUser={setUser}><AdminToolsPage showToast={showToast} /></AppLayout></Protected>;
  } else {
    page = <Navigate to="/" />;
  }

  return (
    <RouterContext.Provider value={router}>
      {page}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </RouterContext.Provider>
  );
}
