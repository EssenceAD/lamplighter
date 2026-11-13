# 등불지기 (Lamplighter) — 룩뎁 장면

게임 기능 없이 보이는 것만 담은 Three.js 룩뎁 장면입니다. 세로 모바일, 고정 카메라, 약 37초 자동 재생 루프.

- 데모: https://essencead.github.io/lamplighter/
- 특정 시점 고정: 주소 뒤에 `?t=초` (예: `?t=7.22` 명중, `?t=16.2` 연기, `?t=18.7` 모임, `?t=19.3` 충격파, `?t=34.8` 동틀 녘)
- `?debug` 를 붙이면 하단에 구간 캡션과 fps·해상도 배율이 표시됩니다(기본은 숨김).
- 그림자 광원은 한 번에 1개(밤=등불, 새벽=해). 밤 그림자는 고정 시야로 한 번 구워 두고, 괴물 그림자는 등불에서 바닥으로 투영한 실루엣입니다.
- 프레임이 45fps 아래로 떨어지면 렌더 해상도를 단계적으로 낮춥니다.
- 소리 없음.

루프 순서: 밤 → 빛줄기 → 명중 2회 → 창문 꺼짐 → 섬광(모임·충격파·흔들림·잔광, 세 번째 괴물) → 동틀 녘.

로컬 실행: `node tools/serve.js` 후 http://localhost:8123
에셋 재생성: `cd tools && npm i && node segment.js ../ref/<sheet>.png ../ref/parts2 <minArea> <join> && node trace.js ../ref/parts2 ../assets/shapes.json ../assets/svg`

외부 소스는 [SOURCES.md](SOURCES.md) 참고.
