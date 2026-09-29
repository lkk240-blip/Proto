// 키보드 상태 추적기.
// Phaser 기본 키 객체는 왼쪽/오른쪽 Shift·Ctrl 을 구분하지 못해서(2인 모드에 필요),
// 브라우저 이벤트의 event.code 를 직접 읽는다.

// 브라우저 기본 동작(스크롤, 포커스 이동 등)을 막을 키
const PREVENT = new Set([
  'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote',
  'ShiftLeft', 'ShiftRight', 'ControlRight', 'Enter', 'Numpad0',
]);

class KeyState {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // 이번 프레임에 새로 눌린 키
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(code) { return this.down.has(code); }
  anyDown(codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }
  anyPressed(codes) { return codes.some((c) => this.pressed.has(c)); }
  // 게임 씬 update 끝에서 호출
  endFrame() { this.pressed.clear(); }
}

function isTyping(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

export const keys = new KeyState();

// 플레이어 조작 키 배치
export const KEYMAPS = {
  // 1인 모드: Shift 는 좌우 아무거나
  solo: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    dash: ['ShiftLeft', 'ShiftRight'], grab: ['KeyE'], throw: ['Space'], swallow: ['KeyR'],
  },
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    dash: ['ShiftLeft'], grab: ['KeyE'], throw: ['Space'], swallow: ['KeyR'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    dash: ['ControlRight'], grab: ['Enter', 'NumpadEnter'], throw: ['ShiftRight'], swallow: ['Numpad0', 'Digit0'],
  },
};

// 게임패드(선택): 표준 배치 기준 A=줍기, B=던지기, X=삼키기, LB/RB=대시
const PAD_BUTTONS = { grab: [0], throw: [1], swallow: [2], dash: [4, 5] };

// 키 입력을 "의도"(이동 방향, 대시, 줍기...)로 바꿔 주는 객체.
// 몬스터는 이 인터페이스(getMove / justPressed / isHeld)만 읽는다 → AI 동료도 같은 모양으로 만든다.
export class PlayerControls {
  constructor(mapName, padIndex = -1) {
    this.map = KEYMAPS[mapName];
    this.padIndex = padIndex;
    this.padPrev = {};
    this.padPressed = {};
  }

  pollPad() {
    this.padPressed = {};
    if (this.padIndex < 0 || !navigator.getGamepads) return null;
    const pad = navigator.getGamepads()[this.padIndex];
    if (!pad) return null;
    for (const [action, idxs] of Object.entries(PAD_BUTTONS)) {
      const now = idxs.some((i) => pad.buttons[i] && pad.buttons[i].pressed);
      if (now && !this.padPrev[action]) this.padPressed[action] = true;
      this.padPrev[action] = now;
    }
    return pad;
  }

  // 씬이 프레임마다 한 번 호출
  update() {
    this.pad = this.pollPad();
  }

  getMove() {
    const m = this.map;
    let x = (keys.anyDown(m.right) ? 1 : 0) - (keys.anyDown(m.left) ? 1 : 0);
    let y = (keys.anyDown(m.down) ? 1 : 0) - (keys.anyDown(m.up) ? 1 : 0);
    if (this.pad && x === 0 && y === 0) {
      const ax = this.pad.axes[0] || 0, ay = this.pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.3) { x = ax; y = ay; }
      const b = this.pad.buttons;
      if (b[15]?.pressed) x = 1; if (b[14]?.pressed) x = -1;
      if (b[13]?.pressed) y = 1; if (b[12]?.pressed) y = -1;
    }
    // 대각선도 속도가 같도록 길이 1로 맞춤(스틱을 살짝 민 경우는 그대로)
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  justPressed(action) {
    return keys.anyPressed(this.map[action]) || !!this.padPressed[action];
  }

  isHeld(action) {
    if (keys.anyDown(this.map[action])) return true;
    return !!this.padPrev[action];
  }
}
