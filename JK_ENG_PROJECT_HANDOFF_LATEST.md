# JK_ENG / 5second 프로젝트 최신 인계서

업데이트: 2026-08-10 (KST)
기준 저장소: `kfcccpro/5second`
기준 브랜치: `main`
보존 스냅샷: `handoff-snapshot-2026-08-09`

## 1. 새 채팅 시작 규칙
사용자가 새 채팅에서 **`다음 작업 진행`**이라고만 입력하면 추가 확인 질문 없이 이 문서를 최신 인계 기준으로 읽고 아래의 `다음 작업`부터 실제 구현한다.

이 프로젝트에서는 과거 Phase ZIP을 다시 처음부터 만들지 않는다. 현재 GitHub `main`을 유일한 실작업 기준본으로 사용한다.

## 2. 현재 서비스
- 앱: JK English · 답이 보이는 5초 영어 어법
- Firebase project ID: `jk-english-5sec-grammar`
- 학생 URL: `https://jk-english-5sec-grammar.web.app`
- 학생 PIN: `8081`
- 관리자 PIN: `2007`
- 단일 고1 남학생 + 단일 관리자용 폐쇄형 앱
- PC / 태블릿 / 스마트폰 / PWA 다기기 사용
- Firebase Anonymous Authentication + Cloud Firestore 동기화
- IndexedDB 오프라인 임시 저장

## 3. 현재 운영 방식 — 단순 운영 고정
복잡한 자동배포는 사용하지 않는다.

일상 작업:
1. GitHub Desktop `Fetch origin → Pull origin`
2. 문항/UI 수정
3. `Commit → Push origin`
4. 학생 화면 반영이 필요할 때 `DEPLOY_WINDOWS.cmd` 더블클릭
5. `Deploy complete.` 확인 후 종료

중요:
- `firebase init hosting:github` 사용하지 않음
- GitHub Service Account Secret 설정하지 않음
- Firebase 자동배포용 GitHub Actions 사용하지 않음
- `.github/workflows/content-qa.yml`은 코드 검토용 보조 QA일 뿐 Firebase 배포와 연결되지 않음
- Firestore Rules까지 변경할 때만 `DEPLOY_FULL_WINDOWS.cmd`

## 4. 콘텐츠/런타임 구조
원본:
- `content-src/questions/*.json`
- `content-src/meta.json`
- `content-src/question-order.json`

생성물:
- `prototype/app-data.js`
- `prototype/asset-integrity-manifest-maintenance-v1.json`

생성물은 Git에서 추적하지 않으며 `DEPLOY_WINDOWS.cmd` 실행 시 다시 생성한다.

현재 핵심 규모:
- 문항: 4,951
- 개념: 111
- processFirst: 1,140
- requiresInk: 958

최근 전체 QA에서 콘텐츠/런타임 검사 PASS 상태를 확인했다.

## 5. 절대 유지할 학습 철학
앱의 핵심은 이론 선행형이 아니라 **문제 우선·과정 우선 학습**이다.

유지할 루프:
`문제 제시 → 저자식 단계 판단 → 근거 표시 → 과정 채점 → 필요한 교재 복귀 → 확인문제 → 원문 재도전 → 전이 → 다음 Day 회상`

추가 유지 원칙:
- Daily 약 40분: 문법·어법 20분 이상 + 독해 약 20분
- Daily 21/18/1 구조 유지
- 명시적 카운트다운 대신 비불안 유발형 페이싱
- ADHD 학습자 특성을 고려해 판단 단계를 짧고 명확하게 제시
- 2지선다 정답 위치 고정 금지
- `다시 확인`, `다른 기준` 등 의미 없는 선택지 금지
- 오답 시 관련 교재/개념으로 즉시 복귀 후 짧은 확인문제로 재검증
- 확인문제는 같은 개념의 다른 실제 문장을 우선 사용

## 6. 최근 수정 완료 사항
### 콘텐츠
- 2지선다 정답 위치 편향 완화
- 과정 선택지를 의미 있는 대립항으로 정규화
- 의미 없는 fallback 선택지 제거
- 확인문제를 동일 개념의 다른 실제 문장 기반 contextual micro-check로 전환
- 확인문제 prompt에서 정답 자체가 노출되지 않도록 cloze 처리 강화
- 같은 문장을 사실상 그대로 재사용하는 확인문제 제한
- `tools/audit-learning-content.mjs` 추가

### UI / UX
- PC 대화면에서 문제문장과 선택지 가독성 강화
- 읽기 폭 제한
- 태블릿 중간 밀도
- 스마트폰 1열 + 큰 터치 영역
- 선택지/과정판단 focus visibility 강화
- PC·태블릿·스마트폰 시인성을 지속 개선하는 방향 확정

### 배포
- GitHub Actions 자동 Firebase 배포 시도는 철회
- Firebase service-account secret 요구 구조 제거
- Moonma처럼 단순한 `GitHub Desktop + Firebase CLI` 운영 방식으로 복귀
- `DEPLOY_WINDOWS.cmd`가 빌드 + QA + Hosting 배포를 원클릭 처리

## 7. 참고 자료
프로젝트의 주된 문법/어법 출처는 사용자가 업로드한 `0. [개정] 5초 영어어법_OCR(1).pdf`이다.
독해 자료 `2. 5초 독해_OCR(1).pdf`도 프로젝트 참고자료로 존재한다.
첨부 `moonma(1).zip`은 **콘텐츠 출처가 아니라 단순한 GitHub Desktop/Firebase 운영 구조의 참고 모델**로 사용한다.

## 8. 다음 작업 — 최우선
새 채팅에서 `다음 작업 진행` 입력 시 아래를 순서대로 실제 수행한다.

### A. 콘텐츠 품질 전수 개선
고1 남학생 기준으로 4,951문항 전체에서 다음을 점검·수정한다.
- 과정 단계 질문이 자연스럽고 답을 암시하지 않는지
- 2지선다에서 한쪽 선택지만 지나치게 구체적/길어 정답 단서가 되는지
- 확인문제가 암기형·애매형이 아니라 실제 문장 적용형인지
- 정답/선택지가 prompt에 노출되지 않는지
- 같은 문장/같은 family의 과도한 재사용 여부
- 교재 핵심 패턴과 설명 복귀 연결이 실제 학습에 유효한지

### B. 반응형 UX 전수 개선
PC / 태블릿 / 스마트폰에서 다음을 점검·수정한다.
- 문제문장 크기와 행간
- 선택지 글자 크기/높이
- 과정판단 카드 밀도
- 긴 영어문장 줄바꿈
- 344px~1920px 가로폭 overflow
- safe-area / 100dvh / 44px 이상 터치 타깃
- 휴대폰 가로모드
- iPad/Galaxy/PC에서 동일한 시인성
- 화면당 정보량을 줄이고 직접 클릭 흐름 유지

### C. 실제 화면 검증
수정 후 `npm run check` 또는 `DEPLOY_WINDOWS.cmd` 내부 QA를 통과시킨 뒤, 필요할 때 Firebase Hosting에 배포하고 실제 URL에서 확인한다.

## 9. 작업 방식
사용자는 상세 중간 산출물/진행 로그를 매번 검토하지 않는다.
- 중간 진행 보고는 짧게
- 프론트엔드 화면은 사용자가 요청할 때 중심적으로 제시
- 반복적인 데이터 구축/코드 반영은 조용히 진행
- 구조 변경, 전수 대조, 중대한 오류가 있을 때만 별도로 알림

## 10. 새 채팅용 한 줄 실행 지시
**`다음 작업 진행` = 이 인계서를 읽고 GitHub `kfcccpro/5second`의 `main`을 기준으로 A(콘텐츠 품질 전수 개선)부터 확인 질문 없이 실제 구현한다.**
