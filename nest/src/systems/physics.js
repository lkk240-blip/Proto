// Matter 충돌 분류(비트). 어떤 것끼리 부딪힐지 정한다.
export const CAT = {
  WALL: 0x0001,
  MONSTER: 0x0002,
  EGG: 0x0004,
  GUARD: 0x0008,
};

export const MASK = {
  WALL: 0xffff,
  MONSTER: CAT.WALL | CAT.MONSTER | CAT.EGG,
  EGG: CAT.WALL | CAT.MONSTER | CAT.EGG,
  GUARD: CAT.WALL, // 경비는 벽에만 막히고, 몬스터와의 접촉은 거리로 판정(잡기)
  NONE: 0,
};

let groupSeq = 0;
// 서로 부딪히지 않게 묶을 때 쓰는 음수 그룹 번호(공동 운반·끌기용)
export function newNoCollideGroup() {
  groupSeq -= 1;
  return groupSeq;
}
