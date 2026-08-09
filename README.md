# JK English · 5초 영어 어법

<p align="center">
  <img src="social-preview.png" alt="답이 보이는 5초 영어 어법 표지" width="360">
</p>

**학생용 앱:** `https://jk-english-5sec-grammar.web.app`

## 운영 원칙

이 저장소 `kfcccpro/5second`의 `main` 브랜치를 최신 기준본으로 사용합니다.

- GitHub Desktop: 집/회사 PC 사이 소스 동기화
- Firebase Hosting: 학생에게 보이는 실제 웹앱
- Firebase Anonymous Authentication + Firestore: 단일 학습자의 다기기 학습상태 동기화
- 학생 PIN: `8081`
- 관리자 PIN: `2007`

## 가장 단순한 작업 흐름

평소에는 복잡한 GitHub Actions, Service Account Secret, 별도 자동배포 인증을 사용하지 않습니다.

1. 작업 시작: GitHub Desktop에서 **Fetch origin → Pull origin**
2. 문항/UI 수정
3. 작업 저장: GitHub Desktop에서 **Commit → Push origin**
4. 학생 화면에 반영할 때: `DEPLOY_WINDOWS.cmd` 더블클릭
5. `Deploy complete.`가 나오면 아무 키나 눌러 종료

`DEPLOY_WINDOWS.cmd`는 콘텐츠 생성·검사와 Firebase Hosting 배포를 한 번에 처리합니다. 사용자가 별도 빌드 명령이나 Firebase 명령을 외울 필요가 없습니다.

## 다른 PC에서 이어서 작업

최초 1회만:

1. GitHub Desktop에서 `kfcccpro/5second` Clone
2. Node.js 설치
3. Firebase CLI 설치: `npm.cmd install -g firebase-tools`
4. Firebase 로그인: `firebase.cmd login`
5. 프로젝트 선택: `firebase.cmd use jk-english-5sec-grammar`

그 뒤에는 항상 **Pull → 수정 → Commit/Push → 필요할 때 DEPLOY_WINDOWS.cmd**만 사용합니다.

## 콘텐츠 원칙

- 문제 → 단계 판단 → 근거 표시 → 과정 채점 → 필요한 교재 복귀 → 확인문제 → 원문 재도전 흐름 유지
- 2지선다 정답 위치 고정 금지
- `다시 확인`, `다른 기준` 같은 무의미한 선택지 금지
- 확인문제는 같은 개념의 다른 실제 문장을 우선 사용
- PC/태블릿/스마트폰 모두 높은 시인성과 큰 터치 영역 유지

## 콘텐츠 파일

- 원본 문항: `content-src/questions/*.json`
- 개념/소스/학습경로: `content-src/meta.json`
- 문항 순서: `content-src/question-order.json`
- 실행 데이터 `prototype/app-data.js`는 배포 직전에 자동 생성

## QA

평소 사용자는 QA 명령을 따로 실행할 필요가 없습니다. `DEPLOY_WINDOWS.cmd`가 배포 전에 자동 검사하며, 심각한 오류가 있으면 배포를 중단합니다.

GitHub의 `content-qa.yml`은 코드 검토용 보조 안전장치일 뿐이며 실제 Firebase 배포와 연결하지 않습니다.
