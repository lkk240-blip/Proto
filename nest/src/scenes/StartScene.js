import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { getRunCount } from '../systems/RunLog.js';

// 시작 화면: 제목, 모드 선택(1인/2인), 조작 키 카드. 한 화면에 조작법이 다 보이게.
export default class StartScene extends Phaser.Scene {
  constructor() {
    super('Start');
  }

  create() {
    const W = CONFIG.world.viewWidth, H = CONFIG.world.viewHeight;
    this.mode = this.registry.get('mode') || 'solo';
    const st = (size, color = '#ffffff', extra = {}) => ({ fontFamily: 'sans-serif', fontSize: `${size}px`, color, ...extra });

    this.add.rectangle(W / 2, H / 2, W, H, 0x16181e);
    // 장식: 흔들리는 알
    const egg = this.add.ellipse(W / 2 - 250, 62, 40, 52, 0xfff1d0).setStrokeStyle(3, 0x3a3226);
    this.tweens.add({ targets: egg, angle: { from: -12, to: 12 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(W / 2 + 10, 50, 'NEST', st(64, '#ffd166', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 })).setOrigin(0.5);
    this.add.text(W / 2 + 10, 100, '알 운반 하이스트 — 프로토타입', st(20, '#cccccc')).setOrigin(0.5);

    // 목표 요약
    this.add.text(W / 2, 140,
      `둥지에서 알을 꺼내 숲 출구(초록 칸)로 옮기세요. 둥지 옆엔 우두머리 괴수가 자고 있어요.\n${CONFIG.run.timeLimit / 60}분 안에 가치 ${CONFIG.run.quota} 이상 · 알은 충격 3번이면 깨짐 · 체력 ${CONFIG.monster.maxHp}칸, 둘 다 쓰러지면 실패`,
      st(16, '#ffffff', { align: 'center', lineSpacing: 4 })).setOrigin(0.5);

    // 모드 선택
    this.soloBtn = this.modeButton(W / 2 - 150, 206, '1인 (기본)', 'solo');
    this.duoBtn = this.modeButton(W / 2 + 150, 206, '2인 (한 화면)', 'duo');

    // 조작 카드
    this.card = this.add.container(0, 0);
    this.drawCard();

    this.startText = this.add.text(W / 2, H - 58, 'Enter 또는 Space: 시작     ← →  또는 1 / 2: 모드 선택', st(22, '#5dff9a', { fontStyle: 'bold' })).setOrigin(0.5);
    this.tweens.add({ targets: this.startText, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
    this.add.text(W / 2, H - 22, `누적 ${getRunCount()}판 플레이   ·   \` 키: 튜닝 패널(수치 조정)`, st(14, '#777777')).setOrigin(0.5);

    const kb = this.input.keyboard;
    kb.on('keydown-ONE', () => this.setMode('solo'));
    kb.on('keydown-TWO', () => this.setMode('duo'));
    kb.on('keydown-LEFT', () => this.setMode('solo'));
    kb.on('keydown-RIGHT', () => this.setMode('duo'));
    kb.on('keydown-ENTER', () => this.go());
    kb.on('keydown-SPACE', () => this.go());
    this.setMode(this.mode);
  }

  modeButton(x, y, label, mode) {
    const bg = this.add.rectangle(x, y, 250, 56, 0x2a2e38).setStrokeStyle(3, 0x444a58).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: 'sans-serif', fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerup', () => { if (this.mode === mode) this.go(); else this.setMode(mode); });
    return { bg, t };
  }

  setMode(mode) {
    this.mode = mode;
    this.registry.set('mode', mode);
    for (const [btn, m] of [[this.soloBtn, 'solo'], [this.duoBtn, 'duo']]) {
      const on = m === mode;
      btn.bg.setFillStyle(on ? 0x2f6fd6 : 0x2a2e38).setStrokeStyle(3, on ? 0x9fc3ff : 0x444a58);
      btn.t.setColor(on ? '#ffffff' : '#9097a3');
    }
    this.drawCard();
  }

  drawCard() {
    const W = CONFIG.world.viewWidth;
    const c = this.card;
    c.removeAll(true);
    const x0 = W / 2 - 520, y0 = 256, w = 1040, h = 340;
    c.add(this.add.rectangle(x0 + w / 2, y0 + h / 2, w, h, 0x20232b).setStrokeStyle(2, 0x3a3f4b));
    const key = (x, y, k, desc) => {
      const kw = Math.max(44, k.length * 12 + 18);
      c.add(this.add.rectangle(x + kw / 2, y + 13, kw, 28, 0x3a3f4b).setStrokeStyle(2, 0x60687a));
      c.add(this.add.text(x + kw / 2, y + 13, k, { fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
      c.add(this.add.text(x + kw + 12, y + 13, desc, { fontFamily: 'sans-serif', fontSize: '16px', color: '#dddddd' }).setOrigin(0, 0.5));
    };
    const head = (x, y, t, color = '#ffd166') => c.add(this.add.text(x, y, t, { fontFamily: 'sans-serif', fontSize: '18px', color, fontStyle: 'bold' }));

    if (this.mode === 'solo') {
      head(x0 + 30, y0 + 18, '조작 (혼자서 몬스터 2마리를 번갈아 조작)');
      const L = [['WASD', '이동'], ['Space', `대시 (쿨타임 ${CONFIG.monster.dashCooldown}초, 소음!)`], ['E', '줍기 / 내려놓기 · 둥지 안: 알 꺼내기'], ['E (체크 뜨면)', '바늘이 구간에 있을 때! 실패하면 큰 소음'], ['R', `작은 알·돌멩이 던지기 (괴수 명중 시 기절)`]];
      const R = [['Tab', '조작 몬스터 교체'], ['Q', '동료에게 따라와 ↔ 기다려'], ['큰 알', '뒤에서 걸어 밀면 굴러감(둘이 밀면 빠름)'], ['E 누르고 있기', '쓰러진 동료 옆에서 부활'], ['Esc / `', '일시정지 / 튜닝 패널']];
      L.forEach(([k, d], i) => key(x0 + 30, y0 + 56 + i * 40, k, d));
      R.forEach(([k, d], i) => key(x0 + 540, y0 + 56 + i * 40, k, d));
    } else {
      head(x0 + 30, y0 + 18, 'P1 (꿀떡이)');
      head(x0 + 540, y0 + 18, 'P2 (까부리)');
      const P1 = [['WASD', '이동'], ['Space', '대시'], ['E', '줍기 / 내려놓기 / 부활'], ['R', '던지기']];
      const P2 = [['방향키', '이동'], ['오른쪽 Ctrl', '대시'], ['Enter', '줍기 / 내려놓기 / 부활'], ['오른쪽 Shift', '던지기']];
      P1.forEach(([k, d], i) => key(x0 + 30, y0 + 56 + i * 40, k, d));
      P2.forEach(([k, d], i) => key(x0 + 540, y0 + 56 + i * 40, k, d));
    }
    // 규칙 요약
    const tips = [
      '알을 오래 들면 점점 느려지다 떨어뜨림(발밑 노란 막대) · 던진 알은 통통 튀고 굴러감 · 받지 못하면 착지하며 금이 감',
      '큰 알(가치 3): 혼자 E = 질질 끌기(아주 느리고 시끄러움) · 둘이 붙어서 E = 공동 운반 · 노란 파동 = 소음',
      '괴수: Zzz = 잠(소음이 쌓이면 깸, 보라 게이지) · ? = 의심 · ! = 추격 · 우두머리는 소음·접촉·소란도 100으로 깸',
      '밝은 초록 수풀에 숨으면 괴수가 아주 늦게 알아챔 · 수풀 속 괴수는 가까이 가야 보임(잎이 흔들리면 뭔가 있다는 뜻)',
    ];
    tips.forEach((t, i) => c.add(this.add.text(x0 + 30, y0 + 256 + i * 25, t, { fontFamily: 'sans-serif', fontSize: '14px', color: '#9fb0c8' })));
  }

  go() {
    this.scene.start('Game', { mode: this.mode });
  }
}
