[English README](./docs/README.en.md)

# notion-worklog-mcp

`notion-worklog-mcp`는 Git 작업 내역을 바탕으로 Notion에 작업내용 문서를 쌓을 수 있게 돕는 로컬 MCP 서버입니다.

이 패키지는 두 가지 흐름을 기준으로 만들어졌습니다.

1. 지금 진행 중인 작업 문서화
2. 과거 날짜 또는 특정 커밋 기준 작업 복원 문서화

패키지 자체가 문장을 생성하지는 않습니다. 대신 아래를 제공합니다.

- Git 컨텍스트 수집
- 내장 템플릿 제공
- Notion 대상 검증
- 날짜별 Notion 페이지 append

최종 Markdown은 Codex, Cursor, Claude 같은 MCP 클라이언트가 작성합니다.

## 이 패키지가 하는 일

기본 동작은 다음과 같습니다.

- 현재 Git 저장소를 기준으로 작업 내용을 수집합니다.
- 기본적으로 `Work Documentation Calendar`라는 Notion 데이터베이스를 생성하거나 재사용합니다.
- 날짜별로 하루 1페이지를 사용합니다.
- 검토가 끝난 Markdown을 해당 날짜 페이지 하단에 누적합니다.

지원 범위:

- 현재 변경사항 문서화
- 과거 날짜 기준 문서화
- 특정 커밋 기준 문서화

## 빠른 시작

### 1. 패키지 설치

프로젝트에 로컬 설치:

```bash
npm install -D notion-worklog-mcp
```

MCP 설정에서는 `npx`로 바로 실행할 수도 있습니다.

```bash
npx --yes notion-worklog-mcp
```

### 2. Notion Integration 생성

1. `https://www.notion.so/profile/integrations`로 이동합니다.
2. `New integration`을 누릅니다.
3. 이름을 예: `Worklog MCP`로 정합니다.
4. 아래 capability를 최소한 켭니다.
   - `read_content`
   - `update_content`
5. Internal Integration Token을 복사합니다.

### 3. 부모 페이지 준비

1. 작업 문서용 데이터베이스를 둘 일반 Notion 페이지를 하나 준비합니다.
2. 페이지 우측 상단 메뉴를 엽니다.
3. `Connections` 또는 `Add connections`를 누릅니다.
4. 방금 만든 integration을 연결합니다.

이 페이지가 `NOTION_PARENT_PAGE_ID` 대상입니다.

아래 둘 다 사용할 수 있습니다.

- 페이지 URL
- raw page ID

### 4. `.env` 설정

작업을 문서화할 저장소 루트에 `.env.local`을 만듭니다.

```bash
NOTION_API_KEY=secret_xxx
NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATA_SOURCE_ID=
WORKLOG_DATABASE_TITLE=Work Documentation Calendar
WORKLOG_TIME_ZONE=Asia/Seoul
```

필수 값:

- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`

선택 값:

- `NOTION_DATA_SOURCE_ID`
- `WORKLOG_DATABASE_TITLE`
- `WORKLOG_TIME_ZONE`
- `WORKLOG_TEMPLATE_DIR`

`NOTION_DATA_SOURCE_ID`를 비워두면 서버는 다음 규칙으로 동작합니다.

- 부모 페이지 아래 같은 이름의 데이터베이스가 정확히 1개면 재사용
- 없으면 첫 append 때 자동 생성
- 2개 이상이면 오기록 방지를 위해 에러 반환

### 5. doctor 실행

로컬 설치한 경우:

```bash
npx notion-worklog-mcp-doctor
```

설치 없이 바로 확인하려면:

```bash
npx --yes --package notion-worklog-mcp notion-worklog-mcp-doctor
```

정상이라면 아래를 확인할 수 있어야 합니다.

- 현재 Git 브랜치와 merge-base
- Notion 환경변수 감지 여부
- 부모 페이지 접근 가능 여부
- worklog 데이터베이스 존재 여부

## MCP 서버 연결

### Codex

가장 간단한 연결 방법:

```bash
codex mcp add worklog -- npx --yes notion-worklog-mcp
```

JSON 스니펫이 필요하면 [examples/codex.mcp.json](./examples/codex.mcp.json)을 참고하세요.

### Cursor

[examples/cursor.mcp.json](./examples/cursor.mcp.json)을 사용하면 됩니다.

### Claude Desktop

[examples/claude_desktop_config.json](./examples/claude_desktop_config.json)을 사용하면 됩니다.

## 현재 작업 문서화

이 모드는 아래 상황에 적합합니다.

- working tree 변경사항 정리
- staged 변경사항 정리
- merge-base 이후 커밋 요약
- 아직 남은 후속 작업 정리

권장 흐름:

1. `validate_notion_target`
2. `collect_current_work_context`
3. `load_worklog_template` with `mode: "current"`
4. assistant가 Markdown 초안 작성
5. 초안 검토
6. `append_worklog_entry`

예시 프롬프트:

```text
지금까지 한 작업을 문서화해줘. current 템플릿을 사용하고, 먼저 초안을 보여준 뒤 승인받고 Notion에 append해줘.
```

## 과거 날짜 기준 문서화

특정 날짜의 작업을 복원해서 문서화할 때 사용합니다.

권장 흐름:

1. `validate_notion_target` with `entryDate`
2. `collect_historical_work_context` with `date: "YYYY-MM-DD"`
3. `load_worklog_template` with `mode: "historical"`
4. assistant가 Markdown 초안 작성
5. 초안 검토
6. `append_worklog_entry` with the same `entryDate`

예시 프롬프트:

```text
2026-02-11 작업 내용을 Git 기준으로 문서화해줘. historical 템플릿을 사용하고 Remaining Work 섹션은 넣지 말아줘.
```

## 특정 커밋 기준 문서화

특정 커밋 1개를 중심으로 작업 내용을 복원하고 싶을 때 사용합니다.

권장 흐름:

1. `validate_notion_target`
2. `collect_historical_work_context` with `commit: "abc1234"`
3. `load_worklog_template` with `mode: "historical"`
4. assistant가 Markdown 초안 작성
5. 초안 검토
6. `append_worklog_entry`

예시 프롬프트:

```text
커밋 92aaaf9를 historical work item으로 문서화해줘. 무엇이 바뀌었는지와 왜 그런 변경이 있었는지 중심으로 작성해줘.
```

## 내장 템플릿

패키지에는 두 가지 템플릿이 포함됩니다.

- [templates/current.md](./templates/current.md)
- [templates/historical.md](./templates/historical.md)

규칙:

- `current`는 `Remaining Work` 섹션 포함
- `historical`은 `Remaining Work` 섹션 제외

커스텀 템플릿을 쓰고 싶다면:

```bash
WORKLOG_TEMPLATE_DIR=/absolute/or/relative/path/to/templates
```

이 디렉터리에는 아래 두 파일이 있어야 합니다.

- `current.md`
- `historical.md`

## Notion 저장 구조

이 패키지는 아래 구조를 사용합니다.

- 페이지 제목: `YYYY-MM-DD`
- `Date` 속성: 같은 날짜 문자열
- 날짜별 1페이지

append 규칙:

- 날짜 페이지가 있으면 기존 페이지에 append
- 날짜 페이지가 없으면 새로 생성
- 데이터베이스가 없으면 첫 append에서 자동 생성
- 같은 날짜 페이지가 2개 이상이면 append 차단

## Tool 설명

### `validate_notion_target`

확인 항목:

- 자격 증명
- 부모 페이지 접근
- 데이터베이스/데이터 소스 해석
- 대상 날짜 페이지 접근 가능 여부

선택 입력:

- `entryDate`

### `collect_current_work_context`

반환 항목:

- 브랜치와 merge-base 정보
- merge-base 이후 커밋
- staged / unstaged 파일
- diff stat / excerpt

### `collect_historical_work_context`

정확히 하나만 받습니다.

- `date`
- `commit`

반환 항목:

- 기준 날짜
- 관련 커밋
- 변경 파일
- diff stat
- diff excerpt

### `load_worklog_template`

입력:

- `mode: "current" | "historical"`

### `append_worklog_entry`

입력:

- `heading`
- `markdown`
- optional `entryDate`
- optional `previewHash`

## 트러블슈팅

### `NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing.`

확인할 것:

- 작업 대상 저장소 루트에 `.env.local`이 있는지
- 키 이름이 정확한지
- MCP 클라이언트가 의도한 디렉터리에서 서버를 실행하는지

### `NOTION_DATA_SOURCE_ID points to a data source that could not be found.`

확인할 것:

- 데이터베이스가 아직 존재하는지
- integration 접근 권한이 유지되는지
- 설정한 ID가 같은 부모 페이지 아래 데이터 소스인지

### `Found more than one matching worklog data source under the parent page.`

해결:

- `NOTION_DATA_SOURCE_ID`를 명시적으로 설정

### `No commits were found on YYYY-MM-DD.`

확인할 것:

- 날짜가 맞는지
- 해당 날짜에 실제 커밋이 있는지
- `WORKLOG_TIME_ZONE`이 기대한 시간대와 일치하는지

### `previewHash does not match the current payload.`

초안 검토 후 내용이 바뀐 상태입니다. 새 preview hash로 다시 시도해야 합니다.

## FAQ

### 이 패키지가 최종 문장까지 써주나요?

아니요. Git 컨텍스트, 템플릿, Notion append 기능만 제공합니다. 실제 문장은 assistant가 작성합니다.

### 일반 Notion MCP 서버 대신 왜 이걸 쓰나요?

일반 Notion 도구는 보통 아래를 한 번에 제공하지 않습니다.

- Git 기반 현재 작업 요약
- 날짜/커밋 기준 과거 복원
- 내장 worklog 템플릿
- 날짜별 페이지 생성 및 append 규칙

### assistant 없이도 쓸 수 있나요?

어느 정도는 가능합니다. `doctor`와 core 모듈은 스크립트에서도 사용할 수 있습니다. 다만 주 사용 방식은 MCP입니다.

### historical 모드에 Remaining Work가 포함되나요?

아니요. historical 모드는 아카이브 용도라 의도적으로 제외했습니다.

### 데이터베이스 제목을 바꿀 수 있나요?

네. `WORKLOG_DATABASE_TITLE`을 설정하면 됩니다.
