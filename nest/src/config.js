// 모든 밸런스 수치는 이 파일 한 곳에 모은다.
// 속도 단위: 픽셀/초, 시간 단위: 초 (따로 적힌 경우 제외).
// 이후 튜닝 패널(M6)이 이 객체의 값을 실시간으로 바꾼다.

export const DEFAULT_CONFIG = {
  world: {
    tileSize: 32,
    viewWidth: 1280,
    viewHeight: 720,
  },

  camera: {
    followLerp: 0.12,      // 0~1, 클수록 카메라가 빨리 따라붙음
    switchPanMs: 250,      // 몬스터 교체 시 카메라 이동 시간(ms)
  },

  monster: {
    baseSpeed: 200,        // 기본 이동 속도
    radius: 16,            // 몸체 반지름(px) — 종류별 배율로 조정
    accel: 0.25,           // 0~1, 입력 방향으로 속도가 붙는 빠르기(관성 느낌)
    dashCharges: 2,        // 대시 최대 충전 수
    dashRecharge: 6,       // 대시 1회 재충전 시간(초)
    dashSpeed: 900,        // 대시 중 속도
    dashDuration: 0.12,    // 대시 지속 시간(초)
    dashNoise: 120,        // 대시 소음 크기(파동 반경 px)
  },

  // 몬스터 종류별 특성. speedMul 은 baseSpeed 에 곱하는 배율.
  monsterTypes: {
    kkuldduk: { name: '꿀떡이', color: 0x8b5a2b, radiusMul: 1.25, speedMul: 0.9 },
    kkaburi: { name: '까부리', color: 0xf2f2f2, radiusMul: 0.85, speedMul: 1.1 },
  },

  noise: {
    rippleDuration: 0.6,   // 소음 파동 표시 시간(초)
  },
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// 게임에서 실제로 읽는 설정(튜닝 패널이 수정하는 대상)
export const CONFIG = deepClone(DEFAULT_CONFIG);

export function resetConfig() {
  const fresh = deepClone(DEFAULT_CONFIG);
  for (const k of Object.keys(fresh)) CONFIG[k] = fresh[k];
}
