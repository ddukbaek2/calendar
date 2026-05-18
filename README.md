# Calendar

월간 캘린더 웹서비스입니다. Express 와 SQLite (better-sqlite3) 로 동작하며, 프런트는 의존성 없는 바닐라 JS 로 구성되어 있습니다.

## 주요 기능

- 월간 그리드 뷰, 이전/다음 달 이동, 오늘로 이동
- 일정 추가 / 수정 / 삭제
- 종일 일정과 시간 지정 일정 (시작/종료 시간)
- 그룹 (이름 + 색상) 관리 및 그룹별 일정 색상 표시
- 그룹 단위 필터링
- 주 시작 요일 (일요일 / 월요일) 전환
- SQLite WAL 모드 기반 영속 저장

## 요구 사항

- Node.js 20 이상
- npm
- (선택) Docker / Docker Compose

## 설치 및 실행 (로컬)

```bash
npm install
npm start
```

기본 포트는 `3000` 이며, 브라우저에서 `http://localhost:3000` 으로 접속합니다.

데이터베이스 파일 `data.db` 는 기본적으로 프로젝트 루트에 생성됩니다.

### 환경 변수

| 이름       | 기본값          | 설명                              |
|------------|-----------------|-----------------------------------|
| `PORT`     | `3000`          | HTTP 서버 포트                    |
| `DATA_DIR` | 프로젝트 루트   | `data.db` 가 저장되는 디렉터리    |

예시:

```bash
PORT=8080 DATA_DIR=./var npm start
```

PowerShell 의 경우:

```powershell
$env:PORT = "8080"; $env:DATA_DIR = ".\var"; npm start
```

## Docker 로 실행

### Docker Compose

```bash
docker compose up -d
```

- 호스트 포트는 `CALENDAR_PORT` 환경 변수로 변경할 수 있습니다 (기본 `3000`).
- 데이터는 `calendar-data` 라는 도커 볼륨에 영속화됩니다.

중지:

```bash
docker compose down
```

### Docker 단독 실행

```bash
docker build -t calendar:latest .
docker run -d --name calendar -p 3000:3000 -v calendar-data:/data calendar:latest
```

## 사용법

1. 상단 좌측의 `«` / `»` 버튼으로 달을 이동하고, `오늘` 버튼으로 이번 달로 돌아옵니다.
2. 달력의 빈 날짜 칸을 클릭하면 해당 날짜에 새 일정을 추가합니다.
3. 기존 일정을 클릭하면 수정 다이얼로그가 열리며, 다이얼로그에서 `삭제` 로 일정을 제거할 수 있습니다.
4. `종일` 체크를 끄면 시작/종료 시간을 지정할 수 있습니다 (24시간 `HH:MM` 형식).
5. 상단의 `그룹` 버튼으로 그룹을 추가/수정/삭제합니다. 그룹을 삭제하면 해당 그룹의 일정은 "그룹 없음" 상태로 남습니다.
6. 필터 바에서 그룹을 토글하여 해당 그룹의 일정만 보거나 숨길 수 있습니다.
7. 우측 상단의 `주 시작: 일` / `주 시작: 월` 버튼으로 주 시작 요일을 전환합니다.

## REST API

응답 / 요청 본문은 모두 JSON 입니다.

### 일정 (Events)

| 메서드 | 경로                          | 설명                                     |
|--------|-------------------------------|------------------------------------------|
| GET    | `/events`                     | 전체 일정 조회                           |
| GET    | `/events?year=YYYY&month=M`   | 특정 연/월의 일정 조회 (`month` 은 1~12) |
| POST   | `/events`                     | 일정 생성                                |
| PUT    | `/events/:id`                 | 일정 수정                                |
| DELETE | `/events/:id`                 | 일정 삭제                                |

요청 본문 필드:

- `title` *(string, 1~200자)*
- `date` *(string, `YYYY-MM-DD`)*
- `all_day` *(boolean)*
- `start_time` *(string, `HH:MM`, `all_day` 가 false 일 때 필수)*
- `end_time` *(string, `HH:MM`, `start_time` 이상이어야 함)*
- `group_id` *(integer | null, 존재하는 그룹 id 여야 함)*

예시 — 종일 일정 생성:

```bash
curl -X POST http://localhost:3000/events \
    -H "Content-Type: application/json" \
    -d '{"title":"휴가","date":"2026-05-20","all_day":true,"group_id":null}'
```

예시 — 시간 지정 일정 생성:

```bash
curl -X POST http://localhost:3000/events \
    -H "Content-Type: application/json" \
    -d '{"title":"회의","date":"2026-05-20","all_day":false,"start_time":"10:00","end_time":"11:00","group_id":1}'
```

### 그룹 (Groups)

| 메서드 | 경로            | 설명           |
|--------|-----------------|----------------|
| GET    | `/groups`       | 전체 그룹 조회 |
| POST   | `/groups`       | 그룹 생성      |
| PUT    | `/groups/:id`   | 그룹 수정      |
| DELETE | `/groups/:id`   | 그룹 삭제      |

요청 본문 필드:

- `name` *(string, 1~50자, 고유)*
- `color` *(string, `#RGB` 또는 `#RRGGBB`)*

그룹을 삭제하면 해당 그룹을 참조하던 일정의 `group_id` 는 `NULL` 로 갱신됩니다.

## 디렉터리 구조

```
.
├── server.js              # Express 서버 / REST API / SQLite
├── public/                # 정적 프런트엔드 (HTML/CSS/JS)
│   ├── index.html
│   ├── main.js
│   └── style.css
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 라이선스

`LICENSE` 파일을 참고하세요.
