// ============================================================
// CPU（思考ロジック＋デッキ）
// ・メインフェーズは「ビームサーチ」でターン全体の行動順を先読みし、
//   一番良い並びの「最初の1手」を実行 → 実行後にまた考え直す。
//   時間が余れば候補の幅を広げて考え直す。とどめの並びは深さ優先でも探す。
// ・盤面評価は HP・場・手札・コスト・次ターンの被ダメージ（リーサル）を点数化。
// ・ターン終了時の効果（冥王星の乙女・セラフィム・ルクスの特殊勝利）も先取りして判断する。
// ・有力な候補は「生贄」と「相手の次のターンの攻撃」まで先読みして比べ直す。
// ・最後に有力な候補を「想定した相手の手札」で何通りも試し、相手のターン＋自分の次のターンまで
//   実際に進めて平均点で比べる（相手の手札は公開情報からありうるデッキを推理して作る）。
//   どの候補も同じ想定・同じ乱数で比べるので、運ではなく手の良し悪しで選べる。
//   思考時間は1手0.7秒まで（作戦を立てる時間も含む）。
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
import {
  CPU_DECKS, pickCpuDeck, STYLE, CPU_STYLES, VALUE, DEATH_VALUE, UNIT_BONUS, DEATH_TRIGGER,
} from "./cpuData";

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
  // 土星
  if (u.tokenId === "saturn_rose") v += 2.5; // 交戦する相手に1ダメージ（実質スタッツ+1）・交戦以外でダメージを受けない
  if (id === "saturn_princess" && u.noDeathTrigger) v -= UNIT_BONUS.saturn_princess || 0;
  if (u.immuneDestroy) v += 5; // カードの効果で破壊されない
  if (u.immuneEffectDamage) v += 4; // 交戦以外でダメージを受けない
  return v;
}

function handValue(h, p, w) {
  const info = E.handInfo(h);
  if (!info) return 0;
  const k = keyOf(h);
  let V = (w && w.boost && w.boost[k]) ?? VALUE[k] ?? VALUE[info.copyOf] ?? costValue(info);
  // 同じ名前のアビリティがもう付いている
  // 同じ名前のアビリティは同時に1枚しか付けられないので、2枚目以降（または付いている時）は控えの価値
  const spare = info.type === "ability" &&
    (E.hasAbility(p, k) || p.hand.find((x) => keyOf(x) === k) !== h);
  if (spare) {
    // 付いている方を外して（効果を使って）付け直せる
    V = k === "mercury_awakening" ? 6 : k === "mercury_sonic" ? 4 : k === "saturn_dragongate" ? 8 : 1;
  }
  // 水星のソニックバッチ：即時召喚できるキャラが手札に多いほど価値が高い
  if (k === "mercury_sonic") V = 5 + 1.2 * p.hand.filter((x) => E.hasteAllowed(E.handInfo(x))).length;
  if (k === "mercury_hornet" && w && w.combo === "hornet") V += 9 * Math.max(0, info.cost - E.playCost(h));
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
  // 土星の時限装置：破壊されるとスタッツ4が出る（ドローは装着した時に済んでいる。タイマーが少ないほど近い）
  if (t === "saturn_timebomb") return 6 - 0.6 * (a.timer || 0);
  // 土星の高き防波堤：ダメージを受けるとスタッツ7のディフェンダーがもう1体出る
  if (t === "saturn_breakwater") return 8;
  // 土星の竜門：毎ターン、スタッツ4のファストアタックが出続ける
  if (t === "saturn_dragongate") return 16;
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
  // 土星の竜門：ターン開始時にファストアタックのドラゴンが出る
  if (E.hasAbility(attacker, "saturn_dragongate") && attacker.field.length < E.MAX_FIELD) {
    face += defs.length ? Math.max(0, 4 - 2) : 4;
  }
  const c = Math.min(E.MAX_COST, attacker.maxCost + (attacker.pendingCost || 0));
  const reach = attacker.hand.length === 0 ? 0 : c >= 8 ? 6 : c >= 6 ? 4 : c >= 2 ? 2 : 0;
  return { face, reach };
}

/* ============ 盤面評価（me から見た点数） ============ */
// 相手の場の価値の重み（CPU同士の対戦で 1.05 → 1.3 に調整：相手の盤面を減らすことを重く見る）
const ENEMY_FIELD_W = 1.3;
// 相手のキャラ1体あたりの減点（CPU同士の対戦で調整）
const ENEMY_UNIT_W = 2.5;
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
  v -= o.field.reduce((a, u) => a + unitValue(u), 0) * ENEMY_FIELD_W;
  // 相手のキャラは1体ごとに減点（小さなキャラでも放置せず、得な時は処理する）
  v -= ENEMY_UNIT_W * o.field.filter((u) => !E.hasKw(u, "dies_end_of_turn")).length;

  if (!noOwnHand) v += p.hand.reduce((a, h) => a + handValue(h, p, w), 0);

  v += abilitiesValue(p, o, w);
  v -= abilitiesValue(o, p, STYLE.balanced) * 1.05;
  v += albertTargetValue(p);
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
  else if (!skip && opHp > 0 && out.face >= opHp * LETHAL_RAMP) {
    // リーサルに近いほど少しずつ加点（1点の差で点数が急に変わり、相打ちや小さなキャラの処理を嫌がるのを防ぐ）
    v += 25 * w.face * (out.face - opHp * LETHAL_RAMP) / (opHp * (1 - LETHAL_RAMP));
  }

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

  // 土星：屍（墓地のコストの合計）を貯めるほど、屍の効果が強くなる
  if (w.corpse) v += w.corpse * Math.min(E.corpseOf(p), 45);

  if (skip) v += 18;
  return v;
}

// 終盤の守り
const LETHAL_RAMP = 0.6; // 次のターンの打点が相手HPのこの割合を超えたら、リーサルへの近さに応じて加点する
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

// 地球のアルベール：生贄置き場のコスト7以下で一番高いキャラをコピーして出す
// アルベールが手札・山札に残っているなら、生贄置き場の「コピー元」にも価値がある
// （カミラなどの重いキャラを先に生贄にしてHPを稼ぎ、あとでアルベールで場に出す動き）
function albertTargetValue(p) {
  const left = p.hand.filter((x) => keyOf(x) === "earth_albert").length +
    p.deck.filter((x) => keyOf(x) === "earth_albert").length;
  if (!left) return 0;
  const chars = (p.sacrifice || []).map((x) => E.handInfo(x)).filter((c) => c && c.type === "character" && c.cost <= 7);
  if (!chars.length) return 0;
  const maxC = Math.max(...chars.map((c) => c.cost));
  const best = Math.max(...chars.filter((c) => c.cost === maxC).map((c) => VALUE[c.copyOf || c.id] || c.cost));
  return best * Math.min(1, 0.45 + 0.15 * left);
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
  if (!SEE_HAND) {
    o.hand = threatHand(read);
    o.deck = threatDeck(read, o.deck.length);
  }
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
        if (!ns || wastesFaceAttack(node.s, op, act, ns)) continue;
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

// 対象を取る効果が、その相手キャラクターに実際に効くか
const DESTROY_KINDS = new Set(["destroy", "destroyDraw"]);
const DAMAGE_KINDS = new Set(["damage3", "damage6", "crest"]);
function effectWorks(kind, u) {
  if (!u) return true; // アビリティなど（キャラ以外の対象）はそのまま
  if (DESTROY_KINDS.has(kind) && u.immuneDestroy) return false;
  if (DAMAGE_KINDS.has(kind) && (u.immuneEffectDamage || u.tokenId === "saturn_rose")) return false;
  return true;
}

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
const countIn = (arr, id) => arr.filter((x) => keyOf(x) === id).length;

// 手札のキマイラを全部出すのに必要なコスト（出すたびに残りが-1される）
function chimeraBurstCost(p) {
  const cs = p.hand.filter((h) => keyOf(h) === "mercury_chimera").map((h) => E.playCost(h)).sort((a, b) => a - b);
  let total = 0;
  cs.forEach((c, i) => { total += Math.max(1, c - i); });
  return { n: cs.length, total };
}

// その行動を今やってよいか（false なら候補から外す）
// フェードアウトで消す価値があるキャラか
const FADEOUT_MIN_VALUE = 6; // 盤面の価値（スタッツ5程度）
function fadeoutWorthy(u) {
  if (u.immuneDestroy || u.immuneEffectDamage || E.isInvincible(u)) return true;
  if (DEATH_TRIGGER.has(E.effectId(u)) && (u.cost || 0) >= 4) return true; // 消滅なら破壊トリガーも出ない
  return unitValue(u) >= FADEOUT_MIN_VALUE;
}

// 相手のキャラを手札に戻す価値があるか
function bounceWorthy(u) {
  if (u.token) return true; // トークンは出し直しに召喚トリガーがない
  const info = E.unitInfo(u);
  const base = info && info.stat != null ? info.stat : u.stat;
  if (u.stat < base) return false; // 減ったスタッツが元に戻る
  if (E.SUMMON_TRIGGER.has(E.effectId(u)) && u.stat <= base) return false; // 召喚トリガーをもう一度使われる
  return true;
}

function comboAllows(s, me, act, w, ctx) {
  if (ctx.danger) return true; // 負けそうなら何でも使う
  const p = s.players[me];
  const now = s.turnCount;
  const card = act.type === "play" ? E.handInfo(p.hand.find((h) => h.uid === act.handUid)) : null;
  const id = card ? card.id || card.copyOf : null;
  const handFull = p.hand.length >= 9;

  // 土星のフェードアウト：薔薇トークンなどの小さなキャラには使わない
  // （大物・破壊耐性持ち・破壊トリガー持ち・アビリティのために取っておく。手札がいっぱいの時は使ってよい）
  if (id === "saturn_fadeout" && act.target && !handFull) {
    const o = s.players[E.otherId(s, me)];
    const t = o.field.find((u) => u.uid === act.target);
    if (t && !fadeoutWorthy(t)) return false;
  }

  // 月の紋章（相手のキャラを手札に戻す）：戻すと相手が得をするキャラには使わない
  // ・召喚トリガー持ち（太陽の僧侶など）：出し直しでもう一度召喚トリガーを使われる（強化されている時だけ戻してよい）
  // ・スタッツが減っているキャラ：手札に戻すと元のスタッツに戻ってしまう
  if (id === "moon_crest" && act.target) {
    const o = s.players[E.otherId(s, me)];
    const t = o.field.find((u) => u.uid === act.target);
    if (t && !bounceWorthy(t)) return false;
  }

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
      // 相手にディフェンダーがいる間はホーネットを出さない（ダイレクトできないので、審判などで先にどかす）
      if (id === "mercury_hornet" && !handFull) {
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
      // 竜門：外すとドラゴンが出る。手札に同じ竜門があれば付け直してもう1体
      if (a.cardId === "saturn_dragongate" && p.field.length < E.MAX_FIELD &&
        p.hand.some((h) => keyOf(h) === "saturn_dragongate" && E.playCost(h) <= p.cost)) acts.push({ type: "remove", uid: a.uid });
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

// 対象1体へのダメージ量（太陽の僧侶・太陽の紋章：4、水星のキマイラ：6）
const DAMAGE_AMOUNT = { damage3: 4, crest: 4, damage6: 6 };

// 同じキャラが複数いる時の、ダメージの対象の候補
// ・倒せないなら、スタッツの大きい方を狙う（小さい方を削っても得をしない）
// ・倒せるキャラがいれば「倒せる中で一番大きい方」も候補に残す（倒すか、大きい方を削るかは先読みで決める）
function sameCharDamageTargets(field, uids, dmg) {
  const groups = {};
  uids.forEach((id) => {
    const u = field.find((x) => x.uid === id);
    const k = u ? E.effectId(u) || u.tokenId || id : id;
    (groups[k] = groups[k] || []).push({ id, stat: u ? u.stat : 0 });
  });
  const out = [];
  Object.values(groups).forEach((g) => {
    if (g.length === 1) { out.push(g[0].id); return; }
    const big = g.reduce((a, b) => (b.stat > a.stat ? b : a));
    out.push(big.id);
    const kill = g.filter((x) => x.stat <= dmg);
    if (kill.length) {
      const k = kill.reduce((a, b) => (b.stat > a.stat ? b : a));
      if (k.id !== big.id) out.push(k.id);
    }
  });
  return out;
}

// 対象がいないと何も起きない魔法
const NEEDS_TARGET = new Set(["saturn_fadeout", "earth_order", "sun_crest"]);

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
          // 効果が効かない相手（破壊耐性・効果ダメージ耐性）は、ほかに対象がいるなら選ばない
          const useful = tk.candidates.filter((id) => effectWorks(tk.kind, o.field.find((x) => x.uid === id)));
          cands = dedupeUnits(o.field, useful.length ? useful : tk.candidates);
          if (DAMAGE_AMOUNT[tk.kind]) cands = sameCharDamageTargets(o.field, cands, DAMAGE_AMOUNT[tk.kind]);
        }
        cands.forEach((t) => acts.push({ type: "play", handUid: h.uid, haste, target: t }));
      } else if (tk && NEEDS_TARGET.has(keyOf(h)) && p.hand.length < 9) {
        // 対象1体へのダメージ量（太陽の僧侶・太陽の紋章：4、水星のキマイラ：6）
const DAMAGE_AMOUNT = { damage3: 4, crest: 4, damage6: 6 };

// 同じキャラが複数いる時の、ダメージの対象の候補
// ・倒せないなら、スタッツの大きい方を狙う（小さい方を削っても得をしない）
// ・倒せるキャラがいれば「倒せる中で一番大きい方」も候補に残す（倒すか、大きい方を削るかは先読みで決める）
function sameCharDamageTargets(field, uids, dmg) {
  const groups = {};
  uids.forEach((id) => {
    const u = field.find((x) => x.uid === id);
    const k = u ? E.effectId(u) || u.tokenId || id : id;
    (groups[k] = groups[k] || []).push({ id, stat: u ? u.stat : 0 });
  });
  const out = [];
  Object.values(groups).forEach((g) => {
    if (g.length === 1) { out.push(g[0].id); return; }
    const big = g.reduce((a, b) => (b.stat > a.stat ? b : a));
    out.push(big.id);
    const kill = g.filter((x) => x.stat <= dmg);
    if (kill.length) {
      const k = kill.reduce((a, b) => (b.stat > a.stat ? b : a));
      if (k.id !== big.id) out.push(k.id);
    }
  });
  return out;
}

// 対象がいないと何も起きない魔法は使わない（空撃ちでカードを無駄にしない。手札がいっぱいの時だけは使ってよい）
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

// 「ダイレクトしても自分が何も損をしない」か（実際に攻撃した後の状態で判定する）
// 相手の水星の反逆（ダメージで破壊されると自軍全体に3ダメージ）のように、
// ダイレクトで自分の場が傷つく・減る時や、自分のHP・アビリティが減る時は「損あり」
function freeFaceAttack(s, me, u) {
  const ao = E.attackOptions(s, me, u.uid);
  if (!ao || !ao.face) return false;
  const ex = E.attackExtraCandidates(s, me, u.uid);
  const ns = E.attack(s, me, u.uid, { toFace: true, extraTarget: ex ? ex[0] : null });
  if (!ns) return false;
  if (ns.winner) return ns.winner === me;
  const p0 = s.players[me], p1 = ns.players[me];
  if (p1.hp < p0.hp) return false;
  if (E.abilitiesOf(p1).length < E.abilitiesOf(p0).length) return false;
  return p0.field.every((x) => {
    const y = p1.field.find((z) => z.uid === x.uid);
    return y && y.stat >= x.stat;
  });
}

// 自分のキャラを場から離す手（自軍を破壊する召喚トリガー・手札に戻す効果など）を使う時、
// 離れるキャラが「損なくダイレクトできる」なら、先にダイレクトしてから使う方が必ず得
// （ダイレクトしたキャラは場に残るので、その後の効果の結果は変わらない）
// → そういう手は候補から外し、先に攻撃させる。カードごとの個別判定ではなく、
//   実際に使った後の状態で「場を離れたキャラ」を見て判定する。
//   ダイレクトに損がある時（相手に水星の反逆が付いている等）は外さず、順番は先読みに任せる
function wastesFaceAttack(s, me, act, ns) {
  if (act.type !== "play" || !ns || ns.winner) return false;
  const after = new Set(ns.players[me].field.map((u) => u.uid));
  return s.players[me].field.some((u) => !after.has(u.uid) && freeFaceAttack(s, me, u));
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
const BEAM_MAX = 48; // 時間が余ったら、候補の幅をここまで広げて考え直す
const DEPTH = 10;
const REFINE = 40; // 生贄・相手の反撃まで考えて比べ直す候補の数（時間が許す範囲で）
const REPLY_W = 0.7; // 相手の反撃後の点数をどれだけ重視するか

const THINK_MS = 650; // 1手あたりの思考時間の上限の目安（ミリ秒。作戦を立てる時間も含めて0.7秒以内）
const REFINE_FRAC = 0.25; // 思考時間のうち、候補の比べ直し（相手の反撃の先読み）に使う割合
const SAMPLE_CANDS = 8; // 想定した手札で試す候補の数（＋「何もしない」）
const MAX_SAMPLES = 60; // 1候補あたりの想定の数の上限
const MIN_BUDGET = 250; // 作戦に時間がかかっても、最低限ここまでは考える（ミリ秒）
// プレイヤーの手札を見て先回りする（山札の並びは見ない）
const SEE_HAND = true;
// 「何もしない」が一番良さそうでも、動く手との差がこれ以内なら動く（無駄に止まらない）
const STAY_MARGIN = 150;
const MIN_DEPTH = 4; // 遅い端末でも最低限ここまでは先読みする

// ビームサーチ1回分（width：残す候補の数）。leaves に「途中の状態」をためる。勝ち確定の手順があれば返す
function beamSearch(root, me, w, t0, width, leaves, seenLeaf, budget) {
  let beam = [{ s: root, first: null }];
  for (let d = 0; d < DEPTH; d++) {
    if (d >= MIN_DEPTH && Date.now() - t0 > budget) break;
    const children = [];
    for (const node of beam) {
      if (!E.isActive(node.s, me, "main")) continue;
      for (const act of mainActions(node.s, me, w)) {
        const ns = applyAction(node.s, me, act);
        if (!ns) continue;
        const first = node.first || act;
        if (ns.winner === me) return { win: first }; // 勝ち確定の手順
        if (wastesFaceAttack(node.s, me, act, ns)) continue; // 先に殴れるキャラを無駄にする手は後回し
        const score = evaluate(ns, me, w);
        children.push({ s: ns, first, score });
      }
      if (d >= MIN_DEPTH && Date.now() - t0 > budget * 1.5) break;
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
      if (!seenLeaf.has(k)) {
        seenLeaf.add(k);
        leaves.push(c);
      }
      if (beam.length >= width) break;
    }
  }
  return {};
}

/* ============ とどめの手順探し（深さ優先） ============ */
// ビームサーチは点数の高い並びしか残さないので、とどめの並び（ディフェンダーを先に倒してからダイレクト等）を
// 取りこぼすことがある。そこで、勝てる並びがあるかを深さ優先で探す（時間と手数に上限あり）
const LETHAL_NODES = 3000;
function findLethal(root, me, t0, limitMs) {
  let nodes = 0;
  const seen = new Set();
  const endWins = (s) => {
    const sac = E.toSacrifice(s, me);
    const end = sac && E.endTurn(sac, me);
    return !!end && end.winner === me;
  };
  const dfs = (s, depth) => {
    if (++nodes > LETHAL_NODES || Date.now() - t0 > limitMs) return null;
    const k = stateKey(s, me);
    if (seen.has(k)) return null;
    seen.add(k);
    if (endWins(s)) return "END";
    if (depth >= 12) return null;
    const acts = mainActionsRaw(s, me);
    // 竜門を外すとファストアタックのドラゴンが出るので、リーサルの手として試す
    const pp = s.players[me];
    if (E.canRemoveAbility(s, me) && pp.field.length < E.MAX_FIELD) {
      E.abilitiesOf(pp).forEach((a) => {
        if (a.cardId === "saturn_dragongate") acts.push({ type: "remove", uid: a.uid });
      });
    }
    // ダイレクト → 攻撃 → カードの順に試す
    const rank = (a) => (a.type === "attack" ? (a.face ? 0 : 1) : a.type === "play" ? 2 : 3);
    acts.sort((a, b) => rank(a) - rank(b));
    for (const act of acts) {
      const ns = applyAction(s, me, act);
      if (!ns) continue;
      if (ns.winner === me) return act;
      if (ns.winner) continue;
      if (dfs(ns, depth + 1)) return act;
    }
    return null;
  };
  const r = dfs(root, 0);
  return r && r !== "END" ? r : null;
}

function planMain(state, me, w, t0 = Date.now(), budget = THINK_MS) {
  const root = hiddenCopy(state);
  // まず、このターンに勝てる並びがないか探す
  const lethal = findLethal(root, me, t0, budget * 0.2);
  if (lethal) return lethal;
  // 候補：{ first: 最初の1手（null=何もしない）, s: その先の状態, score }
  const leaves = [{ first: null, s: root, score: evaluate(root, me, w) }];
  const seenLeaf = new Set();

  // まず標準の幅で考え、時間が余っていれば幅を広げて考え直す（スマホでも思考時間はほぼ一定）
  let width = BEAM;
  for (;;) {
    const r = beamSearch(root, me, w, t0, width, leaves, seenLeaf, budget * 0.4);
    if (r.win) return r.win;
    width *= 2;
    if (width > BEAM_MAX || Date.now() - t0 > budget * 0.15) break;
  }

  // 上位の候補を「生贄まで含めた点数＋相手の反撃（持っていたらまずいカード前提）」で比べ直す
  // （スマホでも待たせすぎないよう、時間切れになったら残りの候補は比べない）
  leaves.sort((a, b) => b.score - a.score);
  const idle = leaves.find((l) => l.first === null);
  // 最初の1手が同じ候補ばかりにならないよう、最初の1手ごとに一番良い候補を先に並べる
  const byFirst = new Map();
  const rest = [];
  for (const l of leaves) {
    if (l === idle) continue;
    const k = l.first ? JSON.stringify(l.first) : "idle";
    if (!byFirst.has(k)) byFirst.set(k, l);
    else rest.push(l);
  }
  const top = [idle, ...[...byFirst.values(), ...rest].slice(0, REFINE)];
  const scored = [];
  for (let i = 0; i < top.length; i++) {
    if (i >= 3 && Date.now() - t0 > budget * REFINE_FRAC) break;
    const l = top[i];
    const after = bestAfterSacrifice(l.s, me, w);
    const sc = after.score + REPLY_W * replyScore(after.s, me, w);
    scored.push({ first: l.first, s: after.s, base: sc });
  }
  // 最初の1手ごとに一番良い並びだけ残し、点数の高い順に候補にする（「何もしない」も必ず入れる）
  const uniq = new Map();
  [...scored].sort((a, b) => b.base - a.base).forEach((c) => {
    const k = c.first ? JSON.stringify(c.first) : "idle";
    if (!uniq.has(k)) uniq.set(k, c);
  });
  const cands = [...uniq.values()].slice(0, SAMPLE_CANDS);
  if (!cands.includes(scored[0])) cands.push(scored[0]);
  let first;
  if (cands.length === 1) first = cands[0].first;
  else {
    // 想定した相手の手札で、相手のターン＋自分の次のターンまで進めて比べ直す
    const pick = sampledChoice(cands, me, w, t0, budget);
    first = pick ? pick.first : null;
    // 無駄に止まらない：「何もしない」との差が小さいなら、一番良い動く手を選ぶ
    if (!first && pick) {
      let mv = null;
      for (const c of cands) {
        if (!c.first || !c.n) continue;
        const sc = c.sum / c.n;
        if (sc >= pick.sc - STAY_MARGIN && (!mv || sc > mv.sc)) mv = { first: c.first, sc };
      }
      if (mv) first = mv.first;
    }
  }
  // ターンを終える前に、ノーリスクの攻撃が残っていれば必ずやる
  if (!first) first = freeAttack(state, me, w);
  return first; // null ＝ もう何もしない方が良い
}

// ノーリスクの攻撃：自分のキャラもHPも減らずに、相手のキャラを倒すか相手にダメージを与えられる攻撃
// （その中で盤面の点数が一番上がるもの。無ければ null）
function freeAttack(state, me, w) {
  const op = E.otherId(state, me);
  const p = state.players[me], o = state.players[op];
  const base = evaluate(state, me, w);
  let best = null;
  for (const u of p.field) {
    const opt = E.attackOptions(state, me, u.uid);
    if (!opt) continue;
    const tries = opt.units.map((t) => ({ type: "attack", attacker: u.uid, target: t }));
    if (opt.face) tries.push({ type: "attack", attacker: u.uid, face: true });
    for (const act of tries) {
      const ns = applyAction(state, me, act);
      if (!ns) continue;
      if (ns.winner === me) return act;
      if (ns.winner) continue;
      const np = ns.players[me], no = ns.players[op];
      const mine = new Set(np.field.map((x) => x.uid));
      if (p.field.some((x) => x.uid !== u.uid && !mine.has(x.uid)) || !mine.has(u.uid)) continue;
      if (np.hp < p.hp) continue;
      const gain = no.field.length < o.field.length || no.hp < o.hp;
      if (!gain) continue;
      const sc = evaluate(ns, me, w) - base;
      if (sc > 0.5 && (!best || sc > best.sc)) best = { act, sc };
    }
  }
  return best ? best.act : null;
}

/* ============ 生贄の選択 ============ */
// 生贄にする候補（しない場合も含む）を、想定した相手の手札で相手のターン＋自分の次のターンまで進めて比べる
function chooseSacrifice(state, me, w, t0 = Date.now(), budget = THINK_MS) {
  const sim = hiddenCopy(state);
  const cands = [{ idx: -1, s: sim, base: evaluate(sim, me, w) }];
  const seen = new Set();
  sim.players[me].hand.forEach((h, i) => {
    const k = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(k)) return;
    seen.add(k);
    if (!sacrificeOk(sim.players[me], h, w)) return;
    const ns = E.sacrifice(sim, me, i);
    if (ns) cands.push({ idx: i, s: ns, base: evaluate(ns, me, w) });
  });
  if (cands.length <= 1) return -1;
  cands.sort((a, b) => b.base - a.base);
  const pick = sampledChoice(cands.slice(0, SAMPLE_CANDS), me, w, t0, budget);
  return pick ? pick.idx : -1;
}

/* ============ 想定した相手の手札で、相手のターン＋自分の次のターンまで進めて比べる ============ */
// 相手の手札・山札は、公開情報からありうるデッキを1つ選び、その残りのカードから作る（ズルなし）。
// 自分の山札も並びは見ない（想定ごとに並べ直す）。
// どの候補も「同じ想定・同じ乱数」で試すので、運の良し悪しではなく手の良し悪しで比べられる。
const WIN_SC = 2500; // 先読みの中で勝った（負けた）時の点数
const REPLY_BEAM_S = 2; // 想定した相手のターンの読みの幅・深さ
const REPLY_DEPTH_S = 6;
const MY_BEAM_S = 2; // 自分の次のターンの読みの幅・深さ
const MY_DEPTH_S = 6;

// 決まった乱数（同じ種なら同じ並び）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// fn の中だけ乱数を決まった並びにする（エンジンの乱数も候補ごとにそろえるため）
function withSeed(seed, fn) {
  const R = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = R; }
}

// 相手の手札・山札の想定を1つ作る（ありうるデッキを1つ選び、残りのカードを並べる）
function makeSample(read, o, rnd) {
  const cands = read.cands.length ? read.cands : DECKS;
  const tot = cands.reduce((a, d) => a + (d.share || 1), 0);
  let r = rnd() * tot, deck = cands[cands.length - 1];
  for (const d of cands) { r -= d.share || 1; if (r < 0) { deck = d; break; } }
  const left = {};
  read.pool.forEach((x) => { left[x.id] = x.left; });
  const ids = [];
  SLOTS.forEach((sl) => {
    const id = read.known[sl] || deck.selection[sl];
    const n = read.known[sl] ? (left[id] || 0) : 4;
    for (let i = 0; i < n; i++) ids.push(id);
  });
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  // 公開されたコスト軽減（どの手札に残っているかは分からないので、それらしく乗せる）
  const reds = (o.reductions || []).map((red) => ({ n: red.n, pick: red.pick, on: rnd() < (red.pick ? 0.7 : 0.45), at: rnd() }));
  return { ids, reds, mySeed: (rnd() * 1e9) | 0, simSeed: (rnd() * 1e9) | 0 };
}

// 決まった並べ方でシャッフル（中身が同じなら、どの候補でも同じ順になる）
function seededShuffle(deck, seed) {
  const rnd = mulberry32(seed);
  const d = [...deck].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 想定を状態に当てはめる（s を直接書き換える）
function applySample(s, me, smp) {
  const op = E.otherId(s, me);
  const o = s.players[op];
  if (SEE_HAND) {
    // 手札はそのまま。山札は中身をそのまま、並びだけ想定ごとに決める
    o.deck = seededShuffle(o.deck, smp.simSeed ^ 0x5bd1e995);
    s.players[me].deck = seededShuffle(s.players[me].deck, smp.mySeed);
    return;
  }
  const ids = smp.ids;
  const nh = o.hand.length, nd = o.deck.length;
  const take = (i) => (ids.length ? ids[i % ids.length] : "pluto_goblin");
  const hand = [];
  for (let i = 0; i < nh; i++) hand.push({ uid: "sh" + i, cardId: take(i), costMod: 0 });
  const dk = [];
  for (let i = 0; i < nd; i++) dk.push({ uid: "sd" + i, cardId: take(nh + i), costMod: 0 });
  smp.reds.forEach((red) => {
    if (!hand.length || !red.on) return;
    if (red.pick) {
      // 選んで下げる効果は、一番重いカードに
      let bi = 0;
      hand.forEach((h, i) => { if (E.playCost(h) > E.playCost(hand[bi])) bi = i; });
      hand[bi].costMod -= red.n;
    } else {
      hand[Math.floor(red.at * hand.length)].costMod -= red.n;
    }
  });
  hand.forEach((h) => {
    // 手札にある間に安くなるカード（キマイラなど）：最初から持っていた前提
    const c = E.handInfo(h);
    if (c && c.handCostOnSummon) h.costMod += c.handCostOnSummon * (o.summonCount || 0);
    const floor = c && c.handCostMin != null ? c.handCostMin : 0;
    if (c && c.cost + h.costMod < floor) h.costMod = floor - c.cost;
  });
  o.hand = hand;
  o.deck = dk;
  // 自分の山札：想定ごとに決まった並べ方にする（どの候補でも同じ順に引く）
  const p = s.players[me];
  const rnd = mulberry32(smp.mySeed);
  const d = [...p.deck].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  p.deck = d;
}

// pid の1ターン分のメイン（小さなビームサーチ）。一番良い状態を返す
function quickTurn(s0, pid, w, beamW, depth) {
  let best = { s: s0, sc: evaluate(s0, pid, w) };
  let beam = [s0];
  for (let d = 0; d < depth; d++) {
    const children = [];
    for (const st of beam) {
      for (const act of mainActionsRaw(st, pid)) {
        const ns = applyAction(st, pid, act);
        if (!ns || wastesFaceAttack(st, pid, act, ns)) continue;
        if (ns.winner === pid) return { s: ns, sc: 1e6 };
        if (ns.winner) continue;
        const sc = evaluate(ns, pid, w);
        children.push({ s: ns, sc });
        if (sc > best.sc) best = { s: ns, sc };
      }
    }
    if (!children.length) break;
    children.sort((a, b) => b.sc - a.sc);
    const seen = new Set();
    beam = [];
    for (const c of children) {
      const k = stateKey(c.s, pid);
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(c.s);
      if (beam.length >= beamW) break;
    }
  }
  return best;
}

// 生贄フェーズ（一番良い生贄を選ぶ）→ ターン終了
function finishTurn(s, pid, w) {
  if (s.winner) return s;
  let t = E.isActive(s, pid, "main") ? E.toSacrifice(s, pid) : s;
  if (!t) return s;
  if (E.canSacrifice(t, pid)) {
    let best = { s: t, sc: evaluate(t, pid, w) };
    const seen = new Set();
    t.players[pid].hand.forEach((h, i) => {
      const k = keyOf(h) + ":" + (h.costMod || 0);
      if (seen.has(k)) return;
      seen.add(k);
      if (!sacrificeOk(t.players[pid], h, w)) return;
      const ns = E.sacrifice(t, pid, i);
      if (!ns) return;
      const sc = evaluate(ns, pid, w);
      if (sc > best.sc) best = { s: ns, sc };
    });
    t = best.s;
  }
  return E.endTurn(t, pid) || t;
}

// 自分のターンが終わった状態 s から、相手のターン → 自分の次のターンまで進めた点数（me から見て）
function rollout(s, me, w) {
  const op = E.otherId(s, me);
  const ow = STYLE.balanced;
  const term = (x) => (x.winner === me ? WIN_SC : -WIN_SC);
  // 相手のターン（時渡りの魔術師などで続けて来る場合も）
  for (let guard = 0; guard < 4; guard++) {
    if (s.winner) return term(s);
    if (s.turn !== op) break;
    if (E.phaseOf(s) === "draw") { s = E.drawStep(s, op) || s; if (s.winner) return term(s); }
    const r = quickTurn(s, op, ow, REPLY_BEAM_S, REPLY_DEPTH_S);
    if (r.s.winner) return term(r.s);
    s = finishTurn(r.s, op, ow);
  }
  if (s.winner) return term(s);
  if (s.turn !== me) return Math.max(-WIN_SC, Math.min(WIN_SC, evaluate(s, me, w)));
  // 自分の次のターン
  if (E.phaseOf(s) === "draw") { s = E.drawStep(s, me) || s; if (s.winner) return term(s); }
  const r = quickTurn(s, me, w, MY_BEAM_S, MY_DEPTH_S);
  if (r.s.winner) return term(r.s);
  const after = bestAfterSacrifice(r.s, me, w);
  return Math.max(-WIN_SC, Math.min(WIN_SC, after.score));
}

// 候補 { s: 自分のメイン（または生贄）が終わった状態 } を想定した相手の手札で試し、平均点が一番良いものを返す
function sampledChoice(cands, me, w, t0, budget) {
  const read = w.read || readOpponent(cands[0].s, me);
  const op = E.otherId(cands[0].s, me);
  cands.forEach((c) => { c.sum = 0; c.n = 0; });
  const rnd = mulberry32((Math.random() * 1e9) | 0);
  for (let k = 0; k < MAX_SAMPLES; k++) {
    if (k >= 1 && Date.now() - t0 > budget) break;
    const smp = makeSample(read, cands[0].s.players[op], rnd);
    let cut = false;
    for (const c of cands) {
      // 時間切れなら、この想定は全候補そろわないので数えない
      if (k >= 1 && Date.now() - t0 > budget * 1.05) { cut = true; break; }
      let v;
      if (c.s.winner) v = c.s.winner === me ? WIN_SC : -WIN_SC;
      else {
        const s = E.cloneState(c.s);
        s.log = [];
        applySample(s, me, smp);
        v = withSeed(smp.simSeed, () => {
          const x = E.isActive(s, me, "main") ? finishTurn(s, me, w)
            : E.isActive(s, me, "sacrifice") ? E.endTurn(s, me) : s;
          if (!x) return evaluate(c.s, me, w);
          if (x.winner) return x.winner === me ? WIN_SC : -WIN_SC;
          return rollout(x, me, w);
        });
      }
      c.part = v;
    }
    if (cut) break;
    cands.forEach((c) => { c.sum += c.part; c.n += 1; });
  }
  let best = null;
  for (const c of cands) {
    if (!c.n) continue;
    const sc = c.sum / c.n;
    // 同点なら先に並んでいる方（点数の高い候補）を選ぶ
    if (!best || sc > best.sc + 0.01) best = { ...c, sc };
  }
  return best;
}

/* ============ 外部から呼ぶ：CPUの1手 ============ */
// CPUの手番なら「1手進めた次の状態」を返す。CPUの手番でなければ null。
export function cpuStep(state, cpuId, style = "balanced") {
  if (!state || state.phase !== "play" || state.winner || state.turn !== cpuId) return null;
  const ph = E.phaseOf(state);
  if (ph === "draw") return E.drawStep(state, cpuId);

  // 相手のデッキと勝ち筋を読んで、戦い方を調整する（作戦はターンの初めに1回だけ考える）
  const tStart = Date.now();
  const read = readOpponent(state, cpuId);
  const plan = turnPlan(state, cpuId, read);
  // 残りの思考時間（作戦を立てた時間も含めて1手0.7秒以内に収める）
  const t0 = Date.now();
  const budget = Math.max(MIN_BUDGET, THINK_MS - (t0 - tStart));
  const w = adaptStyle(STYLE[style] || STYLE.balanced, read, plan, state, cpuId);

  if (ph === "main") {
    const act = planMain(state, cpuId, w, t0, budget);
    if (act) {
      const ns = applyAction(state, cpuId, act);
      if (ns) return ns;
    }
    return E.toSacrifice(state, cpuId);
  }

  if (ph === "sacrifice") {
    if (E.canSacrifice(state, cpuId)) {
      const idx = chooseSacrifice(state, cpuId, w, t0, budget);
      if (idx >= 0) {
        const ns = E.sacrifice(state, cpuId, idx);
        if (ns) return ns;
      }
    }
    return E.endTurn(state, cpuId);
  }
  return null;
}

// app/page.js・スターピック（lib/starpick.js）で使う（中身は lib/cpuData.js にある）
export { CPU_DECKS, pickCpuDeck, CPU_STYLES, VALUE, STYLE };
