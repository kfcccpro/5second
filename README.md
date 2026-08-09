# JK English · 5초 영어 어법 · Maintenance Architecture v1

<p align="center">
  <img src="social-preview.png" alt="답이 보이는 5초 영어 어법 표지" width="360">
</p>

**학생용 앱:** `https://jk-english-5sec-grammar.web.app`

## 현재 운영 원칙

이 저장소의 `main` 브랜치를 유일한 최신 원본으로 사용합니다. 학생 학습 서비스와 학습기록은 Firebase가 담당합니다.

- GitHub: 소스·문항·변경 이력
- Firebase Hosting: 실제 PWA
- Firebase Anonymous Authentication: 백그라운드 인증
- Cloud Firestore: 단일 학습자의 다기기 학습상태
- IndexedDB: 오프라인 임시 저장
- 학생 PIN: `8081`
- 관리자 PIN: `2007`

## 이번 Maintenance v1 핵심 변경

1. **PC / 태블릿 / 스마트폰 공통 반응형 UI**
   - 넓은 화면에서는 글자·선택지·오늘 학습 패널을 확대
   - 태블릿은 중간 밀도
   - 스마트폰은 한 열, 큰 터치 타깃, 안전영역 대응
2. **과정 우선(process_first) 선택지 잠김 오류 수정**
   - 기존에는 답 선택 전 단계가 숨겨진 오답 카드 안에 렌더되어 선택지만 비활성화되는 문제가 있었음
   - 판단 단계를 현재 문제 카드 안에 별도 표시하고, 완료 전에는 선택지를 숨김
3. **필기 필수 문항의 비활성 선택지 혼란 제거**
   - 필기/표식이 끝나기 전에는 답 선택지를 숨기고 안내 문구를 표시
4. **문항 편집 구조 분리**
   - `prototype/app-data.js` 직접 편집 금지
   - `content-src/questions/<conceptId>.json`에서 문항 수정
   - 빌드 스크립트가 런타임 데이터를 다시 생성
5. **집 PC / 회사 PC 공통 작업 흐름**
   - 작업 시작: Pull origin
   - 수정 → 검증 → Commit → Push → Firebase Hosting 배포

## 콘텐츠 수정

- 문항: `content-src/questions/*.json`
- 개념·출처·학습경로: `content-src/meta.json`
- 문항 순서: `content-src/question-order.json`

수정 후:

```powershell
npm.cmd run check
```

검증이 PASS이면 일반 UI/문항 변경은:

```powershell
DEPLOY_WINDOWS.cmd
```

이 스크립트는 콘텐츠 빌드 → 검증 → Firebase 프로젝트 확인 → **Hosting만 배포**합니다.
Firestore Rules를 수정한 경우에만 `DEPLOY_FULL_WINDOWS.cmd`을 사용합니다.

## 다른 PC에서 이어서 작업

`WORKSTATION_SETUP.md`를 따릅니다. 가장 중요한 규칙은 **작업 시작 전에 항상 Pull origin**입니다.

## Firebase 구조

- Project ID: `jk-english-5sec-grammar`
- Firestore 위치: `asia-northeast3 (Seoul)`
- Firestore: Production mode에서 시작, 전용 Security Rules 적용
- `.firebaserc`: 저장소에 포함하여 어느 PC에서도 동일 프로젝트를 사용

## 보안 범위

현재는 지정된 학생 1명과 관리자 1명을 위한 폐쇄형 Pilot입니다. `8081`과 `2007`은 앱 진입용 PIN이며 Firebase 사용자별 권한 계정은 아닙니다. 다사용자 서비스로 확대할 때는 인증·권한 모델을 별도로 강화해야 합니다.
