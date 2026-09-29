# 국립한국교통대학교 과제제출시스템

대학교 수업에서 사용할 수 있는 로컬 기반 과제 제출 및 관리 웹 시스템입니다. 학생은 압축파일을 제출하고 선택적으로 `README.txt`를 함께 첨부할 수 있으며, 교수는 과제 생성, 제출 현황 확인, 피드백/점수 관리, 개별/일괄 다운로드, CSV 다운로드, 백업과 감사 로그를 사용할 수 있습니다.

## 사용 기술

- Frontend: React, Vite, Axios
- Backend: Node.js, Express
- Database: SQLite
- File Storage: 로컬 파일 시스템
- Auth: JWT httpOnly cookie, bcrypt password hash

## 폴더 구조

```text
F:\vibecoding
├─ client/
├─ server/
├─ data/
│  ├─ database/
│  └─ submissions/
├─ .env.example
├─ package.json
├─ start.bat
└─ README.md
```

## 설치

```bash
cd /d F:\vibecoding
npm run install:all
```

## 실행

개발 실행:

```bash
npm run dev
```

또는 Windows에서 `start.bat`을 실행합니다.

웹 접속 포트는 `228`입니다. 같은 네트워크의 다른 기기에서는 실행 로그에 표시되는 내부망 주소를 사용합니다.

예:

```text
http://192.168.0.10:228
```

운영형 단일 서버 실행:

```bash
npm start
```

## GitHub Pages + Firebase 배포

이 저장소는 GitHub Pages 배포 워크플로우를 포함합니다.

배포 주소:

```text
https://skyhy0228.github.io/vibe_workcheck/
```

GitHub Pages 배포본은 Express/SQLite 서버가 아니라 Firebase를 사용합니다.

- Authentication: 로그인 계정
- Firestore: 사용자, 과제, 제출 이력, 댓글, 공지
- Storage: 제출 파일과 README.txt

Firebase Console에서 아래 기능을 먼저 활성화해야 합니다.

```text
Authentication > Sign-in method > Email/Password
Firestore Database
Storage
```

GitHub 저장소에서 Pages를 먼저 켜야 Actions 배포가 성공합니다.

```text
GitHub 저장소 > Settings > Pages
Source: GitHub Actions
```

초기 관리자, 학생, 기본 과제를 Firebase에 넣으려면 로컬에서 실행합니다.

```bash
npm run firebase:seed
```

Firestore/Storage 보안 규칙은 Firebase CLI 로그인 후 아래 명령으로 배포합니다.

```bash
npm run firebase:deploy-rules
```

서비스 계정 JSON 파일은 저장소 루트에 둘 수 있지만 GitHub에 올라가지 않도록 `.gitignore`에 포함되어 있습니다.

Firebase 배포본에서도 화면 로그인은 아래와 같이 사용합니다.

```text
교수: admin / admin
학생: 2026001 / 2026001
```

Firebase Authentication은 비밀번호 최소 6자 제한이 있어 내부 관리자 계정은 6자 이상 비밀번호로 생성하고, 화면에서는 `admin / admin` 입력을 유지하도록 처리했습니다.

## 기본 계정

교수:

```text
admin / admin
```

개발용 학생:

```text
2026001 / 2026001
2026002 / 2026002
2026003 / 2026003
2126055 / 2126055
```

학생은 회원가입도 가능합니다.

## 환경 변수

`.env.example`을 참고합니다.

```text
HOST=0.0.0.0
CLIENT_PORT=228
SERVER_PORT=3001
JWT_SECRET=change-this-local-secret
ADMIN_ID=admin
ADMIN_PASSWORD=admin
ADMIN_NAME=관리자
MAX_UPLOAD_MB=200
```

개발 모드에서는 Vite가 `0.0.0.0:228`에서 실행되고, API 서버는 `SERVER_PORT`에서 실행됩니다. `/api` 요청은 Vite 프록시가 API 서버로 전달합니다.

## DB 위치

```text
F:\vibecoding\data\database\app.sqlite
```

주요 테이블:

- `users`
- `assignments`
- `submissions`
- `assignment_extensions`
- `notices`
- `assignment_qna`
- `submission_comments`
- `audit_logs`

`submissions`에는 압축 제출 파일 정보와 선택 첨부 `README.txt` 파일 정보가 함께 저장됩니다.

## 제출 파일 저장 위치

```text
F:\vibecoding\data\submissions\
```

저장 예:

```text
data\submissions\assignment_1\2126055\20260922_190501_v1_2126055_homework.zip
data\submissions\assignment_1\2126055\20260922_190501_v1_2126055_README.txt
```

압축파일은 필수이며, `README.txt`는 선택 제출입니다. README에는 압축파일 안의 파일 실행 방법, 실행 전 확인 사항, 필요한 환경 정보를 적는 용도로 사용합니다.

## 구현 기능

- 학생 회원가입, 로그인, 로그아웃
- 교수/학생 권한 분리
- 교수 과제 생성, 수정, 삭제
- 교수 과제별 제출 현황, 미제출자 확인
- 교수 제출률 표시, 최근 제출 내역
- 교수 개별 파일 다운로드, 전체 최종 제출본 ZIP 다운로드
- 교수 제출 현황 CSV 다운로드
- 교수 공지사항 작성/삭제
- 교수 제출물 점수, 공개 피드백, 비공개 메모, 수정 요청
- 교수 학생별 전체 제출 현황 확인
- 교수 학생 CSV 일괄 등록
- 교수 학생 비밀번호 학번 기준 초기화
- 교수 학생별 개별 마감 연장
- 교수 감사 로그 확인
- 교수 DB/제출 파일 ZIP 백업
- 교수 제출 데이터 초기화
- 학생 과제 목록, 상세 조회
- 학생 압축파일 제출 및 재제출
- 선택 `README.txt` 첨부
- `README.txt` 미리보기 및 템플릿 다운로드
- 과제별 Q&A
- 제출물별 댓글/피드백 확인
- 파일명 규칙 경고
- 학생 제출 이력 및 최종 제출본 표시
- 서버 기준 마감 처리와 지각 제출 기록
- 확장자, 파일 크기, 빈 파일, 파일명 검증
- path traversal 방지용 파일명 sanitize
- 비밀번호 bcrypt hash 저장

## 초기화

DB와 제출 파일을 초기화하려면 서버를 종료한 뒤 아래 항목을 삭제하고 다시 실행합니다.

```text
F:\vibecoding\data\database\app.sqlite
F:\vibecoding\data\submissions\
```

서버 시작 시 DB와 seed 데이터가 자동 생성됩니다.

## Firebase 이전 시 변경 지점

현재 구조는 이전을 고려해 영역을 분리했습니다.

- 인증: `server/src/middleware/auth.js`, `server/src/routes/authRoutes.js`
- DB: `server/src/db.js`, `server/src/services/*`
- 파일 저장: `server/src/services/submissionService.js`
- API: `server/src/routes/*`
- UI: `client/src`

향후 이전 시 SQLite는 Firestore, 로컬 파일 시스템은 Firebase Storage, Express 인증은 Firebase Authentication 또는 Functions 기반 검증으로 교체하면 됩니다.
