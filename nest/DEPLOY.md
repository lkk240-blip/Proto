# 배포 가이드 — itch.io에 HTML5 게임으로 올리기

테스터에게 링크 하나로 돌리기 위한 절차다. itch.io 업로드는 무료이고, 페이지를 "비공개(Restricted)"로 두고
비밀번호나 비밀 링크로만 공유할 수 있다.

## 1. zip 파일 만들기 (프로그래머가 1분이면 끝)

```bash
cd nest
npm install          # 처음 한 번만
npm run release      # = npm run build + npm run zip
```

- 결과물: `nest/nest-prototype.zip` (약 350KB)
- zip 안에 `index.html`이 **맨 위(루트)**에 있어야 itch.io가 게임을 찾는다. `npm run zip`은 그렇게 묶는다.
  (dist 폴더째로 압축하면 안 됨 — `dist/index.html`처럼 한 단계 들어가 버림)
- 빌드는 상대 경로(`base: './'`)라서 어느 주소에 올려도 동작한다.

## 2. itch.io에 올리기

1. https://itch.io 가입 → 오른쪽 위 계정 메뉴 → **Upload new project**
2. 기본 정보
   - **Title**: 예) Nest Prototype
   - **Project URL**: 자동 생성(나중에 공유할 주소)
   - **Kind of project**: **HTML** ← 반드시 선택 (기본값은 Downloadable)
   - **Classification**: Games
   - **Pricing**: **No payments** (테스트용)
3. **Uploads**: `nest-prototype.zip` 업로드 → 업로드된 파일 옆 체크박스 **"This file will be played in the browser"** 체크
4. **Embed options** (중요)
   - **Viewport dimensions**: `1280 × 720` (게임 기본 해상도). 작은 노트북이 많으면 `960 × 540`도 OK — 비율만 16:9면 자동으로 맞춰짐
   - **Mobile friendly**: 체크 해제 (키보드 필요)
   - **Fullscreen button**: 체크 (테스터가 크게 보고 싶을 때)
   - **Automatically start on page load**: 체크 해제 권장 (한 번 클릭해야 키보드 입력·사운드가 켜지는 브라우저 정책 때문. "Click to launch"로 시작)
   - **Enable scrollbars**: 체크 해제
5. **Visibility & access** (맨 아래)
   - 내부 테스트: **Restricted** → "Password protected" 비밀번호 설정 후 테스터에게 링크+비밀번호 전달
   - 또는 **Draft**로 두고 "Secret URL"로 공유
6. **Save & view page** → 페이지에서 직접 한 판 해 보고 확인

## 3. 업데이트할 때

- 수치를 바꾸거나 코드를 고친 뒤 `npm run release` → itch.io 프로젝트 **Edit game** → 기존 zip 삭제 후 새 zip 업로드
  (체크박스 "played in the browser" 다시 체크) → Save.
- 테스터 브라우저에 옛 버전이 캐시될 수 있으니 공지할 때 "새로고침(Ctrl+F5)" 안내.

## 4. 테스터 안내 문구 예시

> 링크 열고 게임 화면을 한 번 클릭한 뒤 시작하세요. 크롬/엣지 권장, 키보드 필요.
> 판이 끝나면 결과 화면의 **[기록 복사]**를 눌러, 복사된 내용 아래 질문 3개에 답을 적어 보내 주세요.
> 수치를 바꿔 보고 싶으면 게임 중 ` 키(숫자 1 왼쪽)로 튜닝 패널을 열 수 있어요.

## 5. 참고 (Steam 출시와의 관계)

- itch.io HTML5 빌드는 **가설 검증용 테스트 배포**다. Steam 출시용 빌드(Windows 실행 파일, Steamworks 연동,
  업적·클라우드 세이브·Steam Deck 대응)는 엔진·빌드 방식이 달라지므로 이 프로토타입 코드를 그대로 가져가지 않는 것을 전제로 한다.
- 브라우저 게임은 테스터의 PC 성능·브라우저에 따라 프레임이 달라진다. "느리다"는 피드백이 오면 튜닝 패널에서
  안개 끄기(디버그)로 차이가 나는지 확인해 볼 것 — 안개가 가장 무거운 기능이다.
