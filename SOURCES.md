# SOURCES

「등불지기」 2.0에 쓰인 모든 외부 소스 기록입니다. (1.0 때의 참고 시트도 `ref/`에 남아 있으며, 2.0에서 쓰지 않는 것은 표에 "미사용"으로 적었습니다.)

## 1. 참고 이미지 (AI 생성) → 윤곽만 사용

모든 실루엣(마을·괴물·보스·주민·도구)은 이미지 생성 결과를 **참고용으로만** 쓰고, 흑백 임계 처리 후 potrace로 윤곽을 벡터 추출했습니다.
화면에 쓰이는 것은 `assets/shapes.json`(SVG path 데이터)뿐이며, 생성 이미지의 픽셀·질감은 쓰지 않습니다.

| 참고 시트 | 내용 | 생성 도구 / 모델 |
|---|---|---|
| `ref/houses.png` | 마을 집 (그중 5채 사용) | Higgsfield · Z Image (Tongyi-MAI) |
| `ref/tower.png` | 등불 탑 (앱 아이콘에도 사용) | 〃 |
| `ref/props.png` | 나무, 우물, 울타리 | 〃 |
| `ref/scenery.png` | 달, 구름, 언덕 띠(마을 뒤 먼 언덕). 구름 하나는 안개 그림자의 윤곽으로도 사용 | 〃 |
| `ref/path.png` | 꼬불한 길 | 〃 |
| `ref/monsters3.png` | 걷는 그림자 2종 (더듬이형·작은 뿔형의 머리와 발) | 〃 |
| `ref/monsters2.png` | 작은 뿔형의 뿔만 사용 | 〃 |
| `ref/enemies.png` | 걷는 그림자(둥근 귀형), 빠른 그림자, 뚱뚱한 그림자, 색 그림자 | 〃 |
| `ref/folk.png` | 그림자 우산, 마을 주민 5종 | 〃 |
| `ref/bosses.png` | 챕터 보스 5종 | 〃 |
| `ref/tools.png` | 거울, 프리즘, 렌즈, 반딧불 병 (색유리는 2.0 미사용) | 〃 |
| `ref/sea.png` | 2.0 바다 그림자: 잔챙이, 날치, 방패게, 문어, 거북, 큰 고래 보스 | 〃 |
| `ref/harbour.png` | 2.0 항구: 고깃배, 부두, 종(틀), 봉화, 통, 바위 — 조각이 붙어 나와 `tools/crop.js`로 영역을 잘라 사용 (절벽 2개는 2.0.2부터 미사용) | 〃 |
| `ref/waves.png` | 2.0.2 바다: 말린 물마루가 이어진 파도 띠 3종 (`wave_a`·`wave_b`·`wave_c`, 화면에는 a·c 사용) | 〃 |
| `ref/crag_a.png`, `ref/crag_b.png` | 2.0.2 등대 바위 절벽 2종. 사진풍으로 나와 흑백 임계 처리로 바깥 윤곽만 추출(안쪽 명암·질감은 버림) | 〃 |

- 생성일: 2026-11-13 (파도·바위 절벽은 2026-11-14). 프롬프트는 "순수 검정 종이 오림 실루엣 / 흰 배경 / 질감·그림자 없음"을 공통으로 지정.
- 스타일 참고(프롬프트에 서술로만 반영, 원작 이미지는 사용하지 않음):
  - 로테 라이니거 「아흐메드 왕자의 모험」(Die Abenteuer des Prinzen Achmed, 1926) 실루엣 애니메이션
  - 와양 쿨릿(Wayang kulit) 그림자극
- 추출 과정: `tools/segment.js`(시트를 도형별로 분리) → `tools/compose.js`(걷는 그림자 2종 합성) → `tools/trace.js`(potrace) → `assets/shapes.json`, `assets/svg/*.svg`
- 걷는 그림자 2종(더듬이형·뿔형): `monsters3.png`가 서 있는 인형 형태로 나와, 동글한 머리와 발만 잘라 덩어리로 합성한 뒤 추출했습니다.
- 각진 가위질 가장자리는 추출한 윤곽을 긴 직선 구간으로 다시 샘플링해 만듭니다.
- 길의 중심선(괴물 이동 경로)은 길 실루엣의 거리 변환에서 계산했습니다.
- 코드에서 만든 단순 도형: 괴물의 동그란 호박색 눈, 창문 뒤 발광면, 종이 조각, "뿅" 고리, 체력바, 설치 자리 원판, 단계 표시 점, 빛줄기·불길·번개·종소리 고리.
- 2.0의 세 갈래 길은 참고 이미지 없이 코드의 곡선에서 가장자리를 거칠게 만든 종이 띠입니다.
- 2.0 미사용(1.0 전용): `ref/path.png`, `ref/monsters2.png`, `ref/monsters3.png`, `ref/enemies.png`, `ref/bosses.png`, `ref/folk.png`의 주민·우산.

## 2. 종이 질감 — ambientCG (CC0 1.0)

실제 종이 스캔 PBR 재질. https://ambientcg.com · 라이선스: https://docs.ambientcg.com/license/

| 파일 | 원본 | 용도 |
|---|---|---|
| `assets/paper/Paper001_Color.jpg`, `Paper001_NormalGL.jpg` | [Paper 001](https://ambientcg.com/view?id=Paper001) 1K-JPG | 모든 종이 조각의 결·노멀, 하늘 배경지 |
| `assets/paper/Paper003_NormalGL.jpg` | [Paper 003](https://ambientcg.com/view?id=Paper003) 1K-JPG | 바닥 종이의 구김 노멀 |
| `assets/paper/Paper006_*.jpg` | [Paper 006](https://ambientcg.com/view?id=Paper006) 1K-JPG | 예비(미사용) |
| `assets/paper/torn.png` | [Cardboard Set 001](https://ambientcg.com/view?id=CardboardSet001) 4K-JPG 의 Opacity 맵 | UI 종이(쪽지·단추·카드·메뉴 조각)의 찢긴 가장자리 마스크. 스캔된 조각 2장의 실제 찢긴 변 4개에서 깊이 윤곽을 읽어 정사각 마스크의 네 변으로 옮긴 것(`tools/torn.js`). 색·질감은 쓰지 않고 윤곽만 사용하며, CSS `mask-border`로 9분할해 크기와 무관하게 찢김의 축척을 유지 |

## 3. 파티클 — Kenney Particle Pack 1.1 (CC0 1.0)

https://kenney.nl/assets/particle-pack · Kenney Vleugels (kenney.nl)

`assets/particles/` 의 PNG 전부. 실제 사용: `circle_05`(빛 속 먼지·불티·반딧불), `spark_05`(불티·반짝이), `flare_01`·`light_01`(등불 후광),
`star_07`(별), `smoke_04_alpha`(연기). 나머지는 예비.

## 4. 코드 라이브러리

| 이름 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| [three.js](https://threejs.org) (+ examples/jsm: SVGLoader, EffectComposer, UnrealBloomPass, ShaderPass, OutputPass) | 0.170.0 (jsDelivr CDN) | MIT | 3D 무대, 블룸 후처리 |
| [potrace (node 포트)](https://github.com/tooolbox/node-potrace) | npm `potrace` | GPL-2.0 | 빌드 시 윤곽 벡터 추출 (런타임 미포함) |
| [Jimp](https://github.com/jimp-dev/jimp) | 0.22 | MIT | 빌드 시 이미지 처리, 앱 아이콘 생성 (런타임 미포함) |

게임 규칙, 웨이브·카드 데이터, 무대, 셰이더(색 보정·비네트·빛 원뿔·먼지·불티·충격파 고리·빛줄기)는 이 저장소에서 직접 작성했습니다.

## 4-1. 글꼴 — Google Fonts (SIL Open Font License 1.1)

| 이름 | 용도 |
|---|---|
| [Hahmlet](https://fonts.google.com/specimen/Hahmlet) | 한글 |
| [Fraunces](https://fonts.google.com/specimen/Fraunces) | 숫자·로마자 |

화면의 아이콘(달, 집, 종이 별, 음표, 멈춤, 화살표, 등잔 등)은 이 저장소에서 직접 그린 실루엣이고, 설치물·카드 그림은 추출한 윤곽을 그대로 씁니다. 종이 쪽지의 결은 ambientCG Paper 001 스캔입니다.

## 5. 소리

오디오 파일은 없습니다. 배경음(첼로·아코디언 왈츠)과 효과음(종이 바스락, "뿅", 섬광, 반짝이, 촛불 꺼짐, 종, 번개)은 모두
브라우저의 WebAudio로 코드에서 합성합니다(`src/audio.js`). 선율과 화성 진행은 이 게임을 위해 새로 쓴 것입니다.

## 6. 서비스

| 이름 | 용도 |
|---|---|
| Supabase (프로젝트 `clockfall`) | 2.0에서는 버틴 웨이브 순위(오늘·이번 주)로 같은 테이블을 재사용. 점수 = 넘긴 웨이브 × 100 + 남은 창문. 테이블 `ll_scores`, 함수 `ll_submit` / `ll_daily_top` / `ll_weekly_top` / `ll_today` (마이그레이션 `lamplighter_leaderboards`). 닉네임과 기기별 임의 ID, 점수만 저장합니다. |
| GitHub Pages | 배포 |
