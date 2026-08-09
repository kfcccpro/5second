# JK English Firebase Student Pilot — 긴급 배포 가이드

기준본: Phase 50 기능 동결본 + 5초 영어 어법 표지
목표: GitHub 소스 관리 → Firebase Hosting 배포 → Firestore 다기기 동기화

## 0. 준비된 배포판

`jk-english-5sec-grammar-FIREBASE-READY.zip`

핵심 파일:
- `prototype/` 실제 PWA
- `prototype/assets/workbook/cover.png` 문제집 표지
- `prototype/cloud-sync.js` Firebase/Firestore 동기화 어댑터
- `firebase.json` Hosting/Firestore 배포 설정
- `firestore.rules` Student Pilot 규칙
- `firestore.indexes.json` 인덱스 설정
- `social-preview.png` GitHub README/표지용 이미지

## 1. Firebase 프로젝트 생성

Firebase Console에서 새 프로젝트를 만든다. 프로젝트 ID는 짧고 알아보기 쉽게 정한다.
예: `jk-english-5sec-grammar`

## 2. Anonymous Authentication 활성화

Authentication → Sign-in method → Anonymous → Enable

## 3. Firestore 생성

Firestore Database → Create database → Production mode
지역은 한국 사용자 기준 가까운 리전을 선택한다.

## 4. PC에서 Firebase CLI 연결

압축을 푼 배포판의 루트 폴더에서 실행한다.

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

`firebase use --add`에서 방금 만든 프로젝트를 선택하고 alias는 `default`로 지정한다.

## 5. 첫 배포

```bash
firebase deploy --only firestore:rules,hosting
```

성공하면 Firebase가 `https://<PROJECT_ID>.web.app` 주소를 제공한다.

## 6. 첫 실제 스모크 테스트

1. 표지 이미지가 나온다.
2. 학생 PIN `8081` 로그인 성공.
3. Day 학습 시작.
4. 최소 1문항 진행 후 새로고침/재접속하여 진도 유지.
5. 다른 기기에서 같은 URL을 열어 진도 동기화 확인.
6. 관리자 PIN `2007` 로그인 성공.
7. 관리자 설정에서 Firebase 동기화 상태 확인.

## 7. GitHub 자동 배포 연결 — 첫 배포 성공 후

저장소 루트에서:

```bash
firebase init hosting:github
```

첫날은 자동 배포보다 수동 첫 배포와 실제 기기 확인을 우선한다.

## 보안 범위

이 배포판은 `single-learner Student Pilot`이다. PIN은 앱 진입용 로컬 게이트이며 Firebase 계정 권한 자체를 대체하지 않는다. 따라서 학생용 Firebase URL은 지정 학습자에게만 공유한다. 다사용자 운영으로 확대할 때는 사용자별 Firebase Authentication/Custom Auth와 사용자별 Firestore Rules로 전환한다.
