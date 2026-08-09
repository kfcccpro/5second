# JK English · 5초 영어 어법 · Maintenance Architecture v1.1

<p align="center">
  <img src="social-preview.png" alt="답이 보이는 5초 영어 어법 표지" width="360">
</p>

**학생용 앱:** `https://jk-english-5sec-grammar.web.app`

## 운영 기준

이 저장소 `kfcccpro/5second`의 `main` 브랜치를 유일한 최신 원본으로 사용합니다. 학생 서비스와 학습기록은 Firebase가 담당합니다.

- GitHub: 소스·문항·변경 이력
- Firebase Hosting: 실제 PWA
- Firebase Anonymous Authentication: 백그라운드 인증
- Cloud Firestore: 단일 학습자의 다기기 학습상태
- IndexedDB: 오프라인 임시 저장
- 학생 PIN: `8081`
- 관리자 PIN: `2007`

## Maintenance v1.1 핵심

1. **PC / 태블릿 / 스마트폰 시인성 재조정**
   - PC 학습문장·선택지·과정판단을 한 단계 크게 확대
   - 읽기 폭을 제한해 큰 모니터에서도 시선 이동이 과도하지 않도록 함
   - 태블릿은 중간 밀도, 스마트폰은 한 열 + 큰 터치 타깃 유지
2. **과정 우선 문항 선택 잠김 오류 수정 유지**
   - 판단 단계를 현재 문제 카드 안에서 먼저 수행
   - 판단 완료 후 정답 선택지를 표시
3. **2지선다 위치 단서 축소**
   - 2지선다 정답 위치를 문항 ID 기준으로 결정하여 한쪽 위치 반복을 억제
4. **과정 판단의 의미 없는 보조 선택지 제거**
   - 원문항·동일 개념·동일 판단 단계의 실제 대립항을 이용해 과정 선택지를 생성
   - `다른 기준` 같은 무의미 fallback이 있으면 검증 단계에서 차단
5. **확인문제 적용형 전환**
   - `manage·choose·pretend 뒤의 형태는?` 같은 암기형 질문보다 같은 개념의 다른 실제 문장을 이용한 짧은 micro-check를 우선 사용
   - 확인 후 원문 재도전 구조는 유지
6. **문항 편집 구조 분리**
   - `prototype/app-data.js` 직접 편집 금지
   - `content-src/questions/<conceptId>.json`이 원본
   - 빌드 시 학습자용 런타임 콘텐츠를 생성

## 콘텐츠 원칙

고1 단일 학습자를 기준으로 다음을 우선합니다.

- 정답 위치나 UI 패턴으로 답을 추측하기 어렵게 구성
- 추상 규칙 암기보다 짧은 문장 적용 확인 우선
- 오답 시: 판단 단계 → 교재 복귀 → 적용형 확인문제 → 원문 재도전
- 문제 ID·정답·개념·교재 연결은 유지
- 불필요한 시간 압박이나 숫자형 카운트다운은 사용하지 않음

## 수정 및 검증

- 문항: `content-src/questions/*.json`
- 개념·출처·학습경로: `content-src/meta.json`
- 문항 순서: `content-src/question-order.json`

수정 후:

```powershell
npm.cmd run check
```

일반 UI/문항 변경 배포:

```powershell
DEPLOY_WINDOWS.cmd
```

Firestore Rules를 수정한 경우에만 `DEPLOY_FULL_WINDOWS.cmd`을 사용합니다.

## 다른 PC에서 이어서 작업

`WORKSTATION_SETUP.md`를 따릅니다. 핵심은 **작업 시작 전에 Fetch/Pull, 작업 종료 전에 Commit/Push**입니다.
