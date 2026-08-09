# JK English · 5초 영어 어법 · Maintenance Architecture v1.2

<p align="center">
  <img src="social-preview.png" alt="답이 보이는 5초 영어 어법 표지" width="360">
</p>

**학생용 앱:** `https://jk-english-5sec-grammar.web.app`

## 운영 기준

이 저장소 `kfcccpro/5second`의 `main` 브랜치를 유일한 최신 원본으로 사용합니다. 학생 서비스와 학습기록은 Firebase가 담당합니다.

- GitHub: 소스·문항·변경 이력
- GitHub Actions: 자동 빌드·전수 QA·Firebase Hosting 배포
- Firebase Hosting: 실제 PWA
- Firebase Anonymous Authentication: 백그라운드 인증
- Cloud Firestore: 단일 학습자의 다기기 학습상태
- IndexedDB: 오프라인 임시 저장
- 학생 PIN: `8081`
- 관리자 PIN: `2007`

## 일상 작업 흐름

자동배포 활성화 후에는 PC에서 Firebase 배포 명령을 실행하지 않습니다.

1. GitHub Desktop에서 **Fetch/Pull origin**
2. 문항·UI 수정
3. GitHub Desktop에서 **Commit → Push origin**
4. `main`에 Push되면 GitHub Actions가 자동으로:
   - 4,951문항 런타임 데이터 생성
   - 콘텐츠 구조 검사
   - 고1 단일 학습자용 콘텐츠 전수 감사
   - 반응형 UI/런타임 검사
   - asset integrity 생성
   - 모든 검사가 PASS일 때만 Firebase Hosting live 배포
5. 실패하면 기존 Firebase live 버전은 그대로 유지

`DEPLOY_WINDOWS.cmd`는 GitHub Actions 장애 시에만 사용하는 **비상 수동 배포용**으로 남깁니다.

## 자동배포 최초 1회 활성화

GitHub Actions가 Firebase Hosting에 배포하려면 Firebase가 만든 GitHub repository secret이 한 번 필요합니다.
Firebase 공식 방식대로 로컬 저장소 루트에서 다음을 최초 1회 실행합니다.

```powershell
firebase.cmd init hosting:github
```

대상 GitHub 저장소는 `kfcccpro/5second`, Firebase 프로젝트는 `jk-english-5sec-grammar`입니다.
Firebase CLI가 서비스 계정을 만들고 GitHub secret을 등록합니다. 현재 자동배포 workflow는 다음 secret 이름을 사용합니다.

```text
FIREBASE_SERVICE_ACCOUNT_JK_ENGLISH_5SEC_GRAMMAR
```

CLI가 별도 workflow 파일을 생성하는 경우에는 중복 workflow를 정리한 뒤 `.github/workflows/firebase-hosting-live.yml`을 기준으로 사용합니다.

## Maintenance v1.2 콘텐츠 원칙

1. **PC / 태블릿 / 스마트폰 시인성**
   - PC는 큰 학습문장과 선택지, 제한된 읽기 폭
   - 태블릿은 중간 밀도
   - 스마트폰은 한 열 + 큰 터치 타깃
2. **과정 우선 학습 유지**
   - 문제 → 단계 판단 → 근거 표시 → 과정 채점 → 필요한 교재 복귀 → 확인문제 → 원문 재도전
3. **2지선다 위치 단서 억제**
   - 정답 위치를 고정하지 않음
4. **무의미한 과정 선택지 금지**
   - `다시 확인`, `다른 기준` 등 답을 암시하거나 학습 의미가 없는 fallback 금지
5. **확인문제 적용형 전환**
   - 동일 개념의 다른 실제 문장을 우선 사용
   - 확인문제 prompt 안에 정답 선택지가 그대로 노출되지 않도록 cloze 처리
   - 원문과 사실상 같은 문장을 확인문제로 재사용하지 않음
6. **원본/생성물 분리**
   - 원본 문항: `content-src/questions/*.json`
   - 생성 런타임: `prototype/app-data.js`
   - 생성 런타임은 Git에서 추적하지 않고 CI/배포 시 재생성

## 수동 검증이 필요한 경우

```powershell
npm.cmd run check
```

Firestore Rules를 수정한 경우 자동 Hosting 배포와 별개로 rules 배포를 명시적으로 수행합니다. 일반 문항·UI 변경에는 Firestore Rules 배포가 필요하지 않습니다.

## 다른 PC에서 이어서 작업

`WORKSTATION_SETUP.md`를 따릅니다. 핵심은 **작업 시작 전에 Fetch/Pull, 작업 종료 전에 Commit/Push**입니다.
