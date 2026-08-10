# JK_ENG / 5second 프로젝트 최신 인계서

업데이트: 2026-08-10 (KST)
기준 저장소: `kfcccpro/5second`
기준 브랜치: `main`
보존 스냅샷: `handoff-snapshot-2026-08-09`

## 1. 새 채팅 시작 규칙
사용자가 새 채팅에서 **`다음 작업 진행`**이라고만 입력하면 추가 확인 질문 없이 이 문서를 최신 인계 기준으로 읽고 아래의 `다음 작업`부터 실제 구현한다.

과거 Phase ZIP을 처음부터 다시 만들지 않는다. 현재 GitHub `main`을 유일한 실작업 기준본으로 사용한다.

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

## 3. 배포 구조 — 자동배포 전환
정상 운영 목표는 다음과 같다.

`GitHub main push → GitHub Actions QA → QA PASS → Firebase Hosting live 자동 배포`

구현 완료:
- `.github/workflows/firebase-live.yml` 추가
- `main` push 및 수동 workflow_dispatch에 반응
- `npm run check`가 먼저 실행되어 콘텐츠/런타임/자산 검사를 통과한 경우에만 Firebase Hosting `live` 채널 배포
- Firebase project는 `jk-english-5sec-grammar`로 고정
- 동시 배포는 concurrency로 한 번만 실행

첫 실제 GitHub Actions 실행에서 QA는 정상 PASS했다.
- 문항 4,951 PASS
- 개념 111
- processFirst 1,140
- processStep 14,856
- contextual check 4,951 / legacy 0
- 2지선다 정답 위치 2,467 / 2,478
- runtime 9 checks PASS
- asset manifest 생성 PASS

현재 자동배포를 막고 있는 유일한 항목:
- GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT_JK_ENGLISH_5SEC_GRAMMAR` 미생성
- 실제 오류: `Input required and not supplied: firebaseServiceAccount`

이 인증은 사용자의 Firebase/GitHub 계정 권한 승인 때문에 최초 1회만 사용자 환경에서 수행해야 한다.

이를 최대한 단순화하기 위해 루트에 `SETUP_AUTO_DEPLOY_WINDOWS.cmd`를 추가했다.
- 최신 main Pull 후 **한 번만** 실행
- Firebase 로그인 상태 확인
- Firebase project `jk-english-5sec-grammar` 확인
- `firebase init hosting:github`를 실행해 Firebase service account와 GitHub Actions secret 생성
- Firebase CLI가 만드는 기본 PR/merge workflow는 제거하고 프로젝트의 `.github/workflows/firebase-live.yml`만 유지
- `firebase.json`과 `.firebaserc`는 저장소 기준으로 복구

이 1회 연결이 끝난 뒤에는 정상 업데이트에 `DEPLOY_WINDOWS.cmd`가 필요 없다.
`DEPLOY_WINDOWS.cmd`는 비상 수동 배포용 fallback으로만 보존한다.

## 4. 콘텐츠/런타임 구조
원본:
- `content-src/questions/*.json`
- `content-src/meta.json`
- `content-src/question-order.json`

생성물:
- `prototype/app-data.js`
- `prototype/asset-integrity-manifest-maintenance-v1.json`

생성물은 Git에서 추적하지 않고 CI/배포 시 다시 생성한다.

현재 핵심 규모:
- 문항: 4,951
- 개념: 111
- processFirst: 1,140
- requiresInk: 958

## 5. 절대 유지할 학습 철학
앱은 이론 선행형이 아니라 **문제 우선·과정 우선 학습**이다.

유지할 루프:
`문제 제시 → 저자식 단계 판단 → 근거 표시 → 과정 채점 → 필요한 교재 복귀 → 확인문제 → 원문 재도전 → 전이 → 다음 Day 회상`

추가 유지 원칙:
- Daily 약 40분: 문법·어법 20분 이상 + 독해 약 20분
- Daily 21/18/1 구조 유지
- 명시적 카운트다운 대신 비불안 유발형 페이싱
- ADHD 학습자 특성을 고려해 풀이 단계를 짧고 명확하게 제시
- 2지선다 정답 위치 고정 금지
- `다시 확인`, `다른 기준` 등 UI/운영 문구를 학습 선택지로 사용하지 않음
- 오답 시 관련 교재/개념으로 즉시 복귀 후 짧은 확인문제로 재검증
- 확인문제는 같은 개념의 다른 실제 문장을 우선 사용

## 6. 최신 콘텐츠/UX 수정
### 콘텐츠 안전장치
- `tools/validate-content.mjs`에서 `다시 확인`, `다른 기준`, `판단 단계 시작`, `정답 보기`, `다음`, `교재 보기` 등 UI 제어 문구가 최종 선택지·과정 선택지·확인문제 선택지에 들어가면 배포 전 FAIL
- 브라우저 런타임에도 오래된 캐시 데이터에서 이런 선택지를 제거하는 2차 안전장치
- 유효한 대립항을 만들 수 없는 오래된 데이터는 가짜 선택지를 보여주지 않고 안전하게 우회
- `audit-learning-content.mjs`와 이중 검사

### 고1 학습자 문구
- `판단 단계` → `풀이 순서`
- `판단 단계 시작` → `한 단계씩 다시 풀기`
- `답 선택 전 STEP 1 / 3` → `1단계 / 3단계`
- 시스템 용어 대신 즉시 행동할 수 있는 학생용 문장 사용

### PC / 태블릿 가로 UX
`prototype/maintenance-v1.2-landscape.css` 적용.
핵심 원칙: **LEFT = 이미 본 것 / RIGHT = 지금 할 것**
- 문제 풀이: 왼쪽 문제 문장·단서 / 오른쪽 현재 풀이 단계·답 선택
- 오답 복구: 왼쪽 교재 근거·핵심 규칙 / 오른쪽 재판단·확인문제
- PC 및 iPad/Galaxy 가로모드에서 세로 스크롤 의존을 줄이고 좌→우 시선 흐름 강화
- 스마트폰/세로모드는 1열 유지

### 캐시
- Service Worker `maintenance-v1.2.0`
- 새 landscape CSS를 critical asset integrity 대상에 포함

## 7. 주요 최신 커밋
- `fe2a584` Add left-to-right landscape study layout
- `d2c4a99` Polish learner copy and guard process choices
- `86e66ac` Block UI labels from learning choices
- `8c96d82` Bump learner cache for UX/content fixes
- `f77fc21` Include landscape UX in integrity manifest
- `79da50c` Add automatic Firebase live deployment on main push
- `707cc7e` Add one-time Firebase auto-deploy setup helper

## 8. 다음 작업 — 최우선
자동배포 인증을 최초 1회 완료한다.

사용자 작업은 다음 하나만 필요하다.
1. GitHub Desktop에서 `Fetch origin → Pull origin`
2. 루트의 `SETUP_AUTO_DEPLOY_WINDOWS.cmd` 더블클릭
3. 화면 지시에 따라 Firebase/GitHub 권한 승인 및 repo `kfcccpro/5second` 선택
4. 완료 메시지가 나오면 ChatGPT에 `설정 완료`라고 전달

그 다음 ChatGPT가 확인 질문 없이:
- GitHub Actions 자동배포를 재실행/검증
- QA PASS + Firebase Hosting live deploy 성공 확인
- 실제 학생 URL의 최신 UI 반영 여부 확인
- 이후부터는 `main` 수정만으로 자동배포되는 운영 상태로 고정

자동배포가 완성되면 일상 작업에서 GitHub Desktop Pull 및 `DEPLOY_WINDOWS.cmd`를 학생 사이트 반영 목적으로 요구하지 않는다.

## 9. 자동배포 완료 후 후속 작업
- 실제 Firebase URL에서 학생 PIN 8081 진입 검증
- process-first 문항의 무의미 선택지 0 확인
- `sought (explaining / to explain)`류 문항의 의미 있는 선택지 확인
- PC 1366/1440/1920 및 iPad/Galaxy 가로 좌→우 흐름 검증
- 오답 복구에서 왼쪽 교재 이미지와 오른쪽 재판단 동시 시인성 검증
- 이후 4,951문항 전체 자연스러움/선택지 길이 단서/확인문제 품질 개선 지속

## 10. 작업 방식
- 중간 진행 보고는 짧게
- 프론트엔드 화면은 사용자가 요청할 때 중심적으로 제시
- 반복적인 데이터/코드 작업은 조용히 진행
- 구조 변경, 전수 대조, 중대한 오류가 있을 때만 별도 보고

## 11. 새 채팅용 한 줄 실행 지시
**`다음 작업 진행` = 이 인계서를 읽고 GitHub `kfcccpro/5second` main을 기준으로 자동배포 인증 상태부터 확인하고, 미완료면 `SETUP_AUTO_DEPLOY_WINDOWS.cmd` 1회 연결을 완료하도록 안내한 뒤 GitHub Actions → Firebase Hosting live 자동배포를 실제 검증하고 다음 UX/콘텐츠 작업을 이어간다.**
