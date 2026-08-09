# JK English 작업 PC 공통 운영

## 원칙
- GitHub `main` = 유일한 최신 원본
- Firebase = 실제 학생 서비스 + 학습기록
- 집 PC/회사 PC = GitHub에서 clone한 작업 복사본
- Phase ZIP 증식은 중단한다.

## 다른 PC 최초 1회
1. GitHub Desktop 설치 및 같은 GitHub 계정 로그인
2. `jk-english-5sec-grammar` 저장소 Clone
3. Node.js 설치 확인: `node --version`
4. Firebase CLI 설치: `npm.cmd install -g firebase-tools`
5. Firebase 로그인: `firebase.cmd login`
6. 프로젝트 확인: `firebase.cmd use jk-english-5sec-grammar`

## 매번 작업 시작
1. GitHub Desktop에서 **Pull origin**
2. `content-src/` 또는 UI 코드 수정
3. PowerShell에서 `npm.cmd run check`
4. 브라우저 로컬/배포 테스트
5. Commit → Push origin
6. 일반 수정 배포: `DEPLOY_WINDOWS.cmd`

## 콘텐츠 수정 위치
- 개념/소스/학습경로: `content-src/meta.json`
- 문항: `content-src/questions/<conceptId>.json`
- 원래 문항 순서: `content-src/question-order.json`
- 앱이 읽는 `prototype/app-data.js`는 **직접 편집하지 않는다.** `node tools/build-content.mjs`가 생성한다.

## 배포 구분
- 문항/UI만 수정: `DEPLOY_WINDOWS.cmd` (Hosting만)
- Firestore 규칙도 수정: `DEPLOY_FULL_WINDOWS.cmd`
