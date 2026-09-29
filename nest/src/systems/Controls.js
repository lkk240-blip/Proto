import Phaser from 'phaser';

// 키 입력을 "의도"(이동 방향, 대시, 줍기...)로 바꿔 주는 층.
// 몬스터는 키를 직접 보지 않고 이 객체만 읽는다 → 나중에 2인 모드·AI 동료를 같은 방식으로 붙일 수 있다.

const KEYMAPS = {
  p1: { up: 'W', down: 'S', left: 'A', right: 'D', dash: 'SHIFT', grab: 'E', throw: 'SPACE', swallow: 'R' },
};

export class KeyboardControls {
  constructor(scene, mapName = 'p1') {
    const km = KEYMAPS[mapName];
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {};
    for (const [action, keyName] of Object.entries(km)) {
      this.keys[action] = scene.input.keyboard.addKey(K[keyName], true, false);
    }
  }

  // 정규화된 이동 방향 (대각선도 속도가 같도록)
  getMove() {
    const k = this.keys;
    let x = (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0);
    let y = (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }

  // 이번 프레임에 "눌린 순간"인지
  justPressed(action) {
    const key = this.keys[action];
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }
}
