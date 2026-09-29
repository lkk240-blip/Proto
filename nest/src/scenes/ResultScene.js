import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { buildRecordText, copyText } from '../systems/RunLog.js';

// 결과 화면: 성공/실패, 통계, 기록 복사, 테스터 질문, 다시 하기
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.r = data;
  }

  create() {
    const r = this.r;
    const s = r.stats;
    const W = CONFIG.world.viewWidth, H = CONFIG.world.viewHeight;
    this.add.rectangle(W / 2, H / 2, W, H, 0x14161b, 1);
    const st = (size, color = '#ffffff', extra = {}) => ({ fontFamily: 'sans-serif', fontSize: `${size}px`, color, ...extra });

    this.add.text(W / 2, 50, r.success ? '성공!' : '실패...', st(56, r.success ? '#5dff9a' : '#ff6b6b', { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 100, `${r.reason}   ·   확보 가치 ${r.secured.toFixed(2)} / 할당량 ${r.quota}   ·   누적 ${r.runNumber}판째`, st(18, '#cccccc')).setOrigin(0.5);

    const rows = [
      ['확보 가치', r.secured.toFixed(2)],
      ['입금한 알 수', s.deposited],
      ['금 간 횟수', s.cracks],
      ['깨뜨린 알 수', s.broken],
      ['경비에게 잡힌 횟수', s.caught],
      ['추격자 등장', s.chaser ? '예' : '아니오'],
      ['교체 횟수', s.swaps],
      ['공동 운반 시간', `${s.coopTime.toFixed(1)}초`],
      ['질질 끌기 시간', `${s.dragTime.toFixed(1)}초`],
      ['삼킨 시간', `${s.swallowTime.toFixed(1)}초`],
      ['플레이 시간', `${Math.floor(s.playTime / 60)}분 ${Math.round(s.playTime % 60)}초`],
    ];
    const half = Math.ceil(rows.length / 2);
    rows.forEach(([k, v], i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const x = W / 2 - 330 + col * 360;
      const y = 150 + row * 32;
      this.add.text(x, y, k, st(19, '#aab0bb'));
      this.add.text(x + 290, y, String(v), st(19, '#ffffff', { fontStyle: 'bold' })).setOrigin(1, 0);
    });

    // 테스터 질문
    const qy = 360;
    this.add.text(W / 2, qy, '테스터 질문 — 기록을 복사해서 답과 함께 보내 주세요', st(18, '#ffd166', { fontStyle: 'bold' })).setOrigin(0.5);
    [
      '1. 큰 알을 옮기는 게 재밌었나요, 답답했나요?',
      '2. 알이 깨질 때 웃겼나요, 짜증났나요?',
      '3. 몇 판 하고 그만뒀고, 왜 그만뒀나요?',
    ].forEach((q, i) => this.add.text(W / 2 - 300, qy + 34 + i * 30, q, st(18, '#eeeeee')));

    const copyBtn = this.button(W / 2 - 230, 560, '기록 복사', 0x2f6fd6, async () => {
      const ok = await copyText(buildRecordText(r));
      this.toast(ok ? '클립보드에 복사했어요!' : '자동 복사가 막혀서 복사 창을 열었어요');
    });
    this.button(W / 2, 560, '다시 하기 (R)', 0x2ea85a, () => this.restart());
    this.button(W / 2 + 230, 560, '시작 화면 (M)', 0x555b66, () => this.toStart());
    this.toastText = this.add.text(W / 2, 620, '', st(18, '#9fe8ff')).setOrigin(0.5);
    this.add.text(W / 2, H - 24, '복사되는 내용: 위 통계 + 현재 설정(config) 값 + 누적 판 수 + 질문 칸', st(14, '#777777')).setOrigin(0.5);

    this.input.keyboard.on('keydown-R', () => this.restart());
    this.input.keyboard.on('keydown-M', () => this.toStart());
    this.copyBtn = copyBtn;
  }

  button(x, y, label, color, onClick) {
    const w = 200, h = 54;
    const bg = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(3, 0x000000).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setScale(1.05));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerup', onClick);
    return { bg, t };
  }

  toast(msg) {
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 2000, duration: 500 });
  }

  restart() {
    this.scene.start('Game', { mode: this.r.mode });
  }

  toStart() {
    if (this.scene.get('Start')) this.scene.start('Start');
    else this.restart();
  }
}
