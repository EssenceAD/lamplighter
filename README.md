# 등불지기 (Lamplighter) v1.0.1

등불 하나로 종이 마을의 밤을 지키는 그림자극 디펜스. 세로 모바일, 한 판 = 하룻밤(약 2~3분).

- 플레이: https://essencead.github.io/lamplighter/
- 외부 소스: [SOURCES.md](SOURCES.md)

## 조작

- 빛줄기는 가장 깊이 들어온 그림자를 스스로 따라갑니다. 손가락으로 끌면 직접 조종합니다.
- 섬광 단추를 꾹 눌렀다 떼면(또는 판 위를 꾹 눌렀다 떼면) 섬광이 퍼집니다.
- 판 위의 둥근 자리를 누르면 고른 도구가 섭니다. 다시 누르면 45도씩 돌고, 끌면 그 방향으로 돕니다.

## 구조

| 파일 | 내용 |
|---|---|
| `src/sim.js` | 게임 규칙(순수 로직, node에서도 실행) |
| `src/levels.js`, `src/tuning.js` | 5챕터 × 15단계 생성 규칙, 업그레이드·마을·스킨 데이터, 단계별 체력 보정표 |
| `src/world.js` | 길·설치 자리 좌표 |
| `src/stage.js` | 3D 무대(three.js). 그림자 광원 1개, 밤 그림자 굽기, 해상도 자동 조절 |
| `src/stage2d.js` | 2D 예비 무대(Canvas 2D). 설정의 "가벼운 화면" 또는 WebGL 불가·저속 기기에서 사용 |
| `src/main.js` | 화면·입력·루프 |
| `src/audio.js` | 배경음·효과음 합성 |
| `src/net.js` | 순위(Supabase) |
| `sw.js`, `manifest.webmanifest` | PWA, 새 버전 안내 띠 |

## 주소 옵션

- `?debug` 판 화면 하단에 단계·fps·해상도 배율 표시
- `?mute` 소리 끔(테스트용)
- `?2d` 2D 무대 강제
- `?auto` 테스트용 임시 저장 사용(실제 저장을 건드리지 않음), 모든 단계 열림

## 점검 도구

```bash
node tools/autoplay.mjs all
```

내장 봇으로 75단계를 브라우저 없이 끝까지 플레이합니다(`ch1`, `firsts` 도 가능).

```bash
node tools/calibrate.mjs
```

봇이 창문을 모두 지킬 수 있는 한계를 단계마다 찾아 `src/tuning.js`를 다시 씁니다(쉬움·쉬움·보통·어려움 비율 적용).

브라우저 콘솔에서는 `__ll.playNight(챕터, 단계)`, `__ll.buyAll()`, `__ll.lightAll(챕터)`, `__ll.festival(챕터)` 로 같은 흐름을 화면과 함께 돌릴 수 있습니다(0부터 셉니다).

로컬 실행: `node tools/serve.js` 후 http://localhost:8123
