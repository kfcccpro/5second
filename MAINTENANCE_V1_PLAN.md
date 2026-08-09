# JK English Maintenance Architecture v1

## 목표
실사용 중 발견되는 문항·콘텐츠·UI 오류를 빠르게 수정하면서도 학습 철학과 기존 학습기록을 유지한다.

## 1. 이번 즉시 수정
- process_first 문항에서 판단 단계가 숨겨진 오답 카드 내부에 렌더되던 구조적 오류 수정
- 답을 아직 누를 수 없는 상태에서는 회색 비활성 버튼을 노출하지 않고, 선행 단계 안내만 표시
- PC/태블릿/스마트폰별 글자 크기, 카드 폭, 선택지 높이, 터치 타깃, 여백 재설계
- 데스크톱에서도 문제 본문/선택지가 지나치게 작아지지 않도록 집중 폭을 별도로 제한
- Service Worker 버전을 Maintenance v1으로 갱신해 기존 캐시가 새 UI를 가리는 문제 방지

## 2. 유지보수 구조
- `main` 브랜치가 단일 기준본
- `content-src/`가 콘텐츠 편집 원본
- `prototype/app-data.js`는 자동 생성 런타임 산출물
- Firestore 데이터 스키마 및 question ID는 유지해 기존 진도/오답 기록과의 연결을 보존

## 3. 반응형 기준
- Phone: 0–699px — 한 열, 60px 수준 선택지, 22px 문제 본문
- Tablet: 700–1099px — 중간 밀도, 28px 문제 본문
- Desktop: 1100px 이상 — 920–1000px 집중 학습 폭, 34–35px 문제 본문
- Wide desktop: 1400px 이상 — 화면 전체를 늘리지 않고 집중 영역과 글자만 적절히 확대

## 4. 수정 루프
1. Git Pull
2. 문항이면 `content-src/questions/` 수정
3. UI이면 `prototype/maintenance-v1.css` 또는 최소 JS 수정
4. `npm.cmd run check`
5. 브라우저 실검증
6. Commit / Push
7. `DEPLOY_WINDOWS.ps1`

## 5. 보존 항목
- 4,951문항 및 question ID
- 저자식 단계 판단
- 근거 표시 / 과정 채점
- 실패 시 교재 복귀
- 확인문제 / 원문 재도전
- Daily 21/18/1 구조
- Firestore 다기기 동기화
