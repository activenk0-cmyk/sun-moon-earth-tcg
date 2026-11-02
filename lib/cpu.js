// ============================================================
// CPU（思考ロジック＋デッキ）
// ・メインフェーズは「ビームサーチ」でターン全体の行動順を先読みし、
//   一番良い並びの「最初の1手」を実行 → 実行後にまた考え直す。
// ・盤面評価は HP・場・手札・コスト・次ターンの被ダメージ（リーサル）を点数化。
// ・ターン終了時の効果（冥王星の乙女・セラフィム・ルクスの特殊勝利）も先取りして判断する。
// ・有力な候補は「生贄」と「相手の次のターンの攻撃」まで先読みして比べ直す。
// ・山札の並びや相手の手札の中身は見ない（ズルなし）。
// ・相手読み：相手の公開カード（場・墓地・生贄置き場・アビリティ）からデッキを推理し、
//   「持っていたらまずいキーカード」は持っている前提で相手ターンを先読みする
//   （ホーネット＋号令、時渡りの魔術師の連続ターン、審判の8点など）。
// ・相手の勝ち筋（リバースゲートの山札切れ・セラフィム）が近ければ攻め寄りに、
//   相手のOTKが近づいていれば安いディフェンダーを手札に残す。
// ============================================================
import * as E from "./engine";
import { SLOTS, cardsBySlot } from "./cards";
import { DECKS } from "./decks";

/* ============ CPUデッキ（予備） ============ */
// 通常は lib/decks.js のおすすめデッキを使う。こちらは decks.js が空の時の予備
// style: 思考のクセ（aggro=顔面寄り / control=守り寄り / balanced=標準）
export const CPU_DECKS = [
  {
    id: "tri_midrange", name: "三色ミッドレンジ", tier: 1, style: "balanced",
    selection: {
      "1": "sun_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control", name: "月光コントロール", tier: 1, style: "control",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "moon_witch",
    },
  },
  {
    id: "earth_legion", name: "大地の軍勢", tier: 2, style: "balanced",
    selection: {
      "1": "earth_goblin", "2a": "sun_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "earth_priest", "5": "earth_albert", "6": "earth_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "sun_aggro", name: "太陽アグロ", tier: 2, style: "aggro",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "sun_judgment", "7": "sun_hector", "8": "sun_aegis",
    },
  },
  {
    id: "earth_ramp", name: "大地ランプ", tier: 2, style: "balanced",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "moon_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_fortress", name: "月の要塞", tier: 3, style: "control",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "moon_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "earth_albert", "6": "earth_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "moon_trick", name: "月夜の奇術", tier: 3, style: "aggro",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "moon_crest", "3a": "sun_frog", "3b": "earth_order",
      "4": "moon_priest", "5": "moon_albert", "6": "moon_judgment", "7": "sun_hector", "8": "moon_witch",
    },
  },
];

export function pickCpuDeck() {
  return CPU_DECKS[Math.floor(Math.random() * CPU_DECKS.length)];
}

// 戦い方（デッキのコンセプトごと）
// face: 相手HPを削る重み / threat: 自分が受けるダメージを嫌う重み
// boost: 手札で大事に持っておくカード（生贄にしにくくなる）
// deckout: 山札切れ勝ちを狙う
// keys: コンボの核になるカード { カードID: 手札＋山札に最低限残す枚数 }
//   残り枚数を数えて、それを下回る生贄はしない（序盤の高コスト生贄は基本OK）
// combo: コンボの組み方（mainActions で「今は使わない」を判断する）
const STYLE = {
  aggro: { face: 1.3, threat: 0.8 },
  balanced: { face: 1.0, threat: 1.0 },
  control: { face: 0.85, threat: 1.3 },
  burn: { face: 1.4, threat: 0.75, boost: { pluto_judgment: 13, earth_abyss: 18 }, keys: { pluto_judgment: 2 } },
  // アグロセラフィム：セラフを生贄にしてHPを積み、地球のアステールでコピーを出す
  seraph: {
    face: 1.15, threat: 1.0, combo: "seraph",
    boost: { earth_albert: 13, pluto_seraph: 10 },
    keys: { earth_albert: 2 },
  },
  jabberwock: {
    face: 0.9, threat: 1.2, combo: "jabberwock",
    boost: { pluto_jabberwock: 17, moon_kamura: 15 },
    keys: { pluto_jabberwock: 2, moon_kamura: 2 },
  },
  witch: { face: 1.15, threat: 0.95, boost: { moon_witch: 17, sun_albert: 12 }, keys: { moon_witch: 2 } },
  // コントロールキマイラ：盤面を抑えながらキマイラを貯め、まとめて出してから時渡りの魔術師
  chimera: {
    face: 0.85, threat: 1.25, combo: "chimera",
    boost: { mercury_chimera: 15, moon_witch: 17 },
    keys: { mercury_chimera: 3, moon_witch: 2 },
  },
  // マーキュリノ：安いカードを重ねたターンにマーキュリノを出し、ゴブリンで戻して出し直して一気に削る
  // マーキュリノと水星のゴブリンは、その一気に削るターンまで温存する
  mercurino: {
    face: 1.25, threat: 0.9, combo: "mercurino",
    boost: { mercury_mercurino: 6, mercury_goblin: 5, earth_order: 6 },
    keys: { mercury_mercurino: 2, mercury_goblin: 2 },
  },
  // 月光ホーネット：除去で盤面を抑え、相手にディフェンダーがいない時に「ホーネット＋号令」で決める
  // sniper: 顔は最後まで狙わない・号令は1枚だけ持つ・ディフェンダーがいる時はホーネットを出さない
  hornet: {
    face: 0.5, threat: 1.3, combo: "hornet", sniper: true,
    boost: { mercury_hornet: 16, earth_order: 10, sun_goblin: 5 },
    keys: { mercury_hornet: 1, sun_goblin: 1 },
  },
  // ソニックバッチ：付いている間は即時召喚を積極的に使う
  sonic: {
    face: 1.3, threat: 0.8, hasteFirst: true,
    boost: { mercury_sonic: 10 },
    keys: { mercury_sonic: 2 },
  },
  deckout: {
    face: 0.6, threat: 1.45, deckout: true,
    boost: { mercury_gate: 22, moon_order: 9, moon_judgment: 11, moon_priest: 10 },
    keys: { mercury_gate: 2 },
  },
  landdes: {
    face: 1.0, threat: 1.05, combo: "landdes",
    boost: { mercury_albert: 12, earth_frog: 7 },
    keys: { mercury_albert: 2, earth_frog: 2 },
  },
  guardian: {
    face: 1.0, threat: 1.1,
    boost: { mercury_awakening: 11, mercury_microaegis: 9 },
    keys: { mercury_microaegis: 2 },
  },
};

// 戦い方の名前一覧（画面側でデッキの戦い方を選ぶのに使える）
export const CPU_STYLES = Object.keys(STYLE);

/* ============ カードの強さ評価 ============ */
const VALUE = {
  sun_goblin: 3, moon_goblin: 3, earth_goblin: 3,
  sun_maiden: 3, moon_maiden: 4, earth_maiden: 4,
  sun_crest: 6, moon_crest: 5, earth_crest: 4,
  sun_frog: 5.5, moon_frog: 5.5, earth_frog: 5.5,
  sun_order: 6, moon_order: 6, earth_order: 3,
  sun_priest: 9, moon_priest: 8.5, earth_priest: 8,
  sun_albert: 10, moon_albert: 12, earth_albert: 9,
  sun_judgment: 10, moon_judgment: 9, earth_judgment: 11,
  sun_hector: 14, moon_kamura: 13, earth_emerada: 15,
  sun_aegis: 14, moon_witch: 13, earth_abyss: 16,
  pluto_goblin: 3, pluto_maiden: 5, pluto_crest: 4, pluto_frog: 5.5, pluto_order: 4.5,
  pluto_priest: 8, pluto_albert: 8, pluto_judgment: 10, pluto_seraph: 12, pluto_jabberwock: 14,
  mercury_goblin: 3.5, mercury_mercurino: 5, mercury_gate: 1.5, mercury_microaegis: 7,
  mercury_rebellion: 5.5, mercury_sonic: 5, mercury_albert: 10, mercury_awakening: 8,
  mercury_chimera: 12, mercury_hornet: 11,
  sun_soldier: 3, hector_soldier: 3, earth_guardian: 5, pluto_soldier: 1,
};

// ターン終了時に破壊されるキャラ（水星のアステールで出したキャラなど）の破壊トリガーの価値
const DEATH_VALUE = {
  earth_frog: 4.5, earth_maiden: 3, moon_maiden: 3, moon_priest: 6, moon_frog: 3,
  earth_abyss: 9, moon_kamura: 9,
};

// 破壊時・攻撃時などの能力ボーナス（場にいるときの価値）
const UNIT_BONUS = {
  sun_goblin: 2, moon_goblin: 2, earth_goblin: 2,
  moon_maiden: 2.5, earth_maiden: 2.5,
  moon_frog: 1.5, earth_frog: 2.5,
  moon_priest: 4.5,
  moon_kamura: 7,
  earth_abyss: 7,
  pluto_goblin: 1,
  pluto_maiden: 5, // 毎ターン HP+2・相手に2点
  pluto_frog: 1.5,
  pluto_priest: 2,
  pluto_seraph: 4,
};

const keyOf = (x) => x.cardId || x.copyOf || x.tokenId || "";

function unitValue(u) {
  // ターン終了時に消えるキャラは、盤面の価値としては数えない（破壊トリガーの分だけ数える）
  if (E.hasKw(u, "dies_end_of_turn") && !E.isInvincible(u)) return DEATH_VALUE[E.effectId(u)] || 0;
  // 「ターン終了まで」のスタッツ上昇（マーキュリノ）は数えない
  const st = Math.max(0, u.stat - (u.tempBuff || 0));
  if (u.tempBuff && u.stat - u.tempBuff <= 0) return DEATH_VALUE[E.effectId(u)] || 0;
  let v = st + 1;
  if (E.hasKw(u, "defender")) v += 1.5;
  if (E.hasKw(u, "untargetable_by_attack")) v += 1.5;
  if (E.isInvincible(u)) v += st * 1.5 + 6;
  const id = E.effectId(u);
  v += UNIT_BONUS[id] || 0;
  if (id === "earth_abyss" && !u.firstAttackUsed) v += 6;
  if (id === "mercury_hornet") v += (u.directCount || 0) === 1 ? 9 : (u.directCount || 0) === 0 ? 3 : 0;
  if (id === "mercury_microaegis") v += 4;
  return v;
}

function handValue(h, p, w) {
  const info = E.handInfo(h);
  if (!info) return 0;
  const k = keyOf(h);
  let V = (w && w.boost && w.boost[k]) ?? VALUE[k] ?? VALUE[info.copyOf] ?? costValue(info);
  // 同じ名前のアビリティがもう付いている
  if (info.type === "ability" && E.hasAbility(p, k)) {
    // 付いている方を外して（ドロー）付け直せる
    V = k === "mercury_awakening" ? 6 : k === "mercury_sonic" ? 4 : 1;
  }
  // 水星のソニックバッチ：即時召喚できるキャラが手札に多いほど価値が高い
  if (k === "mercury_sonic") V = 5 + 1.2 * p.hand.filter((x) => E.hasteAllowed(E.handInfo(x))).length;
  if (k === "mercury_hornet" && w && w.combo === "hornet") V += 6 * Math.max(0, info.cost - E.playCost(h));
  if (k === "earth_order" && w && w.combo === "hornet") V += 6 * Math.max(0, info.cost - E.playCost(h));
  if (w && w.sniper) {
    // 号令は一番安い1枚だけ大事にする
    if (k === "earth_order") {
      const best = p.hand.filter((x) => keyOf(x) === "earth_order").sort((a, b) => E.playCost(a) - E.playCost(b))[0];
      if (best && best.uid !== h.uid) V = 1;
    }
  }
  // 数ターン先の相手のリーサルを、ディフェンダー1体で防げる：一番安いディフェンダーを手札に残す
  if (w && w.plan && w.plan.holdDefender && isDefenderCard(info)) {
    const keep = cheapestDefender(p);
    if (keep && keep.uid === h.uid) V += HOLD_BONUS;
  }
  // 中盤以降：一番安いディフェンダーは手札に残しておく（場のディフェンダーが除去されても、すぐ次を出せるように）
  if (w && w.guardHold && isDefenderCard(info)) {
    const keep = cheapestDefender(p);
    if (keep && keep.uid === h.uid) V += GUARD_HOLD;
  }
  const diff = E.playCost(h) - (p.maxCost + 1);
  const avail = diff <= 0 ? 1 : Math.pow(0.85, diff);
  return 0.55 * V * avail + 1.5;
}

// 点数表にないカード（新カードなど）は、コストから点数を出す
const costValue = (info) => 1.6 * (info.cost || 0) + 2;

// 最大コストの価値（序盤ほど1コストが重い）
function costCurve(m) {
  let v = 0;
  for (let i = 1; i <= m; i++) v += i <= 5 ? 3.5 : i <= 7 ? 2.5 : 1.2;
  return v;
}

const hpVal = (h) => (h <= 0 ? h * 6 - 10 : 9 * Math.sqrt(h));

const deckPenalty = (n) => (n <= 1 ? -500 : n === 2 ? -80 : n <= 4 ? -20 : n <= 7 ? -4 : 0);

// 水星のリバースゲート・ゼロ
const gateOn = (pl) => E.hasAbility(pl, "mercury_gate");
const gateInHand = (pl) => pl.hand.some((h) => keyOf(h) === "mercury_gate");
function myDeckPenalty(pl, w) {
  const n = pl.deck.length;
  if (gateOn(pl)) return 0; // 山札が0になれば勝ち
  if (w && w.deckout && gateInHand(pl)) return n <= 1 ? -500 : 0;
  return deckPenalty(n);
}

// 付いているアビリティの価値（pl から見て）
function abilityValue(a, pl, foe, w) {
  const t = a.cardId;
  if (t === "mercury_gate") {
    const n = pl.deck.length;
    // 付いている間に引けそうな枚数（ターン終了時1・次のターンのドロー1・生贄1）
    const reach = (a.timer || 0) >= 2 ? 4 : 2;
    if (n <= reach) return 90 - n * 5;
    if (n <= reach + 2) return 25;
    return w && w.deckout ? -6 : 0; // 早すぎる（無駄になる）
  }
  if (t === "mercury_rebellion") {
    const n = foe.field.filter((u) => !E.isInvincible(u) && !E.hasKw(u, "dies_end_of_turn")).length;
    return 2 + 2.6 * Math.min(n, 4);
  }
  if (t === "mercury_sonic") {
    // 即時召喚の追加コストが1になる。手札の即時召喚できるキャラの数だけ価値が上がる
    const n = pl.hand.filter((x) => E.hasteAllowed(E.handInfo(x))).length;
    return 7 + 1.8 * Math.min(n, 4);
  }
  if (t === "mercury_awakening") {
    // 毎ターン全員+1（永続）。並んでいるほど価値が高い
    const n = pl.field.filter((u) => !E.isInvincible(u) && !E.hasKw(u, "dies_end_of_turn")).length;
    return 7 + 2.6 * n;
  }
  return 2;
}
const abilitiesValue = (pl, foe, w) =>
  E.abilitiesOf(pl).reduce((a, x) => a + abilityValue(x, pl, foe, w), 0);

// defenderSide が次に受けそうなダメージ（attackerSide の場から）
function incoming(attacker, defender) {
  const units = attacker.field.filter(
    (u) => u.stat > 0 && !E.hasKw(u, "dies_end_of_turn") && !E.hasKw(u, "no_attack_player")
  );
  let atk = units.reduce((a, u) => a + u.stat, 0);
  // 太陽のゴブリン：攻撃するたび他の味方が+1（先に殴れば残り全員が強化される）
  units.forEach((u) => {
    if (E.effectId(u) === "sun_goblin") atk += units.length - 1;
  });
  const defs = defender.field.filter((u) => E.hasKw(u, "defender"));
  let face;
  if (defs.length) {
    if (defs.some((u) => E.isInvincible(u))) face = 0;
    else {
      const defSum = defs.reduce((a, u) => a + Math.max(0, u.stat), 0);
      face = Math.max(0, atk - defSum);
    }
  } else {
    face = atk;
  }
  // 地球の天地を破る者：最初の攻撃で必ず6ダメージ
  attacker.field.forEach((u) => {
    if (E.effectId(u) === "earth_abyss" && !u.firstAttackUsed) face += 6;
  });
  // 水星のホーネット：2回目のダイレクトで相手HPを4にする
  if (!defs.length) {
    attacker.field.forEach((u) => {
      if (E.effectId(u) === "mercury_hornet" && (u.directCount || 0) === 1) face += Math.max(0, defender.hp - 4);
    });
  }
  // 冥王星の乙女：ターン終了時に2点（ディフェンダーでは防げない）
  face += 2 * attacker.field.filter((u) => E.effectId(u) === "pluto_maiden").length;
  const c = Math.min(E.MAX_COST, attacker.maxCost + (attacker.pendingCost || 0));
  const reach = attacker.hand.length === 0 ? 0 : c >= 8 ? 6 : c >= 6 ? 4 : c >= 2 ? 2 : 0;
  return { face, reach };
}

/* ============ 盤面評価（me から見た点数） ============ */
const hasSeraph = (pl) => pl.field.some((u) => E.effectId(u) === "pluto_seraph");
const seraphInHand = (pl) => pl.hand.some((h) => keyOf(h) === "pluto_seraph");
const SERAPH_HP = 30;

// noOwnHand: 相手ターンの先読み用（想定した手札は「使ってなんぼ」なので手札の価値を数えない）
function evaluate(s, me, w, afterReply = false, noOwnHand = false) {
  if (s.winner) return s.winner === me ? 1e6 : -1e6;
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];

  // 自分のターン中なら、このあと来る「自分のターン終了時」の処理を先取りして考える
  let myHp = p.hp, opHp = o.hp;
  if (s.turn === me) {
    const m = p.field.filter((u) => E.effectId(u) === "pluto_maiden").length;
    myHp += 2 * m;
    opHp -= 2 * m;
    if (opHp <= 0) return 9e5; // 冥王星の乙女でとどめ
    // 相手のセラフィム・ルクス：自分のターン終了時に相手HP30以上で場にいると負け
    if (hasSeraph(o) && opHp >= SERAPH_HP) return -9e5 - opHp;
  }

  let v = 0;

  v += p.field.reduce((a, u) => a + unitValue(u), 0);
  v -= o.field.reduce((a, u) => a + unitValue(u), 0) * 1.05;

  if (!noOwnHand) v += p.hand.reduce((a, h) => a + handValue(h, p, w), 0);

  v += abilitiesValue(p, o, w);
  v -= abilitiesValue(o, p, STYLE.balanced) * 1.05;
  // 相手のゲート：山札が少ないほど危険
  if (gateOn(o)) v -= o.deck.length <= 4 ? 60 : 8;
  v -= o.hand.length * 4.2;

  v += costCurve(Math.min(E.MAX_COST, p.maxCost + (p.pendingCost || 0)));
  v -= costCurve(Math.min(E.MAX_COST, o.maxCost + (o.pendingCost || 0)));

  // 相手がリバースゲートを持っていそうなら、相手の山札が減っても喜ばない（相手の勝ち筋）
  const opGate = gateOn(o) || (w.plan && w.plan.race);
  v += myDeckPenalty(p, w) - (opGate ? 0 : deckPenalty(o.deck.length));
  // 山札切れ勝ち：山札を減らすほど良い
  if (w.deckout) v += (40 - p.deck.length) * 0.9;

  // 相手ターンの被ダメージ予測（時渡りの魔術師で相手ターンが飛ぶなら無し）
  const skip = s.skipNext === op;
  const inc = skip || afterReply ? { face: 0, reach: 0 } : incoming(o, p);
  v += hpVal(myHp - 0.5 * inc.face * w.threat);
  if (!afterReply) {
    if (inc.face >= myHp) v -= 150 * w.threat;
    else if (inc.face + inc.reach >= myHp) v -= 50 * w.threat;
  } else {
    // 相手の攻撃を受けた後：まだ手札から追加ダメージが来うる
    const c = Math.min(E.MAX_COST, o.maxCost);
    const reach = o.hand.length === 0 ? 0 : c >= 8 ? 6 : c >= 6 ? 4 : c >= 2 ? 2 : 0;
    if (reach >= myHp) v -= 50 * w.threat;
  }

  // 相手HP（低いほど1点の価値が上がる）
  v -= hpVal(opHp) * w.face;

  // 次の自分のターンのリーサル圏
  const out = incoming(p, o);
  if (out.face >= opHp) v += skip ? 200 : 25 * w.face;

  // ---- 冥王星のセラフィム・ルクス ----
  // 自分のセラフィム：相手のターンを越えればHP30以上で勝ち
  if (hasSeraph(p)) {
    const after = myHp - (skip ? 0 : inc.face);
    if (myHp >= SERAPH_HP) v += after >= SERAPH_HP ? 140 : 60;
    else v += Math.max(0, myHp - 15) * 2.5; // 30に近づくほど価値が上がる
  } else if (seraphInHand(p)) {
    v += Math.max(0, Math.min(myHp, SERAPH_HP) - 15) * 0.8;
  }
  // 相手のセラフィム：HPが30に近いほど危険（倒すかHPを削る）
  if (hasSeraph(o)) {
    v -= 25 + Math.max(0, opHp - 15) * 3;
  }

  // ---- 終盤の守り：自分の場にディフェンダーを最低1体置いておく ----
  // 終盤は「ダイレクトが通ること」が条件の大技（何度もダイレクトして決める・倒せないキャラで削り続けるなど）が増える。
  // ディフェンダーが1体いるだけでそれらを止められるので、安いものでも毎ターン置いておく。
  if (lateGame(o)) {
    if (p.field.some((u) => E.hasKw(u, "defender"))) v += GUARD_BONUS * w.threat;
  }

  if (skip) v += 18;
  return v;
}

// 終盤の守り
const GUARD_BONUS = 14; // 自分の場にディフェンダーがいる価値の上乗せ
const GUARD_HOLD = 6; // 終盤、場にディフェンダーがいない時に、手札の一番安いディフェンダーを生贄にしにくくする
const oppCost = (o) => Math.min(E.MAX_COST, o.maxCost + (o.pendingCost || 0));
const lateGame = (o) => oppCost(o) >= 7;
const midGame = (o) => oppCost(o) >= 5;

// コンボの核を生贄にしてよいか（手札＋山札の残り枚数を数える）
// 序盤に高コストを生贄にするのは基本OK。ただし残り枚数が必要枚数を下回るならしない
function sacrificeOk(p, h, w) {
  // 中盤以降：手札のディフェンダーが2枚以下なら生贄にしない（終盤の守りに取っておく）
  if (w && w.guardHold && isDefenderCard(E.handInfo(h))) {
    if (p.hand.filter((x) => isDefenderCard(E.handInfo(x))).length <= 2) return false;
  }
  const k = keyOf(h);
  const need = w && w.keys && w.keys[k];
  if (!need) return true;
  const inHand = p.hand.filter((x) => keyOf(x) === k).length;
  const inDeck = p.deck.filter((x) => keyOf(x) === k).length;
  const left = inHand - 1 + inDeck; // 生贄にした後の残り
  if (left < need) return false;
  // 山札が少ないなら、手札の分は必要枚数まで残す
  if (p.deck.length <= 8 && inHand - 1 < need) return false;
  return true;
}

// 生贄まで含めて一番良い状態を選ぶ（生贄しない場合も含む）
function bestAfterSacrifice(s, me, w) {
  let best = { s, score: evaluate(s, me, w) };
  if (s.winner) return best;
  let base = s;
  if (E.isActive(s, me, "main")) {
    base = E.toSacrifice(s, me);
    if (!base) return best;
    best = { s: base, score: best.score };
  }
  if (!E.canSacrifice(base, me)) return best;
  const seen = new Set();
  base.players[me].hand.forEach((h, i) => {
    const k = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(k)) return;
    seen.add(k);
    if (!sacrificeOk(base.players[me], h, w)) return;
    const ns = E.sacrifice(base, me, i);
    if (!ns) return;
    const sc = evaluate(ns, me, w);
    if (sc > best.score) best = { s: ns, score: sc };
  });
  return best;
}

/* ============ 相手読み（公開情報だけでデッキを推理） ============ */
// デッキは「各枠1種類×4枚」。公開されたカードが1枚でもあれば、その枠は確定する。
// 確定していない枠は、確定した枠と矛盾しないおすすめデッキから候補を挙げる。
// カード名による個別の判断はせず、効果はすべてエンジンで実際に動かして確かめる。

const HOLD_BONUS = 9; // 手札に残すディフェンダーの価値の上乗せ
const isDefenderCard = (c) =>
  !!c && c.type === "character" && (c.keywords || []).includes("defender");
const cheapestDefender = (p) =>
  p.hand.filter((x) => isDefenderCard(E.handInfo(x))).sort((a, b) => E.playCost(a) - E.playCost(b))[0];

const slotOf = (() => {
  const m = {};
  SLOTS.forEach((sl) => cardsBySlot(sl).forEach((c) => { m[c.id] = sl; }));
  return (id) => m[id] || null;
})();
const cardOf = (id) => E.handInfo({ cardId: id });

function readOpponent(s, me) {
  const op = E.otherId(s, me);
  const o = s.players[op];
  // 公開されたカードの枚数（場・墓地・生贄置き場・アビリティ）
  const seen = {};
  const add = (id) => { if (id && slotOf(id)) seen[id] = (seen[id] || 0) + 1; };
  o.field.forEach((u) => { if (!u.token) add(u.cardId); });
  (o.grave || []).forEach((g) => add(g.cardId));
  (o.sacrifice || []).forEach((g) => add(g.cardId));
  E.abilitiesOf(o).forEach((a) => add(a.cardId));
  // コピー・トークンの元（手札や生贄置き場にあったカード）も、その枠のカードとして分かる
  const reveal = new Set(Object.keys(seen));
  o.field.forEach((u) => { if (u.token && u.copyOf && slotOf(u.copyOf)) reveal.add(u.copyOf); });

  const known = {}; // 枠 → カードID
  reveal.forEach((id) => { known[slotOf(id)] = id; });
  // 確定した枠と矛盾しないおすすめデッキ
  let cands = DECKS.filter((d) => Object.keys(known).every((sl) => d.selection[sl] === known[sl]));
  if (!cands.length) cands = DECKS;

  // 相手の手札・山札にまだありうるカード { id, left: 残り枚数 }
  const pool = [];
  SLOTS.forEach((sl) => {
    if (known[sl]) {
      const id = known[sl];
      const left = 4 - (seen[id] || 0);
      if (left > 0) pool.push({ id, left });
    } else {
      [...new Set(cands.map((d) => d.selection[sl]))].forEach((id) => pool.push({ id, left: 4 }));
    }
  });

  // 「持っていたらまずい」手札：ありうるカードを最大2枚ずつ持っている前提
  // コスト軽減（公開記録）は、重いカードから順に乗せる
  //  ・選んで下げる効果（重ねがけ可）は、一番重いカードにまとめて
  //  ・ランダムに下がる効果は、重いカードから1枚に1つずつ
  const reds = o.reductions || [];
  const pick = reds.filter((r) => r.pick).reduce((a, r) => a + r.n, 0);
  const rand = reds.filter((r) => !r.pick).map((r) => r.n).sort((a, b) => b - a);
  const byCost = [...pool].sort((a, b) => cardOf(b.id).cost - cardOf(a.id).cost);
  const topCost = byCost.length ? cardOf(byCost[0].id).cost : 0;
  const hand = [];
  let ri = 0;
  byCost.forEach((x) => {
    const c = cardOf(x.id);
    let mod = 0;
    if (c.cost === topCost) mod -= pick;
    if (ri < rand.length) mod -= rand[ri++];
    // 手札にある間に安くなるカード（キマイラなど）：最初から持っていた前提
    if (c.handCostOnSummon) mod += c.handCostOnSummon * (o.summonCount || 0);
    const floor = c.handCostMin ?? 0;
    mod = Math.max(mod, floor - c.cost);
    const n = Math.min(x.left, 2);
    for (let i = 0; i < n; i++) hand.push({ id: x.id, costMod: mod });
  });

  return { known, cands, pool, hand };
}

/* ============ 相手のターンの先読み ============ */
// 相手の手札は見ずに「持っていたらまずいカード」を持っている前提で、
// 攻撃＋カード使用（実際の手札枚数＋1ドローまで）を、相手にとって一番良いように選ぶ。
const REPLY_BEAM = 3;
const REPLY_DEPTH = 7;
const REPLY_LETHAL = -4000; // 先読みで倒される候補の点数（倒される候補同士は通常の点数で比べる）

function threatHand(read) {
  return read.hand.map((h, i) => ({ uid: "th" + i, cardId: h.id, costMod: h.costMod }));
}
// 相手の山札も中身は見ない（ありうるカードで同じ枚数の山札を作る）
function threatDeck(read, n) {
  const ids = read.pool.map((x) => x.id);
  const out = [];
  for (let i = 0; i < n && ids.length; i++) out.push({ uid: "td" + i, cardId: ids[i % ids.length], costMod: 0 });
  return E.shuffle(out);
}
// 相手のターン開始時の状態に、想定した手札・山札を入れる
function withThreat(s0, op, read) {
  const s = E.cloneState(s0);
  s.log = [];
  const o = s.players[op];
  o.hand = threatHand(read);
  o.deck = threatDeck(read, o.deck.length);
  s.turnPhase = "main";
  return s;
}

// 相手のメインフェーズ1回分（budget：使えるカードの枚数）
function replyTurn(s0, op, budget, beamW = REPLY_BEAM, depth = REPLY_DEPTH) {
  const ow = STYLE.balanced;
  let best = { s: s0, used: 0, sc: evaluate(s0, op, ow, true, true) };
  let beam = [{ s: s0, used: 0 }];
  for (let d = 0; d < depth; d++) {
    const children = [];
    for (const node of beam) {
      for (const act of mainActionsRaw(node.s, op)) {
        const isPlay = act.type === "play";
        if (isPlay && node.used >= budget) continue;
        const ns = applyAction(node.s, op, act);
        if (!ns) continue;
        const used = node.used + (isPlay ? 1 : 0);
        if (ns.winner === op) return { s: ns, used, win: true };
        const sc = evaluate(ns, op, ow, true, true);
        children.push({ s: ns, used, sc });
        if (sc > best.sc) best = { s: ns, used, sc };
      }
    }
    if (!children.length) break;
    children.sort((a, b) => b.sc - a.sc);
    const seen = new Set();
    beam = [];
    for (const c of children) {
      const k = stateKey(c.s, op);
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(c);
      if (beam.length >= beamW) break;
    }
  }
  return best;
}

// 相手のターン（時渡りの魔術師などの連続ターンも含む）を最後まで進める
// 戻り値 { win: 相手が勝つ, s: 相手のメイン終了時の状態, left: 残りの手札枚数 }
function replyFull(s, op, budget, beamW, depth) {
  let r = replyTurn(s, op, budget, beamW, depth);
  for (let t = 0; t < 2; t++) {
    if (r.win) return { win: true };
    // 相手のターン終了時（冥王星の乙女・リバースゲートの1ドローなど）
    const sac = E.toSacrifice(r.s, op);
    const end = sac && E.endTurn(sac, op);
    if (end && end.winner === op) return { win: true };
    // 相手のターンがもう一度来る（時渡りの魔術師など）
    if (t === 0 && end && !end.winner && end.turn === op) {
      budget = Math.max(0, budget - r.used) + 1;
      const s2 = E.cloneState(end);
      s2.turnPhase = "main";
      r = replyTurn(s2, op, budget, beamW, depth);
      continue;
    }
    break;
  }
  return { win: false, s: r.s, left: Math.max(0, budget - r.used) };
}

function replyScore(s0, me, w) {
  if (s0.winner) return s0.winner === me ? 1e6 : REPLY_LETHAL;
  const op = E.otherId(s0, me);
  const s = E.isActive(s0, me, "sacrifice") ? E.endTurn(s0, me) : s0;
  if (!s) return evaluate(s0, me, w);
  if (s.winner) return s.winner === me ? 1e6 : REPLY_LETHAL;
  if (s.turn !== op) return evaluate(s, me, w); // 時渡りの魔術師などで相手ターンが飛ぶ
  const read = w.read || readOpponent(s, me);
  const budget = s.players[op].hand.length + 1; // 今の手札＋ドロー1枚
  const r = replyFull(withThreat(s, op, read), op, budget);
  if (r.win) return REPLY_LETHAL;
  const worst = E.cloneState(r.s);
  // 相手の手札は「残っていそうな枚数」だけ残す
  worst.players[op].hand = worst.players[op].hand.slice(0, r.left);
  return evaluate(worst, me, w, true);
}

/* ============ ターンの初めに1回だけ考えること（作戦） ============ */
// ① ディフェンダーを残すか：相手のコストが1〜3増えた時のリーサルを、
//    「自分の場にディフェンダーが1体いたら防げるか」で試す
// ② 攻め急ぐか：自分が何もしなかった時、相手がHPを削る以外の方法（山札切れ・セラフなど）で
//    何ターン後に勝つかを試し、自分が倒し切るまでのターン数と比べる
const PLAN_BEAM = 2;
const PLAN_DEPTH = 6;

// 相手のターン開始時の状態を作る（相手のコストを extra だけ多く想定）
function oppTurnState(state, me, read, extra) {
  const op = E.otherId(state, me);
  const s = E.cloneState(state);
  s.log = [];
  s.turn = op;
  s.skipNext = null;
  const o = s.players[op];
  o.maxCost = Math.min(E.MAX_COST, o.maxCost + (o.pendingCost || 0) + extra);
  o.pendingCost = 0;
  o.cost = o.maxCost;
  o.field.forEach((u) => { u.canAttack = true; u.attacked = false; });
  // 自分のキャラは相手のターン中なので攻撃済み扱いにしない（盤面の状態だけ見る）
  return withThreat(s, op, read);
}

// 自分の場に手札のカードを1枚出した状態（ディフェンダーを置いた場合の確認用）
function withMyUnit(state, me, handUid) {
  const s = E.cloneState(state);
  s.turnPhase = "main";
  s.turn = me;
  const p = s.players[me];
  p.cost = 99;
  const idx = p.hand.findIndex((h) => h.uid === handUid);
  if (idx < 0 || p.field.length >= E.MAX_FIELD) return null;
  return E.playCard(s, me, idx, {});
}

function oppLethal(state, me, read, extra) {
  const op = E.otherId(state, me);
  const budget = state.players[op].hand.length + 1 + extra;
  return replyFull(oppTurnState(state, me, read, extra), op, budget, PLAN_BEAM, PLAN_DEPTH).win;
}

function needHoldDefender(state, me, read) {
  const p = state.players[me];
  const d = cheapestDefender(p);
  if (!d) return false;
  const withD = withMyUnit(state, me, d.uid);
  if (!withD) return false;
  for (let k = 1; k <= 3; k++) {
    if (!oppLethal(state, me, read, k)) continue;
    // 防げるなら残す（防げないならディフェンダーは関係ない）
    return !oppLethal(withD, me, read, k);
  }
  return false;
}

// 自分が何もしない場合に、相手がHP以外の方法で勝つまでのターン数（4ターン以内に無ければ null）
function specialClock(state, me, read) {
  const op = E.otherId(state, me);
  let s = E.cloneState(state);
  s.players[me].hp = 999; // HPを削られて負ける筋は除外（それは毎手の先読みで守る）
  let budget = s.players[op].hand.length + 1;
  for (let round = 1; round <= 4; round++) {
    const st = oppTurnState(s, me, read, 0);
    let r = replyTurn(st, op, budget, PLAN_BEAM, PLAN_DEPTH);
    if (r.win) return round;
    let t = E.toSacrifice(r.s, op);
    if (!t) return null;
    // 相手は一番重いカードを生贄にする（HPとコストを伸ばす）
    if (E.canSacrifice(t, op)) {
      const h = t.players[op].hand;
      let bi = -1;
      h.forEach((x, i) => { if (bi < 0 || E.playCost(x) > E.playCost(h[bi])) bi = i; });
      if (bi >= 0) t = E.sacrifice(t, op, bi) || t;
    }
    t = E.endTurn(t, op);
    if (!t) return null;
    if (t.winner === op) return round;
    if (t.winner) return null;
    // 自分のターン：何もしない
    let m = t;
    if (m.turn === me) {
      m = E.drawStep(m, me) || m;
      m = E.toSacrifice(m, me) || m;
      m = E.endTurn(m, me) || m;
      if (m.winner === op) return round;
      if (m.winner) return null;
    }
    s = m;
    s.players[me].hp = 999;
    budget = Math.max(1, budget - r.used) + 2;
  }
  return null;
}

// 自分が相手を倒すまでのターン数（今の場の攻撃力で大まかに）
function myClock(state, me) {
  const op = E.otherId(state, me);
  const p = state.players[me], o = state.players[op];
  const dmg = incoming(p, o).face;
  if (o.hp <= 0) return 0;
  return dmg > 0 ? Math.ceil(o.hp / dmg) : 6;
}

let planCache = { key: null, plan: null };
function turnPlan(state, me, read) {
  const key = [state.host, state.guest, me, state.turnCount].join("|");
  if (planCache.key === key) return planCache.plan;
  const holdDefender = needHoldDefender(state, me, read);
  const sc = specialClock(state, me, read);
  const mc = myClock(state, me);
  const plan = { holdDefender, special: sc, mine: mc, race: sc !== null && sc <= mc + 1 };
  planCache = { key, plan };
  return plan;
}

// 作戦に合わせて、自分の戦い方（攻め/守りの重み）を切り替える
function adaptStyle(base, read, plan, state, me) {
  const w = { ...base, read, plan };
  if (state) w.guardHold = midGame(state.players[E.otherId(state, me)]);
  // 相手の場に倒せないキャラ（あらゆる破壊・ダメージを受けない）がいる：長引くほど不利なので攻め寄りに
  if (state) {
    const o = state.players[E.otherId(state, me)];
    const n = o.field.filter((u) => E.isInvincible(u) && !E.hasKw(u, "no_attack_player")).length;
    if (n) w.face = Math.max(w.face, 0.9) * (1 + 0.15 * Math.min(n, 3));
  }
  if (plan.race) {
    // 相手の特殊勝利が先に来る：守っていても負けるので攻め寄りに
    const gap = Math.max(0, plan.mine + 2 - plan.special); // 大きいほど急ぐ
    w.face = Math.max(w.face, 1.0) * (1.3 + 0.25 * Math.min(gap, 4));
    w.threat = w.threat * 0.75;
  }
  return w;
}

/* ============ 行動の列挙 ============ */
const unitSig = (u) =>
  [E.effectId(u) || u.tokenId, u.stat, u.cost, (u.keywords || []).join(","),
    u.firstAttackUsed ? 1 : 0, u.token ? 1 : 0, u.attacked ? 1 : 0].join("|");

// 同じ内容のユニットは1体だけ候補にする（計算量削減）
function dedupeUnits(field, uids) {
  const seen = new Set();
  const out = [];
  uids.forEach((id) => {
    const u = field.find((x) => x.uid === id);
    const k = u ? unitSig(u) : id;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(id);
  });
  return out;
}

/* ============ コンボの組み方（今は使わずに貯める判断） ============ */
// 破壊トリガーを持つ、元のコスト5以下のキャラ（水星のアステールで出す候補）
const DEATH_TRIGGER = new Set(["moon_maiden", "earth_maiden", "moon_frog", "earth_frog", "moon_priest"]);
const countIn = (arr, id) => arr.filter((x) => keyOf(x) === id).length;

// 手札のキマイラを全部出すのに必要なコスト（出すたびに残りが-1される）
function chimeraBurstCost(p) {
  const cs = p.hand.filter((h) => keyOf(h) === "mercury_chimera").map((h) => E.playCost(h)).sort((a, b) => a - b);
  let total = 0;
  cs.forEach((c, i) => { total += Math.max(1, c - i); });
  return { n: cs.length, total };
}

// その行動を今やってよいか（false なら候補から外す）
function comboAllows(s, me, act, w, ctx) {
  if (ctx.danger) return true; // 負けそうなら何でも使う
  const p = s.players[me];
  const now = s.turnCount;
  const card = act.type === "play" ? E.handInfo(p.hand.find((h) => h.uid === act.handUid)) : null;
  const id = card ? card.id || card.copyOf : null;
  const handFull = p.hand.length >= 9;

  // 水星のアステール：同じアステールは出さない（召喚トリガーが出ない）
  if (id === "mercury_albert" && act.target) {
    const t = p.hand.find((h) => h.uid === act.target);
    if (t && keyOf(t) === "mercury_albert") return false;
  }

  switch (w.combo) {
    case "chimera": {
      // 盤面を取りながらキマイラを貯め、まとめて出してから時渡りの魔術師
      if (id === "mercury_chimera") {
        if (s.skipNext === E.otherId(s, me) || p._comboTurn === now || handFull) return true;
        const b = chimeraBurstCost(p);
        const witch = p.hand.find((h) => keyOf(h) === "moon_witch");
        const witchCost = witch ? E.playCost(witch) : 0;
        if (b.n >= 2 && b.total <= p.cost) return true;
        if (witch && b.total + witchCost <= p.cost) return true;
        return p.maxCost >= E.MAX_COST && b.n >= 1 && countIn(p.deck, "mercury_chimera") === 0;
      }
      if (id === "moon_witch") {
        return p._comboTurn === now || countIn(p.hand, "mercury_chimera") === 0 || handFull;
      }
      return true;
    }
    case "hornet": {
      // 紋章・号令は普通に使ってよい。10コストのターンまでに揃えばいい
      // ・号令の再攻撃は、攻撃済みのホーネットがいればホーネットに
      // ・ホーネット本体は「ホーネット＋号令」を同じターンに出せる時に出す
      if (id === "mercury_hornet" && w.sniper) {
        const o = s.players[E.otherId(s, me)];
        if (o.field.some((u) => E.hasKw(u, "defender"))) return false;
      }
      if (id === "mercury_hornet") {
        const orderCosts = p.hand.filter((h) => keyOf(h) === "earth_order").map((h) => E.playCost(h));
        const orders = orderCosts.length;
        const hc = E.playCost(p.hand.find((h) => h.uid === act.handUid));
        if (orders >= 1 && hc + Math.min(...orderCosts) <= p.cost) return true;
        if (orders === 0 && countIn(p.deck, "earth_order") === 0) return true;
        // 号令が間に合わなくても、最大コスト10なら出して次のターンに2回目を狙う
        if (!w.sniper && p.maxCost >= E.MAX_COST && hc <= p.cost) return true;
        return handFull;
      }
      if (id === "earth_order") {
        const h = p.field.find((u) => E.effectId(u) === "mercury_hornet" && u.attacked);
        if (h) return act.target === h.uid;
      }
      return true;
    }
    case "jabberwock": {
      // 安いキャラやカミラを並べてからジャバヴリトラ（壊した数だけ大型のコピーが出る）
      if (id === "pluto_jabberwock") {
        const kamura = p.field.some((u) => E.effectId(u) === "moon_kamura");
        return kamura || p.field.length >= 2 || handFull;
      }
      return true;
    }
    case "mercurino": {
      // マーキュリノ：大きくなる時・削り切れる時だけ出す（2ターン目に素で出さない）
      const o = s.players[E.otherId(s, me)];
      const ownMercurino = (u) => E.effectId(u) === "mercury_mercurino";
      if (id === "mercury_mercurino") {
        if (p._comboTurn === now) return true; // 一気に削るターンの出し直し
        const stat = 1 + (p.playedThisTurn || 0) * E.MERCURINO_PER_CARD;
        const orderInHand = p.hand.some((h) => keyOf(h) === "earth_order");
        if (stat >= o.hp) return true; // このまま削り切れる
        if (orderInHand && stat * 2 >= o.hp) return true; // 号令で2回殴れば削り切れる
        if ((p.playedThisTurn || 0) >= 3) return true; // 3枚以上使った後なら十分大きい
        // 山札にもう残っていなければ、最大コストのターンには使う
        return p.maxCost >= E.MAX_COST && countIn(p.deck, "mercury_mercurino") === 0;
      }
      if (id === "mercury_goblin") {
        // 戻すのはマーキュリノを出し直す時（そのターンに出したマーキュリノ）が基本
        if (p._comboTurn === now || handFull) return true;
        if (act.target) {
          const t = p.field.find((u) => u.uid === act.target);
          if (t && ownMercurino(t)) return true; // 場のマーキュリノを手札に戻して温存
        }
        // コンボ用のゴブリンを使い切らない：手札＋山札に3枚以上ある時だけ普通に使う
        return countIn(p.hand, "mercury_goblin") + countIn(p.deck, "mercury_goblin") >= 3;
      }
      return true;
    }
    case "seraph": {
      // 地球の審判はセラフが場にいる時だけ
      if (id === "earth_judgment") return p.field.some((u) => E.effectId(u) === "pluto_seraph") || handFull;
      return true;
    }
    default:
      return true;
  }
}

function mainActions(s, me, w) {
  const all = mainActionsRaw(s, me);
  if (!w) return all;
  const p = s.players[me], o = s.players[E.otherId(s, me)];
  const ctx = { danger: incoming(o, p).face >= p.hp };
  const acts = all.filter((a) => comboAllows(s, me, a, w, ctx));
  // 即時召喚を積極的に使う（ソニックバッチが付いている時）：
  // 即時召喚できるキャラは、即時で出せるなら通常召喚の候補を外す
  let acts2 = acts;
  if (w.hasteFirst && E.hasAbility(p, "mercury_sonic")) {
    const hasteOk = new Set(acts.filter((a) => a.type === "play" && a.haste).map((a) => a.handUid));
    acts2 = acts.filter((a) => !(a.type === "play" && !a.haste && hasteOk.has(a.handUid)));
  }
  return finishActs(s, me, p, acts2);
}

function finishActs(s, me, p, acts) {
  // 水星のアステール：破壊トリガー持ちがいればそれを優先
  const albertActs = acts.filter((a) => a.type === "play" && keyOf(p.hand.find((h) => h.uid === a.handUid) || {}) === "mercury_albert" && a.target);
  if (albertActs.length) {
    const good = albertActs.filter((a) => DEATH_TRIGGER.has(keyOf(p.hand.find((h) => h.uid === a.target) || {})));
    if (good.length) {
      const drop = new Set(albertActs.filter((a) => !good.includes(a)));
      return acts.filter((a) => !drop.has(a));
    }
  }
  // アビリティを外す
  // ・「自分で外した時」の効果があるもの（覚醒・ソニック）は、いつでも候補（得かどうかは先読みで判断）
  if (E.canRemoveAbility(s, me)) {
    E.abilitiesOf(p).forEach((a) => {
      if (a.cardId === "mercury_awakening" || a.cardId === "mercury_sonic") acts.push({ type: "remove", uid: a.uid });
    });
  }
  // ・2枚付いていて、付けたいアビリティが手札にある時
  if (E.canRemoveAbility(s, me) && E.abilitiesOf(p).length >= E.MAX_ABILITIES) {
    const want = p.hand.some((h) => {
      const c = E.handInfo(h);
      return c && c.type === "ability" && !E.hasAbility(p, c.id) && E.playCost(h) <= p.cost;
    });
    if (want) E.abilitiesOf(p).forEach((a) => acts.push({ type: "remove", uid: a.uid }));
  }
  return acts;
}

function mainActionsRaw(s, me) {
  const acts = [];
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];

  // カードの使用
  const seen = new Set();
  p.hand.forEach((h, i) => {
    const key = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(key)) return;
    seen.add(key);
    for (const haste of [false, true]) {
      if (!E.canPlay(s, me, i, haste)) continue;
      const tk = E.playTargetKind(s, me, i);
      if (tk && tk.candidates.length) {
        let cands;
        if (tk.kind === "reduce1") {
          const hs = new Set();
          cands = tk.candidates.filter((id) => {
            const hh = p.hand.find((x) => x.uid === id);
            const k = hh ? keyOf(hh) + ":" + (hh.costMod || 0) : id;
            if (hs.has(k)) return false;
            hs.add(k);
            return true;
          });
        } else if (tk.kind === "reattack" || tk.kind === "ownUnit") {
          cands = dedupeUnits(p.field, tk.candidates);
        } else if (tk.kind === "ownHand") {
          const hs = new Set();
          cands = tk.candidates.filter((id) => {
            const hh = p.hand.find((x) => x.uid === id);
            const k = hh ? keyOf(hh) : id;
            if (hs.has(k)) return false;
            hs.add(k);
            return true;
          });
        } else {
          cands = dedupeUnits(o.field, tk.candidates);
        }
        cands.forEach((t) => acts.push({ type: "play", handUid: h.uid, haste, target: t }));
      } else {
        acts.push({ type: "play", handUid: h.uid, haste });
      }
    }
  });

  // 攻撃
  const aSeen = new Set();
  p.field.forEach((u) => {
    const ao = E.attackOptions(s, me, u.uid);
    if (!ao) return;
    const sig = unitSig(u);
    if (aSeen.has(sig)) return;
    aSeen.add(sig);
    const ex = E.attackExtraCandidates(s, me, u.uid);
    const extras = ex ? dedupeUnits(o.field, ex) : [null];
    const targets = dedupeUnits(o.field, ao.units);
    extras.forEach((x) => {
      targets.forEach((t) => acts.push({ type: "attack", attacker: u.uid, target: t, extra: x }));
      if (ao.face) acts.push({ type: "attack", attacker: u.uid, face: true, extra: x });
    });
  });
  return acts;
}

function applyAction(s, me, a) {
  if (a.type === "play") {
    const idx = s.players[me].hand.findIndex((h) => h.uid === a.handUid);
    if (idx < 0) return null;
    const k = keyOf(s.players[me].hand[idx]);
    const isCombo = k === "mercury_chimera" || k === "mercury_mercurino";
    const ns = E.playCard(s, me, idx, { haste: a.haste, target: a.target ?? null });
    // コンボを始めたターンの印（キマイラ：まとめて出す・その後に時渡りの魔術師／マーキュリノ：ゴブリンで戻して出し直す）
    if (ns && isCombo) ns.players[me]._comboTurn = ns.turnCount;
    return ns;
  }
  if (a.type === "remove") return E.removeAbility(s, me, a.uid);
  if (a.type === "attack") {
    return E.attack(s, me, a.attacker, {
      targetUid: a.target ?? null, toFace: !!a.face, extraTarget: a.extra ?? null,
    });
  }
  return null;
}

// 思考用のコピー（山札の並びを伏せるため、双方の山札をシャッフルし直す）
function hiddenCopy(s) {
  const c = E.cloneState(s);
  c.log = [];
  [c.host, c.guest].forEach((pid) => {
    if (c.players[pid]) c.players[pid].deck = E.shuffle(c.players[pid].deck);
  });
  return c;
}

const stateKey = (s, me) => {
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];
  const f = (arr) => arr.map((u) => unitSig(u)).sort().join(";");
  return [p.hp, o.hp, p.cost, f(p.field), f(o.field), p.hand.map((h) => h.uid).sort().join(",")].join("#");
};

/* ============ メインフェーズの計画（ビームサーチ） ============ */
const BEAM = 12;
const DEPTH = 10;
const REFINE = 18; // 生贄・相手の反撃まで考えて比べ直す候補の数
const REPLY_W = 0.7; // 相手の反撃後の点数をどれだけ重視するか

const THINK_MS = 900; // 1手あたりの思考時間の目安（ミリ秒）
const MIN_DEPTH = 4; // 遅い端末でも最低限ここまでは先読みする

function planMain(state, me, w, t0 = Date.now()) {
  const root = hiddenCopy(state);
  // 候補：{ first: 最初の1手（null=何もしない）, s: その先の状態, score }
  const leaves = [{ first: null, s: root, score: evaluate(root, me, w) }];
  let beam = [{ s: root, first: null }];

  for (let d = 0; d < DEPTH; d++) {
    if (d >= MIN_DEPTH && Date.now() - t0 > THINK_MS * 0.4) break;
    const children = [];
    for (const node of beam) {
      if (!E.isActive(node.s, me, "main")) continue;
      for (const act of mainActions(node.s, me, w)) {
        const ns = applyAction(node.s, me, act);
        if (!ns) continue;
        const first = node.first || act;
        if (ns.winner === me) return first; // 勝ち確定の手順
        const score = evaluate(ns, me, w);
        children.push({ s: ns, first, score });
      }
    }
    if (!children.length) break;
    children.sort((a, b) => b.score - a.score);
    const seen = new Set();
    beam = [];
    for (const c of children) {
      const k = stateKey(c.s, me);
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(c);
      leaves.push(c);
      if (beam.length >= BEAM) break;
    }
  }

  // 上位の候補を「生贄まで含めた点数」で比べ直す
  // （スマホでも待たせすぎないよう、時間切れになったら残りの候補は比べない）
  leaves.sort((a, b) => b.score - a.score);
  const idle = leaves.find((l) => l.first === null);
  const top = [idle, ...leaves.slice(0, REFINE).filter((l) => l !== idle)];
  let best = null;
  for (let i = 0; i < top.length; i++) {
    if (i >= 3 && Date.now() - t0 > THINK_MS) break;
    const l = top[i];
    const after = bestAfterSacrifice(l.s, me, w);
    const sc = after.score + REPLY_W * replyScore(after.s, me, w);
    // 同点なら「何もしない」より行動を優先しない（無駄な行動を避ける）
    if (!best || sc > best.score + 0.01) best = { first: l.first, score: sc };
  }
  return best ? best.first : null; // null ＝ もう何もしない方が良い
}

/* ============ 生贄の選択 ============ */
function chooseSacrifice(state, me, w) {
  const sim = hiddenCopy(state);
  let bestIdx = -1;
  let bestScore = evaluate(sim, me, w);
  const seen = new Set();
  sim.players[me].hand.forEach((h, i) => {
    const k = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(k)) return;
    seen.add(k);
    if (!sacrificeOk(sim.players[me], h, w)) return;
    const ns = E.sacrifice(sim, me, i);
    if (!ns) return;
    const sc = evaluate(ns, me, w);
    if (sc > bestScore) { bestScore = sc; bestIdx = i; }
  });
  return bestIdx;
}

/* ============ 外部から呼ぶ：CPUの1手 ============ */
// CPUの手番なら「1手進めた次の状態」を返す。CPUの手番でなければ null。
export function cpuStep(state, cpuId, style = "balanced") {
  if (!state || state.phase !== "play" || state.winner || state.turn !== cpuId) return null;
  const ph = E.phaseOf(state);
  if (ph === "draw") return E.drawStep(state, cpuId);

  // 相手のデッキと勝ち筋を読んで、戦い方を調整する（作戦はターンの初めに1回だけ考える）
  const read = readOpponent(state, cpuId);
  const plan = turnPlan(state, cpuId, read);
  // 思考時間は作戦を立てた後から数える（作戦の計算で先読みの時間が削られないように）
  const t0 = Date.now();
  const w = adaptStyle(STYLE[style] || STYLE.balanced, read, plan, state, cpuId);

  if (ph === "main") {
    const act = planMain(state, cpuId, w, t0);
    if (act) {
      const ns = applyAction(state, cpuId, act);
      if (ns) return ns;
    }
    return E.toSacrifice(state, cpuId);
  }

  if (ph === "sacrifice") {
    if (E.canSacrifice(state, cpuId)) {
      const idx = chooseSacrifice(state, cpuId, w);
      if (idx >= 0) {
        const ns = E.sacrifice(state, cpuId, idx);
        if (ns) return ns;
      }
    }
    return E.endTurn(state, cpuId);
  }
  return null;
}

// スターピック（lib/starpick.js）で使う
export { VALUE, STYLE };
