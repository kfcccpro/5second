# JK_ENG / 5second 프로젝트 최신 인계서

업데이트: 2026-08-11 (KST)
기준 저장소: `kfcccpro/5second`
기준 브랜치: `main`
보존 스냅샷: `handoff-snapshot-2026-08-09`

## 1. 새 채팅 시작 규칙
사용자가 새 채팅에서 **`다음 작업 진행`**이라고만 입력하면 추가 확인 질문 없이 이 문서를 최신 인계 기준으로 읽고 아래의 다음 미완료 작업부터 실제 구현한다.

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

## 3. 배포 구조 — 자동배포 운영 완료
정상 운영은 다음으로 고정한다.

`GitHub main push → GitHub Actions QA → QA PASS → Firebase Hosting live 자동 배포`

완료 상태:
- `.github/workflows/firebase-live.yml` 운영
- Firebase service account 생성 완료
- GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT_JK_ENGLISH_5SEC_GRAMMAR` 연결 완료
- `main` push 시 자동 실행
- `npm run check` PASS일 때만 live 배포
- Firebase project `jk-english-5sec-grammar` 고정
- concurrency로 중복 배포 방지
- 실제 자동배포 재실행에서 **Firebase Hosting production deploy SUCCESS** 확인
- 실제 배포 주소 `https://jk-english-5sec-grammar.web.app/`

검증된 자동배포 결과:
- 문항 4,951 PASS
- 개념 111
- processFirst 1,140
- processStep 14,856
- contextual check 4,951 / legacy 0
- 2지선다 정답 위치 2,467 / 2,478
- runtime 9 checks PASS
- asset manifest 생성 PASS
- Firebase Hosting live deploy SUCCESS

이제 정상 업데이트에서는 사용자가 `DEPLOY_WINDOWS.cmd`를 실행하지 않는다.
`DEPLOY_WINDOWS.cmd`는 비상 수동 배포용 fallback으로만 보존한다.

## 4. 자동 QA 증거 보존
`.github/workflows/firebase-live.yml`에 learner content audit 업로드 단계를 추가했다.

매 `main` 자동배포 시:
1. `npm run check`
2. `.qa/learner-content-audit.json` 생성
3. GitHub Actions artifact `learner-content-audit-<run_number>`로 14일 보존
4. QA가 성공하면 Firebase Hosting live 배포

목적:
- 4,951문항 전수 감사 결과를 CI 밖에서도 후속 분석 가능하게 보존
- 남은 경고를 유형별로 줄이는 작업의 기준 증거로 사용
- 배포 성공 여부와 콘텐츠 품질 감사 결과를 같은 run에서 추적

## 5. 콘텐츠/런타임 구조
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

## 6. 절대 유지할 학습 철학
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

## 7. 최신 콘텐츠/UX 수정
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
- landscape CSS를 critical asset integrity 대상에 포함

## 8. 주요 최신 커밋
- `fe2a584` Add left-to-right landscape study layout
- `d2c4a99` Polish learner copy and guard process choices
- `86e66ac` Block UI labels from learning choices
- `8c96d82` Bump learner cache for UX/content fixes
- `f77fc21` Include landscape UX in integrity manifest
- `79da50c` Add automatic Firebase live deployment on main push
- `707cc7e` Add one-time Firebase auto-deploy setup helper
- `0b0a532` Publish learner content audit from automatic deploy

## 9. 다음 작업 — 최우선
자동배포는 완료되었다. 다음 미완료 작업은 **실제 화면 UX 확인 + 4,951문항 품질 경고 축소**이다.

순서:
1. 실제 Firebase URL에서 학생 PIN 8081 진입 확인
2. process-first 문항에서 무의미 선택지 0 확인
3. `sought (explaining / to explain)`류 문항에서 자연스러운 두 선택지 확인
4. PC 1366/1440/1920에서 LEFT→RIGHT 흐름 확인
5. iPad/Galaxy 가로에서 LEFT 근거 → RIGHT 현재 행동 확인
6. 오답 복구에서 왼쪽 교재 이미지와 오른쪽 재판단 동시 시인성 확인
7. 자동배포 artifact의 learner-content-audit를 기준으로 남은 경고를 유형별 분석
8. 선택지 길이 단서, 같은 family 재사용, 반복 prompt, 추상적 확인문제 등을 우선순위화하여 수정
9. 수정은 `main`에 반영하고 자동 QA/자동배포로 검증

현재 learner content audit는 critical 0으로 PASS하지만 warning이 남아 있으므로, warning을 단순히 없애기보다 실제 학습 품질에 영향이 큰 항목부터 줄인다.

## 10. 작업 방식
- 중간 진행 보고는 짧게
- 프론트엔드 화면은 사용자가 요청할 때 중심적으로 제시
- 반복적인 데이터/코드 작업은 조용히 진행
- 구조 변경, 전수 대조, 중대한 오류가 있을 때만 별도 보고
- 정상 배포에 사용자 수동 명령 실행을 다시 요구하지 않는다

## 11. 새 채팅용 한 줄 실행 지시
**`다음 작업 진행` = 이 인계서를 읽고 GitHub `kfcccpro/5second` main을 기준으로 자동배포 성공 상태를 유지하면서, 실제 Firebase 화면 UX 검증과 learner-content-audit 기반 4,951문항 품질 개선을 확인 질문 없이 이어간다.**
