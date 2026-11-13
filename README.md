# 등불지기 (Lamplighter) — 룩뎁 장면

게임 기능 없이 보이는 것만 담은 Three.js 룩뎁 장면입니다. 세로 모바일, 고정 카메라, 약 37초 자동 재생 루프.

- 데모: https://essencead.github.io/lamplighter/
- 특정 시점 고정: 주소 뒤에 `?t=초` (예: `?t=7.22` 명중, `?t=16.2` 연기, `?t=18.7` 모임, `?t=19.3` 충격파, `?t=34.8` 동틀 녘)
- 소리 없음.

루프 순서: 밤 → 빛줄기 → 명중 2회 → 창문 꺼짐 → 섬광(모임·충격파·흔들림·잔광, 세 번째 괴물) → 동틀 녘.

로컬 실행: `node tools/serve.js` 후 http://localhost:8123
에셋 재생성: `cd tools && npm i && node segment.js ../ref/<sheet>.png ../ref/parts2 <minArea> <join> && node trace.js ../ref/parts2 ../assets/shapes.json ../assets/svg`

외부 소스는 [SOURCES.md](SOURCES.md) 참고.
