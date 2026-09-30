// 모든 밸런스 수치는 이 파일 한 곳에 모은다.
// 속도 단위: 픽셀/초, 시간 단위: 초, 거리 단위: 픽셀 (따로 적힌 경우 제외).
// 튜닝 패널(` 키)이 이 객체(CONFIG)의 값을 실시간으로 바꾼다.

export const DEFAULT_CONFIG = {
  world: {
    tileSize: 32,
    viewWidth: 1280,
    viewHeight: 720,
  },

  camera: {
    followLerp: 0.12,      // 0~1, 클수록 카메라가 빨리 따라붙음
    switchPanMs: 250,      // 몬스터 교체 시 카메라 이동 시간(ms)
    soloZoom: 1.25,        // 1인 모드 카메라 줌(클수록 가까이 = 보이는 범위가 좁음)
    duoMinZoom: 0.75,      // 2인 모드: 가장 멀리 뺐을 때 줌
    duoMaxZoom: 1.2,       // 2인 모드: 가장 가까이 당겼을 때 줌
    duoPadding: 260,       // 2인 모드: 두 몬스터 주변 여백
  },

  monster: {
    baseSpeed: 200,        // 기본 이동 속도
    radius: 16,            // 몸체 반지름(px) — 종류별 배율로 조정 (실행 중 변경 불가)
    accel: 0.25,           // 0~1, 입력 방향으로 속도가 붙는 빠르기(관성 느낌)
    dashCooldown: 3,       // 대시 쿨타임(초) — 쓰고 나서 이 시간이 지나야 다시 사용 가능
    dashSpeed: 900,        // 대시 중 속도
    dashDuration: 0.12,    // 대시 지속 시간
    dashNoise: 120,        // 대시 소음 크기(파동 반경)
    stunTime: 3,           // 경비에게 잡혔을 때 기절 시간
    knockbackSpeed: 750,   // 잡혔을 때 튕겨 나가는 속도
    graceTime: 1.5,        // 기절에서 깬 뒤 다시 잡히지 않는 시간
    maxHp: 3,              // 기본 체력(칸) — 종류별 maxHp 가 있으면 그 값을 씀
    guardDamage: 1,        // 괴수에게 잡히면 깎이는 체력
    bossDamage: 2,         // 우두머리 괴수에게 잡히면 깎이는 체력
    reviveTime: 2.5,       // 쓰러진 동료 옆에서 E를 누르고 있어야 하는 시간
    reviveRange: 70,       // 부활시킬 수 있는 거리(몸 가장자리 사이)
    reviveHp: 1,           // 부활했을 때 체력
  },

  // 몬스터 종류별 특성. speedMul 은 baseSpeed 에 곱하는 배율.
  monsterTypes: {
    // maxHp: 종류별 체력(칸). 꿀떡이는 느린 대신 튼튼함
    kkuldduk: { name: '꿀떡이', color: 0x8b5a2b, radiusMul: 1.25, speedMul: 0.9, maxHp: 5 },
    kkaburi: { name: '까부리', color: 0xf2f2f2, radiusMul: 0.85, speedMul: 1.1, maxHp: 3 },
  },

  // 기능 켜기/끄기
  features: {
    uniqueSkills: false,   // 캐릭터 고유 스킬(꿀떡이 삼키기, 까부리 뿔 운반). 끄면 둘 다 일반 운반만 함
  },

  // 알 둥지(맵에 하나). E로 꺼내기 시작 → 게이지가 차면 알이 하나씩 바닥으로 튀어나옴
  nest: {
    smallCount: 6,         // 둥지 안 작은 알 수
    bigCount: 2,           // 둥지 안 큰 알 수
    radius: 44,            // 둥지 크기(이 안에 들어가서 E)
    extractTime: 3,        // 알 하나 꺼내는 데 걸리는 시간(초)
    checksMin: 1,          // 알 하나 꺼낼 때 타이밍 체크 최소 횟수
    checksMax: 2,          // 최대 횟수
    popSpeed: 170,         // 꺼낸 알이 튀어나가는 속도
  },

  // 타이밍 체크(데드 바이 데이라이트 발전기 체크 방식): 바늘이 표시 구간에 있을 때 E
  skillCheck: {
    duration: 1.1,         // 바늘이 한 바퀴 도는 시간(초) — 안 누르고 지나가면 실패
    zoneDeg: 55,           // 성공 구간 크기(도)
    greatDeg: 14,          // 대성공 구간(성공 구간 앞쪽 끝) 크기(도)
    greatBonus: 0.15,      // 대성공 시 진행도 보너스
    failPenalty: 0.25,     // 실패 시 진행도 감소
    failNoise: 260,        // 실패 시 소음 크기(자는 우두머리가 깰 수 있음)
  },

  // 알을 오래 들고 있으면 점점 느려지다가 떨어뜨림(피로도 0~1)
  carry: {
    fatigueTime: 10,       // 들고 있을 때 피로도가 0→1이 되는 시간(초) — 1이면 떨어뜨림
    recoverTime: 4,        // 내려놓았을 때 1→0으로 회복되는 시간(초)
    slowMax: 0.5,          // 피로도 1일 때 추가 감속(0.5 = 절반 속도)
  },

  // 큰 알: 들지 않고 뒤에서 밀어서 굴림
  bigEgg: {
    pushSpeedMul: 0.7,     // 미는 몬스터 속도 대비 알이 굴러가는 속도(미는 동안 몬스터도 이 배율로 느려짐)
    pushMaxSpeed: 170,     // 둘이 같이 밀 때 최대 속도
    pushAngle: 0.45,       // 알 쪽으로 향하는 정도(0~1) 이상이어야 밀림
    rollFriction: 0.05,    // 손을 떼면 굴러가다 멈추는 정도(작을수록 멀리 굴러감)
  },

  egg: {
    smallValue: 1,
    bigValue: 3,
    crackValueLoss: 0.25,  // 금 1단계당 가치 감소 비율
    maxCracks: 3,          // 이 단계에서 깨짐
    impactSpeed: 330,      // 이 속도 이상으로 부딪히면 금 1단계 (충격 임계 속도)
    bumpNoiseSpeed: 200,   // 이 속도 이상으로 부딪히면 "쿵" 소음(금은 안 감)
    crackCooldown: 0.35,   // 금이 연속으로 가지 않게 하는 최소 간격
    pickupRadius: 26,      // 몸 가장자리에서 이 거리 안의 알을 주울 수 있음
    carrySmallSlow: 0.15,  // 작은 알 운반 감속(0.15 = 15% 느려짐)
    throwSpeed: 380,       // 던지기 수평 속도
    throwUpSpeed: 320,     // 던지기 위로 뜨는 속도(가짜 높이)
    throwGravity: 1000,    // 가짜 높이 중력
    landCrackSpeed: 300,   // 착지할 때 낙하 속도가 이 이상이면 금 1단계
    catchRadius: 26,       // 몸 가장자리에서 이 거리 안이면 공중의 알을 받음
    catchMaxHeight: 60,    // 이 높이 아래로 내려온 알만 받을 수 있음
    bounce: 0.45,          // 던진 알이 바닥에 튕길 때 남는 높이 속도 비율
    bounceMinSpeed: 90,    // 이보다 약하게 떨어지면 더 안 튀고 구르기 시작
    rollFriction: 0.025,   // 작은 알이 구를 때 멈추는 정도(작을수록 멀리 굴러감)
    wallBounce: 0.55,      // 벽에 튕길 때 남는 속도 비율
    crackOnEnemyHit: true, // 던진 알이 괴수에 맞으면 알도 금 1단계(기절시키는 대가)
  },

  // 수풀(맵 글자 b): 숨기
  bush: {
    sightMul: 0.2,         // 수풀 속 몬스터를 볼 때 괴수의 의심 상승 배율(0.2 = 5배 느리게 알아챔)
    closeRange: 60,        // 괴수 몸에서 이 거리 안이면 수풀 속이라도 평소처럼 보임
    revealRange: 90,       // 내 몬스터가 이 거리 안에 가야 수풀 속 괴수가 보임
    monsterAlpha: 0.55,    // 수풀에 숨은 내 몬스터의 투명도(숨었다는 표시)
  },

  // 던지기로 적 기절시키기(알·돌멩이 공통)
  stone: {
    radius: 12,            // 돌멩이 크기(실행 중 변경 불가)
    enemyStunTime: 2.5,    // 명중한 괴수가 기절하는 시간(초)
    bossStunTime: 1.5,     // 우두머리 괴수가 기절하는 시간(초)
    hitHeight: 90,         // 이 높이 아래로 날아가는 물건만 괴수에 맞음(괴수가 크니까 넉넉히)
    hitNoise: 110,         // 명중 소리 크기(주변 괴수가 들을 수 있음)
    angerSuspicion: 80,    // 기절에서 깬 괴수의 의심(던진 곳으로 찾아옴)
  },

  kkuldduk: {
    swallowLimit: 20,      // 삼킨 채 버틸 수 있는 시간 (삼킴 제한 시간)
    swallowWarn: 15,       // 이 시간부터 몸이 떨리며 경고
    spitNoise: 50,         // 스스로 뱉을 때 소음
    forcedSpitNoise: 280,  // 강제로 뱉을 때 소음
  },

  kkaburi: {
    hornBumpSpeed: 150,    // 알을 뿔에 낀 채 벽에 이 속도 이상으로 부딪히면 금
  },

  noise: {
    rippleDuration: 0.6,   // 소음 파동 표시 시간
    pickup: 60,            // 알 줍기 소음
    bump: 90,              // 알 쿵 소음
    crack: 170,            // 금 갈 때 소음
    break: 340,            // 깨질 때 소음
  },

  // 적 괴수(스펙의 "경비"). 평소엔 잠자리에서 자다가, 소음에 깨거나 푹 자고 일어나면 로밍한다.
  guard: {
    radius: 32,            // 몸 크기(실행 중 변경 불가)
    patrolSpeed: 80,       // 로밍 속도
    suspectSpeed: 110,
    chaseSpeed: 170,       // 추격 속도
    searchSpeed: 75,
    visionAngle: 80,       // 시야 각도(도) — 화면엔 표시하지 않음(눈이 향한 쪽)
    visionRange: 240,      // 시야 거리
    hearingRadius: 50,     // 소음 파동이 괴수 몸(+이 거리)에 닿으면 들음
    hearingMul: 0.35,      // 깨어 있을 때: 들은 소음 크기 × 이 값만큼 의심 상승
    sightRate: 110,        // 시야 안 몬스터 1마리당 초당 의심 상승 (의심 상승률)
    carryingMul: 1.5,      // 알을 든 몬스터는 이만큼 더 빨리 의심
    suspectThreshold: 30,  // 이 이상이면 의심("?")
    decayRate: 12,         // 아무것도 안 보일 때 초당 의심 감소
    searchTime: 5,         // 수색 시간
    gloatTime: 1.5,        // 잡은 뒤 의기양양 정지 시간
    // --- 잠 ---
    sleepMin: 18,          // 한 번 자는 시간(최소)
    sleepMax: 32,          // 한 번 자는 시간(최대)
    roamMin: 20,           // 깨어나서 로밍하는 시간(최소) — 끝나면 잠자리로 돌아가 잔다
    roamMax: 35,           // 깨어나서 로밍하는 시간(최대)
    wakeThreshold: 50,     // 잠든 괴수의 "깸 게이지"가 이만큼 차면 깬다
    sleepHearingMul: 0.3,  // 잘 때: 들은 소음 크기 × 이 값만큼 깸 게이지 상승
    wakeDecay: 5,          // 깸 게이지 초당 감소(조용하면 다시 곯아떨어짐)
    groggyTime: 1.0,       // 깨어나서 정신 차리는 시간
  },

  tension: {
    pickupSmall: 8,        // 작은 알 처음 줍기
    pickupBig: 15,         // 큰 알 처음 밀기
    chaseStart: 10,        // 경비 추격 시작
    noiseMul: 0.02,        // 소음 크기 × 이 값
    eggBreak: 10,          // 알 깨짐
  },

  // 우두머리 괴수: 둥지 옆(맵 글자 K)에서 잔다. 소음·접촉·소란도 100으로 깨어나 일정 시간 사냥 후 다시 잔다.
  chaser: {
    wakeThreshold: 100,    // 깸 게이지가 이만큼 차면 깬다
    sleepHearingMul: 0.3,  // 잘 때 들은 소음 크기 × 이 값만큼 깸 게이지 상승
    wakeDecay: 3,          // 조용하면 초당 깸 게이지 감소
    hearingRadius: 60,     // 소음 파동이 몸(+이 거리)에 닿으면 들음
    groggyTime: 1.5,       // 깨어나서 포효하는 시간
    speed: 215,            // 돌진 속도(발견 후)
    stalkSpeed: 110,       // 발견 전: 알 냄새를 따라 슬금슬금 다가오는 속도
    sightRange: 320,       // 발견 게이지가 오르는 거리(벽에 가리면 안 오름)
    awareRate: 30,         // 보이는 몬스터 1마리당 초당 발견 게이지 상승(가까울수록 최대 2배)
    awareDecay: 10,        // 아무도 안 보이면 초당 감소
    lurkRange: 380,        // 수풀 속에서 알 가진 몬스터가 이 거리 안이면 멈춰서 매복
    lurkMax: 5,            // 한 번 매복하면 최대 이 시간(초)만 기다리고 다시 움직임
    lurkCooldown: 8,       // 매복을 풀고 나서 다시 매복할 수 있기까지(초)
    duration: 60,          // 깨어 있는 시간 — 끝나면 잠자리로 돌아가 다시 잔다
    radius: 40,
  },

  run: {
    timeLimit: 300,        // 제한 시간(초)
    quota: 6,              // 할당량
    exitHoldTime: 1.5,     // 조기 탈출: 출구에서 E 를 누르고 있어야 하는 시간
  },

  companion: {
    passFatigue: 0.6,      // 동료가 알을 들고 이 피로도가 되면 나에게 던져서 패스
    passRange: 280,        // 패스할 수 있는 최대 거리
    putDownFatigue: 0.92,  // 패스 못 하면 이 피로도에서 살며시 내려놓음(떨어뜨림 소음 방지)
    stoneRange: 260,       // 돌을 든 동료가 이 거리 안의 깨어 있는 괴수에게 던짐
    stoneCooldown: 1.2,    // 동료 돌 던지기 최소 간격(초)
    pushAssist: true,      // 내가 큰 알을 밀면 동료가 같은 방향 뒤에서 같이 밀기
    stonePickRange: 130,   // 동료가 멈춰 있을 때(기다려 / 내 옆에 서 있음) 이 거리 안의 돌은 직접 주워 듦
    trailSpacing: 10,      // 발자국 기록 간격
    stopDistance: 70,      // 조작 몬스터와 이 거리 안이면 멈춤
    teleportDelay: 3,      // 이 시간 이상 멀어져 있으면(화면 밖일 때) 순간이동
    farDistance: 260,      // "멀어졌다"의 기준 거리
  },

  debug: {
    showCones: false,      // 괴수 시야 원뿔 표시(평소엔 숨김)
    showSuspicion: false,  // 의심 게이지 숫자 표시
  },
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// 게임에서 실제로 읽는 설정(튜닝 패널이 수정하는 대상)
export const CONFIG = deepClone(DEFAULT_CONFIG);

export function resetConfig() {
  applyConfig(DEFAULT_CONFIG);
}

// 붙여넣은 JSON 등으로 덮어쓰기(알고 있는 키만)
export function applyConfig(src) {
  for (const [sec, vals] of Object.entries(src)) {
    if (!CONFIG[sec] || typeof vals !== 'object') continue;
    for (const [k, v] of Object.entries(vals)) {
      if (k in CONFIG[sec] && typeof v === typeof CONFIG[sec][k]) {
        CONFIG[sec][k] = typeof v === 'object' ? deepClone(v) : v;
      }
    }
  }
}
