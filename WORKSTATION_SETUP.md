# JK English 작업 PC 공통 운영

## 기본 구조
- GitHub `kfcccpro/5second`의 `main` = 최신 기준본
- Firebase `jk-english-5sec-grammar` = 학생 서비스 + 학습기록
- 집 PC/회사 PC = GitHub에서 Clone한 작업 복사본

## 다른 PC 최초 1회
1. GitHub Desktop 설치 및 `kfcccpro` 계정 로그인
2. `https://github.com/kfcccpro/5second.git` Clone
3. 권장 경로: `C:\GitHub\5second`
4. Node.js 설치 확인: `node --version`
5. Firebase CLI 설치: `npm.cmd install -g firebase-tools`
6. Firebase 로그인: `firebase.cmd login`
7. 프로젝트 확인: `firebase.cmd use jk-english-5sec-grammar`

## 매번 작업할 때
1. GitHub Desktop에서 **Fetch origin → Pull origin**
2. 문항 또는 UI 수정
3. GitHub Desktop에서 **Commit → Push origin**
4. 학생용 Firebase 화면에 반영할 때만 `DEPLOY_WINDOWS.cmd` 더블클릭
5. `Deploy complete.` 확인 후 종료

## 중요한 원칙
- `firebase init hosting:github` 사용하지 않음
- GitHub Service Account Secret 설정하지 않음
- Push 자체를 Firebase 배포와 억지로 연결하지 않음
- Firebase 배포는 현재처럼 로컬 Firebase 로그인 상태를 그대로 사용
- `DEPLOY_WINDOWS.cmd`가 콘텐츠 빌드 + QA + Hosting 배포를 한 번에 수행

## PC를 바꿀 때
작업을 끝낸 PC에서 반드시 **Commit → Push origin** 후 종료하고, 다른 PC에서는 **Pull origin** 후 작업을 시작합니다.

## Firestore 규칙을 바꾸는 특별한 경우
일반 문항/UI 수정에는 필요 없습니다. 규칙까지 변경한 경우에만 `DEPLOY_FULL_WINDOWS.cmd`를 사용합니다.
