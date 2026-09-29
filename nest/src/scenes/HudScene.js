import Phaser from 'phaser';
import { CONFIG } from '../config.js';

// 화면 고정 UI(카메라 줌과 무관하게 그리려고 별도 씬으로 분리).
// 타이머, 확보 가치/할당량, 소란도 게이지, 몬스터 상태, 화면 가장자리 화살표, 경고 연출, 일시정지 화면.
const FONT = 'sans-serif';

export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    this.gs = this.scene.get('Game');
    const W = CONFIG.world.viewWidth, H = CONFIG.world.viewHeight;
    const st = (size, color = '#ffffff', extra = {}) => ({ fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4, ...extra });

    this.g = this.add.graphics();
    this.arrows = this.add.graphics();
    this.timer = this.add.text(20, 12, '', st(30, '#ffffff', { fontStyle: 'bold' }));
    this.securedText = this.add.text(20, 50, '', st(18));
    this.tensionLabel = this.add.text(W / 2, 14, '소란도', st(14, '#ffcf99')).setOrigin(0.5, 0);
    this.tensionText = this.add.text(W / 2, 36, '', st(14)).setOrigin(0.5, 0);
    this.monsterText = this.add.text(W - 20, 12, '', st(16, '#ffffff', { align: 'right', lineSpacing: 4 })).setOrigin(1, 0);
    this.hint = this.add.text(W / 2, H - 14, '', st(14, '#d0d0d0')).setOrigin(0.5, 1);
    this.exitText = this.add.text(W / 2, H - 70, '', st(20, '#5dff9a', { fontStyle: 'bold' })).setOrigin(0.5);
    this.banner = this.add.text(W / 2, H * 0.32, '', st(52, '#ff4d4d', { fontStyle: 'bold', strokeThickness: 8 })).setOrigin(0.5).setAlpha(0);
    this.flash = this.add.rectangle(W / 2, H / 2, W, H, 0xff0000, 0).setDepth(-1);
    this.arrowLabels = [];

    this.pauseLayer = this.add.container(0, 0).setVisible(false).setDepth(100);
    this.pauseLayer.add([
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65),
      this.add.text(W / 2, H / 2 - 40, '일시정지', st(48, '#ffffff', { fontStyle: 'bold' })).setOrigin(0.5),
      this.add.text(W / 2, H / 2 + 20, 'Esc: 계속하기     M: 시작 화면으로', st(20, '#dddddd')).setOrigin(0.5),
    ]);
  }

  // GameScene 이 부르는 연출
  showBanner(text, color = '#ff4d4d') {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.3);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1800, duration: 600 });
  }

  redFlash() {
    this.tweens.add({ targets: this.flash, fillAlpha: { from: 0.35, to: 0 }, duration: 250, repeat: 3 });
  }

  setPaused(p) {
    this.pauseLayer.setVisible(p);
  }

  update() {
    const gs = this.gs;
    if (!gs || !gs.monsters) return;
    const W = CONFIG.world.viewWidth;
    const g = this.g;
    g.clear();

    // --- 타이머 & 확보 가치 ---
    const left = Math.max(0, gs.timeLeft());
    const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    this.timer.setText(`${mm}:${String(ss).padStart(2, '0')}`);
    this.timer.setColor(left < 30 ? (Math.floor(left * 2) % 2 ? '#ff4d4d' : '#ffffff') : '#ffffff');
    const q = CONFIG.run.quota;
    this.securedText.setText(`확보 가치 ${gs.secured.toFixed(2)} / 할당량 ${q}`);
    const pw = 220, px = 20, py = 76;
    g.fillStyle(0x000000, 0.6).fillRect(px - 2, py - 2, pw + 4, 12);
    g.fillStyle(gs.secured >= q ? 0x5dff9a : 0x2ecc71, 1).fillRect(px, py, pw * Math.min(1, gs.secured / q), 8);

    // --- 소란도 ---
    const tw = 360, tx = W / 2 - tw / 2, ty = 56;
    g.fillStyle(0x000000, 0.6).fillRect(tx - 3, ty - 3, tw + 6, 18);
    const t = gs.tension / 100;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffc16b), Phaser.Display.Color.ValueToColor(0xff2d2d), 100, t * 100);
    g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).fillRect(tx, ty, tw * t, 12);
    if (gs.chaser && !gs.chaser.gone) this.tensionText.setText(`우두머리 괴수 출현! 떠나기까지 ${Math.ceil(gs.chaser.remaining)}초`).setColor('#ff5d5d');
    else if (gs.stats.chaser) this.tensionText.setText('우두머리 괴수가 떠났다').setColor('#aaaaaa');
    else this.tensionText.setText(`${gs.tension.toFixed(0)} / 100  (100이 되면 우두머리 괴수 등장)`).setColor('#ffffff');
    this.tensionText.y = ty + 16;

    // --- 몬스터 상태 ---
    const lines = gs.monsters.map((m) => {
      const dash = m.dashCooldown > 0 ? `대시 ${m.dashCooldown.toFixed(1)}s` : '대시 준비';
      let st = '';
      if (m.stunned) st = '기절!';
      else if (m.coop) st = '공동 운반';
      else if (m.dragging) st = '질질 끌기';
      else if (m.carrying) st = m.carrying.isStone ? '돌멩이' : m.carryMode === 'horn' ? '뿔에 알' : '알 들고';
      if (m.belly) st += (st ? ' + ' : '') + `삼킴 ${Math.ceil(CONFIG.kkuldduk.swallowLimit - m.bellyTime)}s`;
      const who = gs.mode === 'duo' ? `${m.tag} ` : (m.controlled ? '▶ ' : '   ');
      return `${who}${m.type.name}  ${dash}${st ? '  [' + st + ']' : ''}`;
    });
    if (gs.mode === 'solo') lines.push(`동료: ${gs.companion.mode === 'wait' ? '기다려' : '따라와'}`);
    this.monsterText.setText(lines.join('\n'));

    // --- 조작 힌트 ---
    this.hint.setText(gs.mode === 'duo'
      ? 'P1: WASD 이동 · 왼Shift 대시 · E 줍기 · Space 던지기      P2: 방향키 · 오른Ctrl 대시 · Enter 줍기 · 오른Shift 던지기      Esc 일시정지'
      : 'WASD 이동 · Shift 대시 · E 줍기/내려놓기 · Space 던지기(괴수에 맞히면 기절) · Tab 교체 · Q 따라와/기다려 · Esc 일시정지 · ` 튜닝');

    // --- 조기 탈출 ---
    if (gs.exitHold > 0) {
      const p = gs.exitHold / CONFIG.run.exitHoldTime;
      this.exitText.setText(`탈출 중... ${Math.round(p * 100)}%`);
      g.fillStyle(0x000000, 0.6).fillRect(W / 2 - 101, CONFIG.world.viewHeight - 52, 202, 12);
      g.fillStyle(0x5dff9a, 1).fillRect(W / 2 - 100, CONFIG.world.viewHeight - 51, 200 * p, 10);
    } else if (gs.bothInExit) {
      this.exitText.setText('두 마리 모두 출구! E를 길게 누르면 조기 탈출');
    } else {
      this.exitText.setText('');
    }

    this.drawArrows();
  }

  // 화면 밖 알·동료·출구·추격자를 화면 가장자리 화살표로
  drawArrows() {
    const gs = this.gs;
    const a = this.arrows;
    a.clear();
    const cam = gs.cameras.main;
    const view = cam.worldView;
    const W = CONFIG.world.viewWidth, H = CONFIG.world.viewHeight;
    const targets = [];
    const ex = gs.map.exitRect;
    if (ex) targets.push({ x: ex.x + ex.w / 2, y: ex.y + ex.h / 2, color: 0x2ecc71, label: '출구' });
    if (gs.mode === 'solo') {
      const c = gs.monsters.find((m) => m !== gs.player);
      targets.push({ x: c.x, y: c.y, color: c.type.color === 0xf2f2f2 ? 0xdddddd : 0xc48a4a, label: c.type.name });
    } else {
      for (const m of gs.monsters) targets.push({ x: m.x, y: m.y, color: 0x7cf0ff, label: m.tag });
    }
    for (const e of gs.eggs.list) {
      if (e.isStone || e.state === 'carried' || e.state === 'swallowed' || e.state === 'coop' || e.state === 'drag') continue;
      targets.push({ x: e.x, y: e.y, color: e.big ? 0x9fd0ff : 0xfff1a8, label: e.big ? '큰 알' : '알', small: true });
    }
    if (gs.chaser && !gs.chaser.gone) targets.push({ x: gs.chaser.x, y: gs.chaser.y, color: 0xff3030, label: '우두머리' });

    // 화살표가 놓일 테두리(위쪽 HUD, 아래쪽 힌트 줄은 피함)
    const box = { l: 26, r: W - 26, t: 118, b: H - 44 };
    const cx = W / 2, cy = (box.t + box.b) / 2;
    let li = 0;
    for (const t of targets) {
      if (t.x >= view.x && t.x <= view.right && t.y >= view.y && t.y <= view.bottom) continue;
      const sx = (t.x - view.x) * cam.zoom, sy = (t.y - view.y) * cam.zoom;
      const ang = Math.atan2(sy - cy, sx - cx);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const kx = dx > 0 ? (box.r - cx) / dx : dx < 0 ? (box.l - cx) / dx : Infinity;
      const ky = dy > 0 ? (box.b - cy) / dy : dy < 0 ? (box.t - cy) / dy : Infinity;
      const k = Math.min(kx, ky);
      const ax = cx + dx * k, ay = cy + dy * k;
      const s = t.small ? 9 : 13;
      a.fillStyle(t.color, 0.95);
      a.lineStyle(2, 0x000000, 0.9);
      const p1 = { x: ax + dx * s, y: ay + dy * s };
      const p2 = { x: ax + Math.cos(ang + 2.4) * s, y: ay + Math.sin(ang + 2.4) * s };
      const p3 = { x: ax + Math.cos(ang - 2.4) * s, y: ay + Math.sin(ang - 2.4) * s };
      a.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      a.strokeTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      if (!this.arrowLabels[li]) {
        this.arrowLabels[li] = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
      }
      this.arrowLabels[li].setText(t.label).setPosition(ax - dx * 16, ay - dy * 16).setVisible(true);
      li++;
    }
    for (; li < this.arrowLabels.length; li++) this.arrowLabels[li].setVisible(false);
  }
}
