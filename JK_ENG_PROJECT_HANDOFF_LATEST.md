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
- 과거 `DEPLOY_FIREBASE_WINDOWS.cmd`도 이제 `DEPLOY_WINDOWS.cmd`를 호출하므로 QA를 우회하지 않는다.
- Mac/Linux 배포 스크립트도 콘텐츠 빌드 → 콘텐츠/런타임 QA → 자산 manifest 생성 → Hosting 배포 순서를 사용한다.

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
- `다시 확인`, `다른 기준` 등 UI/운영 문구를 학습 선택지로 사용하지 않음
- 오답 시 관련 교재/개념으로 즉시 복귀 후 짧은 확인문제로 재검증
- 확인문제는 같은 개념의 다른 실제 문장을 우선 사용

## 6. 2026-08-10 최신 수정 — 콘텐츠 선택지 오류 + 가로 학습 UX
사용자 실제 Firebase 화면 점검에서 다음 문제가 확인되었다.
- 과정 단계의 두 번째 선택지에 `다시 확인`이 표시되는 등 학습 내용과 UI 제어 문구가 섞임
- `판단 단계 시작`, `판단 단계`가 고1 학습자에게 추상적이고 시스템 용어처럼 보임
- PC/태블릿 가로 화면에서도 중앙 세로 문서형 구조라 문제 → 판단 → 오답 복귀가 긴 스크롤로 단절됨
- 오답 교재 근거와 재판단 영역을 동시에 보기 어려움

이를 기준으로 main에 다음을 구현했다.

### 콘텐츠 안전장치
- `tools/validate-content.mjs`에서 `다시 확인`, `다른 기준`, `판단 단계 시작`, `정답 보기`, `다음`, `교재 보기` 등 UI 제어 문구가 최종 선택지·과정 선택지·확인문제 선택지에 들어가면 **배포 전 FAIL** 처리한다.
- 브라우저 런타임에도 마지막 안전장치를 추가해 오래된 캐시 데이터에서 이런 선택지를 제거하고 의미 있는 대립항을 복구한다.
- 유효한 대립항을 끝내 만들 수 없는 오래된 데이터는 가짜 선택지를 보여주지 않고 해당 문항의 process gate만 안전하게 우회한다. 학습 자체를 막지 않는다.
- 기존 `audit-learning-content.mjs`의 `다시 확인`/무의미 선택지 감사와 함께 이중 검사를 사용한다.

### 고1 학습자 문구 정리
학생 화면에서는 내부 구조 개념을 유지하되 다음처럼 쉽게 표현한다.
- `판단 단계` → `풀이 순서`
- `판단 단계 시작` → `한 단계씩 다시 풀기`
- `답 선택 전 STEP 1 / 3` → `1단계 / 3단계`
- `최종 답보다 판단 단계를 먼저 통과합니다.` → `답부터 고르지 말고, 무엇을 먼저 봐야 하는지 순서대로 확인합니다.`
- `문장 표지와 자리 판단을 다시 확인하세요.` → `왼쪽 문장과 핵심 단서를 보고 다시 골라보세요.`
- 오답 교재 복귀 문구도 `왼쪽 교재 근거에서 방금 기준을 확인한 뒤 다시 골라보세요.`처럼 행동 지시형으로 정리한다.

### PC / 태블릿 가로 학습 구조
새 파일 `prototype/maintenance-v1.2-landscape.css`를 추가했다.

핵심 원칙은 **LEFT = 이미 본 것 / RIGHT = 지금 할 것**이다.
- 문제 풀이: 왼쪽에 문제 문장·단서, 오른쪽에 현재 풀이 단계·답 선택
- 오답 복구: 왼쪽에 교재 근거·핵심 규칙, 오른쪽에 한 단계씩 재판단
- 학습자는 화면을 위아래로 왕복하기보다 왼쪽 → 오른쪽으로 자연스럽게 시선을 이동한다.
- iPad/Galaxy 등 태블릿 가로모드에서도 동일 원리를 적용하고 터치 영역을 유지한다.
- 좁은 스마트폰/세로모드는 기존 1열 흐름을 유지한다.

### 캐시/배포 안정성
- Service Worker를 `maintenance-v1.2.0` 캐시로 갱신했다.
- 새 가로 UX CSS를 critical asset integrity 대상에 포함했다.
- 이전 캐시에 남은 화면이 계속 보이는 현상을 줄이고 새 배포 자산 identity를 검증한다.

관련 main 커밋:
- `fe2a584` Add left-to-right landscape study layout
- `d2c4a99` Polish learner copy and guard process choices
- `86e66ac` Block UI labels from learning choices
- `8c96d82` Bump learner cache for UX/content fixes
- `f77fc21` Include landscape UX in integrity manifest
- `0d73451` Route legacy Windows deploy through QA
- `6ac6377` Route Mac Linux deploy through QA

## 7. 참고 자료
프로젝트의 주된 문법/어법 출처는 사용자가 업로드한 `0. [개정] 5초 영어어법_OCR(1).pdf`이다.
독해 자료 `2. 5초 독해_OCR(1).pdf`도 프로젝트 참고자료로 존재한다.
첨부 `moonma(1).zip`은 콘텐츠 출처가 아니라 단순한 GitHub Desktop/Firebase 운영 구조의 참고 모델로 사용한다.

## 8. 다음 작업 — 최우선
현재 main 수정은 **아직 Firebase Hosting 실제 배포 완료로 간주하지 않는다.** 사용자 PC에서 최신 main을 Pull한 뒤 `DEPLOY_WINDOWS.cmd`를 실행하여 build/QA/Hosting 배포를 완료해야 한다.

그 다음 실제 Firebase URL에서 우선 검증한다.
1. 학생 PIN `8081` 진입
2. process-first 문항에서 `다시 확인`/`다른 기준` 등 무의미 선택지가 없는지
3. `sought (explaining / to explain)` 류 화면에서 의미 있는 두 선택지가 나오는지
4. PC 1366/1440/1920 가로에서 왼쪽 문제 → 오른쪽 풀이 흐름인지
5. iPad/Galaxy 가로에서 왼쪽 근거 → 오른쪽 현재 행동 흐름인지
6. 오답 복구에서 왼쪽 교재 이미지와 오른쪽 재판단을 동시에 볼 수 있는지
7. 세로 스크롤이 이전보다 크게 줄었는지
8. 서비스워커 갱신 후 이전 UI가 잔존하지 않는지

이 실화면 검증 후 남은 4,951문항의 자연스러움/선택지 길이 단서/확인문제 품질을 계속 전수 개선한다.

## 9. 작업 방식
사용자는 상세 중간 산출물/진행 로그를 매번 검토하지 않는다.
- 중간 진행 보고는 짧게
- 프론트엔드 화면은 사용자가 요청할 때 중심적으로 제시
- 반복적인 데이터 구축/코드 반영은 조용히 진행
- 구조 변경, 전수 대조, 중대한 오류가 있을 때만 별도로 알림

## 10. 새 채팅용 한 줄 실행 지시
**`다음 작업 진행` = 이 인계서를 읽고 GitHub `kfcccpro/5second` main을 기준으로, 먼저 Firebase에 실제 반영되었는지 확인하고 미반영이면 배포 절차를 안내/완료한 뒤 실화면 검증과 4,951문항 콘텐츠 품질 개선을 이어간다.**
