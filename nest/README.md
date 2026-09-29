# Nest 프로토타입 — 알 운반 하이스트 슬랩스틱

## 실행
```bash
cd nest
npm install      # 처음 한 번
npm run dev      # 브라우저에서 표시되는 주소(보통 http://localhost:5173) 열기
npm run build    # dist/ 에 정적 빌드 (itch.io 업로드용)
```

- 밸런스 수치: `src/config.js`
- 맵: `src/maps/forest01.js` (텍스트로 수정 가능)
- 구현 중 가정/진행 기록: `NOTES.md`

## 배포(itch.io)
`npm run release` → `nest-prototype.zip` 생성. 업로드 절차는 `DEPLOY.md` 참고.

## 폴더 구조
```
src/
  config.js            모든 밸런스 수치 (튜닝 패널이 이 값을 바꿈)
  maps/forest01.js     맵 텍스트 데이터 + 괴수 로밍 경로
  scenes/              Start(시작) · Game(본 게임) · Hud(화면 UI) · Result(결과)
  entities/            Monster(꿀떡이/까부리) · Egg(알) · Guard(잠자는 대형 괴수) · Chaser(우두머리 괴수)
  systems/             EggSystem(알 규칙/공동 운반) · Companion(동료 AI) · Pathfinder · Noise · Input · Fx · Sfx · RunLog
  ui/TuningPanel.js    ` 키 튜닝 패널
```
