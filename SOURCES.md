# SOURCES

「등불지기」 룩뎁 장면에 쓰인 모든 외부 소스 기록입니다.

## 1. 참고 이미지 (AI 생성) → 윤곽만 사용

실루엣 도형은 이미지 생성 결과를 **참고용으로만** 쓰고, 흑백 임계 처리 후 potrace로 윤곽을 벡터 추출했습니다.
화면에 쓰이는 것은 `assets/shapes.json`(SVG path 데이터)뿐이며, 생성 이미지의 픽셀·질감은 쓰지 않습니다.

| 참고 시트 | 내용 | 생성 도구 / 모델 |
|---|---|---|
| `ref/houses.png` | 마을 집 (그중 5채 사용) | Higgsfield · Z Image (Tongyi-MAI) |
| `ref/tower.png` | 등불 탑 | 〃 |
| `ref/monsters2.png` | 그림자 괴물 (그중 3마리 사용) | 〃 |
| `ref/props.png` | 나무, 우물, 울타리 | 〃 |
| `ref/scenery.png` | 달, 구름, 산·언덕 띠 | 〃 |
| `ref/path.png` | 꼬불한 길 | 〃 |

- 생성일: 2026-11-13. 프롬프트는 "순수 검정 종이 오림 실루엣 / 흰 배경 / 질감·그림자 없음"을 공통으로 지정.
- 스타일 참고(프롬프트에 서술로만 반영, 원작 이미지는 사용하지 않음):
  - 로테 라이니거 「아흐메드 왕자의 모험」(Die Abenteuer des Prinzen Achmed, 1926) 실루엣 애니메이션
  - 와양 쿨릿(Wayang kulit) 그림자극
- 추출 과정: `tools/segment.js`(시트를 도형별로 분리) → `tools/trace.js`(potrace) → `assets/shapes.json`, `assets/svg/*.svg`
- 길의 중심선(괴물 이동 경로)은 같은 길 실루엣의 거리 변환에서 계산했습니다.
- 세 번째 괴물은 같은 참고 시트의 두 조각을 합성했습니다(동글한 몸통 + 다른 괴물의 뿔, `tools/compose.js`).
- 괴물 눈동자, 창문 뒤 발광면, 종이 조각은 코드에서 만든 단순 도형입니다.

## 2. 종이 질감 — ambientCG (CC0 1.0)

실제 종이 스캔 PBR 재질. https://ambientcg.com · 라이선스: https://docs.ambientcg.com/license/

| 파일 | 원본 | 용도 |
|---|---|---|
| `assets/paper/Paper001_Color.jpg`, `Paper001_NormalGL.jpg` | [Paper 001](https://ambientcg.com/view?id=Paper001) 1K-JPG | 모든 종이 조각의 결·노멀, 하늘 배경지, 터지는 종이 조각 |
| `assets/paper/Paper003_NormalGL.jpg` | [Paper 003](https://ambientcg.com/view?id=Paper003) 1K-JPG | 바닥 종이의 구김 노멀 |
| `assets/paper/Paper006_Color.jpg`, `Paper006_NormalGL.jpg` | [Paper 006](https://ambientcg.com/view?id=Paper006) 1K-JPG | 예비(현재 미사용) |

## 3. 파티클 — Kenney Particle Pack 1.1 (CC0 1.0)

https://kenney.nl/assets/particle-pack · Kenney Vleugels (kenney.nl)

`assets/particles/` 의 PNG 전부. 실제 사용: `circle_05`(빛 속 먼지·불티), `spark_05`(불티), `flare_01`·`light_01`(등불 후광),
`star_07`(별), `smoke_04_alpha`(연기). 나머지는 예비.

## 4. 코드 라이브러리

| 이름 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| [three.js](https://threejs.org) (+ examples/jsm: SVGLoader, EffectComposer, UnrealBloomPass, ShaderPass, OutputPass) | 0.170.0 (jsDelivr CDN) | MIT | 렌더링, 블룸 후처리 |
| [potrace (node 포트)](https://github.com/tooolbox/node-potrace) | npm `potrace` | GPL-2.0 | 빌드 시 윤곽 벡터 추출 (런타임 미포함) |
| [Jimp](https://github.com/jimp-dev/jimp) | 0.22 | MIT | 빌드 시 이미지 읽기 (런타임 미포함) |

색 보정·비네트·충격파 굴절, 빛 원뿔, 먼지·불티 셰이더는 이 저장소에서 직접 작성했습니다.

## 5. 소리

없음. 이 장면은 오디오를 전혀 포함하지 않습니다.
