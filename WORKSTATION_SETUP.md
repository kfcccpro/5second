# JK English 작업 PC 공통 운영

## 원칙
- GitHub `kfcccpro/5second`의 `main` = 유일한 최신 원본
- Firebase `jk-english-5sec-grammar` = 실제 학생 서비스 + 학습기록
- 집 PC/회사 PC = GitHub에서 clone한 작업 복사본
- Phase ZIP 증식은 중단한다.

## 다른 PC 최초 1회
1. GitHub Desktop 설치 및 `kfcccpro` 계정 로그인
2. `https://github.com/kfcccpro/5second.git` 저장소 Clone
3. 권장 로컬 경로: `C:\GitHub\5second`
4. Node.js 설치 확인: `node --version`
5. Firebase CLI 설치: `npm.cmd install -g firebase-tools`
6. Firebase 로그인: `firebase.cmd login`
7. 프로젝트 확인: `firebase.cmd use jk-english-5sec-grammar`

## 매번 작업 시작
1. GitHub Desktop에서 **Fetch origin → Pull origin**
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

## Maintenance v1.1 콘텐츠 정규화
빌드 단계에서 원본 문항 ID/정답/개념 연결을 유지하면서 학습 화면용 런타임 콘텐츠를 정규화한다.
- 2지선다 정답 위치를 문항 ID 기준으로 결정해 위치 편향을 줄임
- 과정판단 선택지는 의미 있는 대립항으로 구성
- 확인문제는 같은 개념의 다른 실제 문항을 이용한 짧은 적용형 micro-check를 우선 사용
- `validate-content.mjs`가 의미 없는 과정 선택지, 정답 위치 편향, 확인문제 구조를 검사

## 배포 구분
- 문항/UI만 수정: `DEPLOY_WINDOWS.cmd` (Hosting만)
- Firestore 규칙도 수정: `DEPLOY_FULL_WINDOWS.cmd`

## PC를 바꿀 때
작업을 끝낸 PC에서 **Commit → Push origin**을 먼저 완료하고, 다음 PC에서는 반드시 **Pull origin** 후 수정한다.
