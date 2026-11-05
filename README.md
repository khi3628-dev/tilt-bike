# 기울기 자전거 (시제품)

폰을 가로로 들고 핸들처럼 돌리면 길이 기울어지는 자전거 게임.
오른쪽을 내리면 내리막이 되어 빨라지고, 반대로 돌리면 오르막이 되어 멈춥니다.

- 플레이: https://khi3628-dev.github.io/tilt-bike/ (아이폰은 Safari에서 "기울기로 시작" → 동작 센서 허용)
- 5판: 첫 내리막 · 높은 오르막 · 틈 점프(토끼) · 둔덕 터널(거북이) · 총정리(깃발 사이에서 멈추기)
- 센서가 안 되면 "화면 누르기로 시작": 오른쪽을 누를수록 내리막

## 만들기
```
npm install
node build.js          # dist/index.html + index.html (한 파일, planck.js 포함)
node test/sim.js check # 판별 성공/실패 시나리오
node test/browser.js   # 헤드리스 크롬 점검
```
