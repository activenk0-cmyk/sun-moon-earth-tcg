// ============================================================
// ゲームエンジン（ルール処理のみ。画面やFirebaseには依存しない）
// すべての関数は「今の状態」を受け取り「次の状態」を返す。
// 不正な操作のときは null を返す（元の状態は変更しない）。
// オンライン対戦・CPU対戦・CPUの先読みで共通に使う。
// ============================================================
import { SLOTS, getCard, tokenInfo } from "./cards";

/* ============ 定数 ============ */
export const MAX_FIELD = 5;
export const MAX_HAND = 10;
export const INITIAL_HP = 10;
export const INITIAL_COST = 1;
export const MAX_COST = 10;
export const HASTE_EXTRA = 4;
export const SECOND_BONUS_ID = "second_bonus"; // 後攻ボーナス（lib/cards.js の SYSTEM_CARDS）
export const SECOND_BONUS_CARDS = 3; // 後攻ボーナスでコストが下がる手札の枚数
export const START_LOG = "対戦開始！ 先攻は1ターン目のドローなし／後攻には後攻ボーナスが装着される";
export const MERCURINO_PER_CARD = 2; // 水星の殺戮蟲マーキュリノ：使ったカード1枚あたりの上昇値
export const REPLICA_NEED = 5; // 土星のレプリカ・パレード：コストが下がるのに必要な、このターン使ったカードの枚数
export const REPLICA_OFF = 5; // 土星のレプリカ・パレード：下がるコスト
const LOG_LIMIT = 30;

/* ============ ユーティリティ ============ */
export const uid = () => Math.random().toString(36).slice(2, 10);
// 状態の複製（JSON.parse(JSON.stringify()) と同じ結果を、約5倍の速さで作る）
// undefined の項目は消し、配列の中の undefined は null にする（Firestoreに保存できる形のまま）
function deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const a = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v[i];
      a[i] = x === undefined ? null : deepClone(x);
    }
    return a;
  }
  const o = {};
  for (const k in v) {
    const x = v[k];
    if (x === undefined || typeof x === "function") continue;
    o[k] = x !== null && typeof x === "object" ? deepClone(x) : x;
  }
  return o;
}
export const cloneState = (s) => deepClone(s);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(selection) {
  const deck = [];
  SLOTS.forEach((slot) => {
    const cardId = selection[slot];
    for (let i = 0; i < 4; i++) deck.push({ uid: uid(), cardId, costMod: 0 });
  });
  return shuffle(deck);
}

export function newPlayer(deck, selection) {
  return {
    hp: INITIAL_HP,
    maxCost: INITIAL_COST,
    cost: INITIAL_COST,
    deck,
    hand: [],
    field: [],
    grave: [],
    sacrifice: [],
    sacrificedThisTurn: false,
    pendingCost: 0,
    abilities: [], // 装着しているアビリティ { uid, cardId, timer }
    playedThisTurn: 0, // このターンに使ったカードの枚数
    // 公開情報の記録（CPUの相手読みで使う。どのカードに効いたかは記録しない）
    reductions: [], // 手札のコストを下げた効果 { n: 下げた量, pick: 選んだカード（重ねがけ可）なら true }
    summonCount: 0, // 手札からキャラクターを召喚した回数
    selection,
  };
}

// 初期手札5枚を配る（player を直接書き換える）
export function dealInitialHand(player) {
  player.hand = player.deck.slice(0, 5);
  player.deck = player.deck.slice(5);
}

// ローカル対戦（CPU戦）用のゲーム状態を作る
export function createLocalGame({ p1, p2, sel1, sel2, first, log = [] }) {
  const players = {
    [p1]: newPlayer(buildDeck(sel1), sel1),
    [p2]: newPlayer(buildDeck(sel2), sel2),
  };
  dealInitialHand(players[p1]);
  dealInitialHand(players[p2]);
  const s = {
    host: p1,
    guest: p2,
    phase: "play",
    turn: first,
    turnPhase: "main", // 先攻1ターン目はドローなし
    turnCount: 1,
    skipNext: null,
    winner: null,
    log: [...log, START_LOG],
    players,
  };
  giveSecondBonus(s, first === p1 ? p2 : p1);
  return s;
}

// 後攻ボーナスを装着する（1試合に1回だけ。CPU戦・ルームマッチともにゲーム開始時に装着する）
// 普通のタイマーアビリティと同じく、自分のターン開始時に1減る
// （タイマー2 → 最初のターン開始時に1 → 2ターン目の開始時に0になって外れる）
export function giveSecondBonus(s, pid) {
  if (s.secondBonusGiven) return;
  const p = s.players[pid];
  if (!p) return;
  s.secondBonusGiven = true;
  const timer = getCard(SECOND_BONUS_ID)?.timer ?? 2;
  p.abilities = [...abilitiesOf(p), { uid: uid(), cardId: SECOND_BONUS_ID, timer }];
}

/* ============ 判定ヘルパー ============ */
export const hasKw = (u, k) => !!(u && u.keywords && u.keywords.includes(k));
export const isInvincible = (u) => hasKw(u, "invincible");
// 効果判定用ID（コピー・トークンは元カードの能力を持つ）
export const effectId = (u) => u.cardId || u.copyOf || null;
// 手札・場・生贄置き場のカード情報（トークンも通常カードと同じ形で扱う）
export const handInfo = (h) => (h ? (h.cardId ? getCard(h.cardId) : tokenInfo(h)) : null);

/* ============ 墓地 ============ */
// 墓地にはカードもトークンも入る。配列は古い順（末尾が最新）。
// 墓地のカードはコスト変化（costMod）を持たない＝元のコストで扱う（トークンはトークン固有のコスト）。

// 墓地にカード（またはトークン）を置く（player を直接書き換える）
export function sendToGrave(p, card) {
  if (!p || !card) return;
  if (card.cardId) {
    p.grave = [...(p.grave || []), { uid: card.uid || uid(), cardId: card.cardId }];
    return;
  }
  if (card.token || card.tokenId || card.copyOf) {
    p.grave = [
      ...(p.grave || []),
      { uid: card.uid || uid(), cardId: null, token: true, tokenId: card.tokenId || null, copyOf: card.copyOf || null },
    ];
  }
}

// 墓地のカード一覧（古い順）。info にカード情報が入る
export function graveCardsOf(p, filter) {
  const list = ((p && p.grave) || [])
    .map((g) => ({ ...g, info: g.cardId ? getCard(g.cardId) : tokenInfo(g) }))
    .filter((g) => g.info);
  return filter ? list.filter((g) => filter(g.info, g)) : list;
}

// 墓地で一番コストの大きいカード（同コストなら新しく墓地に行った方）。なければ null
// 例：graveMaxCostCard(p, (c) => c.type === "character")
export function graveMaxCostCard(p, filter) {
  let best = null;
  graveCardsOf(p, filter).forEach((g) => {
    if (!best || (g.info.cost ?? 0) >= (best.info.cost ?? 0)) best = g;
  });
  return best;
}

// 屍：自分の墓地にあるカードの元のコストの合計（屍N＝この値がN以上なら発動）
export function corpseOf(p) {
  return graveCardsOf(p).reduce((sum, g) => sum + (g.info.cost ?? 0), 0);
}

// 墓地から uid のカードを取り除いて返す（player を直接書き換える）。なければ null
export function takeFromGrave(p, graveUid) {
  const g = ((p && p.grave) || []).find((x) => x.uid === graveUid);
  if (!g) return null;
  p.grave = p.grave.filter((x) => x.uid !== graveUid);
  if (!g.cardId) {
    const info = tokenInfo(g);
    return {
      uid: g.uid, cardId: null, token: true,
      tokenId: g.tokenId || null, copyOf: g.copyOf || null,
      name: info?.name || "", costMod: 0,
    };
  }
  return { uid: g.uid, cardId: g.cardId, costMod: 0 };
}
export const unitInfo = (u) => (u ? (u.cardId ? getCard(u.cardId) : tokenInfo(u)) : null);
export const otherId = (s, pid) => (s.host === pid ? s.guest : s.host);
export const phaseOf = (s) => s.turnPhase || "main";

// そのプレイヤーが今、指定フェーズの操作をできるか
export function isActive(s, pid, phase) {
  return !!s && s.phase === "play" && !s.winner && s.turn === pid && phaseOf(s) === phase;
}

// 手札のカードの実際のコスト（コスト増減込み）
export function playCost(inst) {
  const c = handInfo(inst);
  if (!c) return 0;
  return Math.max(0, c.cost + (inst.costMod || 0));
}

/* ============ アビリティ ============ */
export const MAX_ABILITIES = 2;
export const abilitiesOf = (p) => (p && p.abilities) || [];
export const hasAbility = (p, cardId) => abilitiesOf(p).some((a) => a.cardId === cardId);

// 即時召喚の追加コスト（水星のソニックバッチで 4 → 1）
export function hasteExtraOf(p) {
  return hasAbility(p, "mercury_sonic") ? 1 : HASTE_EXTRA;
}

/* ============ ユニット生成 ============ */
function tokenUnit(info) {
  const kws = [...info.keywords];
  return {
    uid: uid(),
    cardId: null,
    token: true,
    tokenId: info.tokenId || null,
    copyOf: info.copyOf || null,
    name: info.name,
    stat: info.stat,
    cost: info.cost,
    canAttack: kws.includes("speed") || kws.includes("rush"),
    attacked: false,
    noFaceAttack: kws.includes("rush"),
    keywords: kws,
    firstAttackUsed: false,
  };
}

function instFromCard(cardId) {
  const c = getCard(cardId);
  const kws = [...c.keywords];
  return {
    uid: uid(),
    cardId,
    token: false,
    copyOf: null,
    name: c.name,
    stat: c.stat,
    cost: c.cost,
    canAttack: kws.includes("speed") || kws.includes("rush"),
    attacked: false,
    noFaceAttack: kws.includes("rush"),
    keywords: kws,
    firstAttackUsed: false,
  };
}

/* ============ 内部処理（下書き状態 s を直接書き換える） ============ */
// 手札のコストを下げた記録（公開情報）
function noteReduction(p, n, pick) {
  p.reductions = [...(p.reductions || []), { n, pick: !!pick }];
}

function drawCards(p, n, costMod) {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) { p.dead = true; break; }
    const c = { ...p.deck[0] };
    if (costMod) {
      c.costMod = (c.costMod || 0) + costMod;
      if (costMod < 0) noteReduction(p, -costMod, false);
    }
    p.deck = p.deck.slice(1);
    if (p.deck.length === 0) {
      p.dead = true;
      checkGate(p);
    }
    if (p.hand.length < MAX_HAND) p.hand = [...p.hand, c];
    else sendToGrave(p, c); // 手札が満杯なら墓地へ（コスト変化は消える）
  }
}

// 水星のリバースゲート・ゼロ：装着している間に山札が0枚になったら勝利
function checkGate(p) {
  if (p && p.deck.length === 0 && hasAbility(p, "mercury_gate")) p.gateWin = true;
}

// プレイヤーへのダメージ（すべてのダメージはここを通す）
// ダメージを受けたらプロテクターが破壊される
function damagePlayer(s, pid, amount, logs) {
  const p = s.players[pid];
  if (!p || amount <= 0) return;
  p.hp -= amount;
  const prot = abilitiesOf(p).filter((a) => getCard(a.cardId)?.abilityKind === "protector");
  prot.forEach((a) => destroyAbility(s, pid, a.uid, logs));
}

// アビリティの破壊（墓地へ送り、破壊トリガーを発動）
function destroyAbility(s, pid, abilityUid, logs) {
  const p = s.players[pid];
  const a = abilitiesOf(p).find((x) => x.uid === abilityUid);
  if (!a) return;
  p.abilities = abilitiesOf(p).filter((x) => x.uid !== abilityUid);
  // 後攻ボーナスは墓地に行かずに外れる（破壊トリガーもなし）
  if (a.cardId === SECOND_BONUS_ID) {
    logs.push("後攻ボーナスが外れた");
    return;
  }
  sendToGrave(p, a);
  const c = getCard(a.cardId);
  logs.push(`${c?.name || "アビリティ"} が破壊された`);
  onAbilityDestroyed(s, pid, a, logs);
}

// アビリティの破壊トリガー
function onAbilityDestroyed(s, pid, a, logs) {
  const oid = otherId(s, pid);
  const p = s.players[pid];
  const o = s.players[oid];
  switch (a.cardId) {
    case "mercury_rebellion":
      [...o.field].forEach((x) => damage(s, oid, x.uid, 3, logs));
      logs.push("水星の反逆: 相手のキャラクター全員に3ダメージ");
      break;
    case "saturn_timebomb":
      summonToken(p, "saturn_bossgoblin", logs);
      drawCards(p, 1);
      logs.push("土星の時限装置: 1ドロー");
      break;
    case "saturn_breakwater":
      summonToken(p, "saturn_wavegod", logs);
      break;
    default:
      break;
  }
}

// タイマーを1進める（0になったら破壊）。ターン開始時に呼ぶ
// 将来「タイマーを進めるカード」もこの関数を使う
export function tickAbilityTimers(s, pid, logs) {
  const p = s.players[pid];
  abilitiesOf(p)
    .filter((a) => getCard(a.cardId)?.abilityKind === "timer")
    .map((a) => a.uid)
    .forEach((id) => {
      const a = abilitiesOf(p).find((x) => x.uid === id);
      if (!a) return;
      a.timer = (a.timer ?? 0) - 1;
      if (a.timer <= 0) destroyAbility(s, pid, a.uid, logs);
    });
}

// 自分の場のキャラを持ち主の手札に戻す（手札が満杯なら墓地へ。破壊トリガーなし）
function returnToHand(s, ownerId, unitUid, logs) {
  const owner = s.players[ownerId];
  const t = owner.field.find((x) => x.uid === unitUid);
  if (!t || isInvincible(t)) return;
  owner.field = owner.field.filter((x) => x.uid !== unitUid);
  if (owner.hand.length >= MAX_HAND) {
    sendToGrave(owner, t);
    logs.push(`${t.name} は手札が満杯のため墓地へ`);
    return;
  }
  const back = t.token
    ? {
        uid: uid(), cardId: null, token: true,
        tokenId: t.tokenId || null, copyOf: t.copyOf || null,
        name: t.name, costMod: 0,
      }
    : { uid: t.uid, cardId: t.cardId, costMod: 0 };
  owner.hand = [...owner.hand, back];
  logs.push(`${t.name} を手札に戻した`);
}

// 効果でキャラを自分の場に出す（場がいっぱいなら出ない）
function summonToken(p, tokenId, logs) {
  const info = tokenInfo({ tokenId });
  if (!info) return null;
  if (p.field.length >= MAX_FIELD) {
    logs.push(`場がいっぱいのため ${info.name} は出せなかった`);
    return null;
  }
  const u = tokenUnit(info);
  p.field = [...p.field, u];
  logs.push(`${info.name} を場に出した`);
  return u;
}

// 消滅（場から取り除く。墓地には行かず、破壊トリガーも発動しない）
function vanishUnit(s, ownerId, unitUid, logs) {
  const owner = s.players[ownerId];
  const u = owner.field.find((x) => x.uid === unitUid);
  if (!u || isInvincible(u)) return false;
  owner.field = owner.field.filter((x) => x.uid !== unitUid);
  logs.push(`${u.name} が消滅した`);
  return true;
}
function vanishAbility(s, ownerId, abilityUid, logs) {
  const owner = s.players[ownerId];
  const a = abilitiesOf(owner).find((x) => x.uid === abilityUid);
  if (!a || a.cardId === SECOND_BONUS_ID) return false;
  owner.abilities = abilitiesOf(owner).filter((x) => x.uid !== abilityUid);
  logs.push(`${getCard(a.cardId)?.name || "アビリティ"} が消滅した`);
  return true;
}

// カードの効果による破壊（土星の英雄・ヒデオの「カードの効果で破壊されない」を確認する）
function effectDestroy(s, ownerId, unitUid, logs) {
  const u = s.players[ownerId].field.find((x) => x.uid === unitUid);
  if (u && u.immuneDestroy) {
    logs.push(`${u.name} はカードの効果で破壊されない`);
    return;
  }
  destroy(s, ownerId, unitUid, logs);
}

function activateCost(p) {
  if (p.maxCost < MAX_COST) {
    p.maxCost += 1;
    p.cost += 1;
  }
}

// 使えるコストが最大コストを超えないようにする（分子 ≦ 分母）
function clampCost(p) {
  if (!p) return;
  if (p.maxCost < 0) p.maxCost = 0;
  if (p.cost > p.maxCost) p.cost = p.maxCost;
  if (p.cost < 0) p.cost = 0;
}

// 破壊（場から取り除く → 破壊時効果）
function destroy(s, ownerId, unitUid, logs) {
  const u = removeUnit(s, ownerId, unitUid, logs);
  if (u) onDestroyed(s, ownerId, u, logs);
}

// 場から取り除くだけ（破壊時効果はまだ発動しない）
function removeUnit(s, ownerId, unitUid, logs) {
  const owner = s.players[ownerId];
  const u = owner.field.find((x) => x.uid === unitUid);
  if (!u || isInvincible(u)) return null;
  owner.field = owner.field.filter((x) => x.uid !== unitUid);
  sendToGrave(owner, u);
  logs.push(`${u.name} が破壊された`);
  return u;
}

// 破壊時効果
function onDestroyed(s, ownerId, u, logs) {
  const owner = s.players[ownerId];
  const foeId = otherId(s, ownerId);
  const foe = s.players[foeId];

  switch (effectId(u)) {
    case "moon_maiden":
      drawCards(owner, 1);
      logs.push("月の巫女: 1ドロー");
      break;
    case "earth_maiden":
      activateCost(owner);
      logs.push("地球の少女: コスト1有効化");
      break;
    case "moon_frog":
      owner.hp += 4;
      logs.push("月のカイル: HP+4");
      break;
    case "earth_frog":
      if (foe.maxCost > 0) {
        foe.maxCost -= 1;
        clampCost(foe); // 使えるコストが上限を超えたら上限まで下げる
        logs.push("地球のカエル: 相手の最大コスト-1");
      }
      break;
    case "moon_priest":
      drawCards(owner, 2);
      logs.push("月の巡礼者: 2ドロー");
      break;
    case "moon_kamura": {
      const targets = foe.field.filter((x) => !isInvincible(x));
      if (targets.length) {
        const maxC = Math.max(...targets.map((x) => x.cost));
        const cands = targets.filter((x) => x.cost === maxC);
        const t = cands[Math.floor(Math.random() * cands.length)];
        owner.hp += t.cost;
        logs.push(`月の槍姫・カミラ: ${t.name} を破壊しHP+${t.cost}`);
        effectDestroy(s, foeId, t.uid, logs);
      } else {
        logs.push("月の槍姫・カミラ: 破壊できる相手キャラがいない");
      }
      break;
    }
    case "earth_abyss":
      damagePlayer(s, foeId, 6, logs);
      logs.push("地球の天地を破る者: 相手プレイヤーに6ダメージ");
      break;
    case "saturn_princess":
      // 屍10なら、スタッツ+1したコピーを出す（コピーは破壊トリガーを持たない）
      if (u.noDeathTrigger) break;
      if (corpseOf(owner) >= 10) {
        if (owner.field.length < MAX_FIELD) {
          const nu = tokenUnit(tokenInfo({ copyOf: "saturn_princess" }));
          nu.stat += 1;
          nu.noDeathTrigger = true;
          owner.field = [...owner.field, nu];
          logs.push("土星の屍姫: 屍10・スタッツ+1のコピーを場に出した");
        } else {
          logs.push("土星の屍姫: 場がいっぱいのためコピーを出せなかった");
        }
      }
      break;
    case "saturn_michael":
      if (foe.hand.length) {
        const i = Math.floor(Math.random() * foe.hand.length);
        const h = foe.hand[i];
        foe.hand = foe.hand.filter((_, j) => j !== i);
        sendToGrave(foe, h);
        logs.push(`土星のミカエル: 相手の手札の ${handInfo(h)?.name || "カード"} を破壊`);
      }
      break;
    default:
      break;
  }
}

// カードの効果によるダメージ（交戦のダメージはここを通らない）
function damage(s, ownerId, unitUid, amount, logs) {
  const owner = s.players[ownerId];
  const u = owner.field.find((x) => x.uid === unitUid);
  if (!u || isInvincible(u)) return;
  if (u.immuneEffectDamage) {
    logs.push(`${u.name} は交戦以外でダメージを受けない`);
    return;
  }
  u.stat -= amount;
  if (u.stat <= 0) destroy(s, ownerId, unitUid, logs);
}

// 勝敗判定（pid＝操作したプレイヤー＝ターンプレイヤー）
function judge(s, pid) {
  const oid = otherId(s, pid);
  const a = s.players[pid], b = s.players[oid];
  // 水星のリバースゲート・ゼロ（山札0枚で勝利）は山札切れの負けより優先
  if (a.gateWin) return pid;
  if (b.gateWin) return oid;
  if (a.dead) return oid;
  if (b.dead) return pid;
  const aDead = a.hp <= 0, bDead = b.hp <= 0;
  if (aDead && bDead) return pid; // 相打ちはターンプレイヤーの勝ち
  if (bDead) return pid;
  if (aDead) return oid;
  return null;
}

// ログ追加＋勝敗判定をして状態を確定
function finish(s, pid, logs) {
  // 念のため、両プレイヤーのコストが上限を超えていないか補正
  Object.values(s.players || {}).forEach((p) => clampCost(p));
  // 土星のレプリカ・パレード：このターン5枚以上使っていたら、手札にある間コスト-5
  Object.values(s.players || {}).forEach((p) => refreshReplica(p));

  const entries = logs.filter(Boolean).map((t) => ({ by: pid, t }));
  const log = [...(s.log || []), ...entries];
  const w = judge(s, pid);
  if (w) {
    s.winner = w;
    s.phase = "end";
    log.push({ by: pid, t: "決着！" });
  }
  s.log = log.slice(-LOG_LIMIT);
  return s;
}

// レプリカ・パレードのコスト-5を、このターン使ったカードの枚数に合わせて付けたり外したりする
function refreshReplica(p) {
  if (!p || !p.hand) return;
  const on = (p.playedThisTurn || 0) >= REPLICA_NEED;
  p.hand.forEach((h) => {
    if (h.cardId !== "saturn_replica") return;
    if (on && !h.replicaOff) {
      h.costMod = (h.costMod || 0) - REPLICA_OFF;
      h.replicaOff = true;
    } else if (!on && h.replicaOff) {
      h.costMod = (h.costMod || 0) + REPLICA_OFF;
      h.replicaOff = false;
    }
  });
}

/* ============ 使用条件・対象 ============ */
function usableNow(cardId, p) {
  if (cardId === "earth_order") return p.field.some((x) => x.attacked && !isInvincible(x));
  return true;
}

// 即時召喚（+4コスト）できるカードか
// スピードアタッカーは不要なので除外。rush持ち（天地を破る者など）は+4で相手プレイヤーも攻撃可能になる
export function hasteAllowed(card) {
  return !!card && card.type === "character" && !card.keywords.includes("speed");
}

export function canPlay(s, pid, handIdx, haste = false) {
  if (!isActive(s, pid, "main")) return false;
  const p = s.players[pid];
  const inst = p.hand[handIdx];
  const card = handInfo(inst);
  if (!card) return false;
  if (haste && !hasteAllowed(card)) return false;
  const cost = playCost(inst) + (haste ? hasteExtraOf(p) : 0);
  if (p.cost < cost) return false;
  if (card.type === "character" && p.field.length >= MAX_FIELD) return false;
  if (card.type === "ability") {
    if (abilitiesOf(p).length >= MAX_ABILITIES) return false;
    if (hasAbility(p, card.id)) return false; // 同じ名前は同時に1枚まで
  }
  if (!usableNow(card.id, p)) return false;
  return true;
}

// そのカードを使うときに選ぶ対象の種類と候補（uid の配列）
// 対象を取らないカードは null
// candidates が空のときは、対象なしで使える（効果は不発）
export function playTargetKind(s, pid, handIdx) {
  const p = s.players[pid];
  const o = s.players[otherId(s, pid)];
  const inst = p.hand[handIdx];
  const card = handInfo(inst);
  if (!card) return null;
  const foes = o.field.filter((x) => !isInvincible(x)).map((x) => x.uid);
  let kind = null;
  let candidates = [];

  if (card.type === "character") {
    const sid = inst.cardId || card.copyOf || null;
    if (sid === "sun_priest") kind = "damage3";
    else if (sid === "moon_albert") kind = "destroyDraw";
    else if (sid === "earth_emerada") kind = "destroy";
    else if (sid === "pluto_jabberwock") kind = "destroy";
    else if (sid === "mercury_chimera") kind = "damage6";
    if (kind) candidates = foes;
    if (sid === "mercury_goblin") {
      // 自分の場の、元のコスト4以下のキャラ（トークン含む）
      kind = "ownUnit";
      candidates = p.field.filter((x) => !isInvincible(x) && x.cost <= 4).map((x) => x.uid);
    } else if (sid === "mercury_albert") {
      // 自分の手札の、元のコスト5以下のキャラ（このカード以外）
      kind = "ownHand";
      candidates = p.field.length + 1 < MAX_FIELD
        ? p.hand
            .filter((h, i) => {
              if (i === handIdx) return false;
              const c = handInfo(h);
              return c && c.type === "character" && c.cost <= 5;
            })
            .map((h) => h.uid)
        : [];
    }
  } else {
    switch (inst.cardId) {
      case "sun_crest":
        kind = "crest";
        candidates = foes;
        break;
      case "moon_crest":
        kind = "bounce";
        candidates = o.field.filter((x) => !isInvincible(x) && x.cost <= 5).map((x) => x.uid);
        break;
      case "earth_crest":
        kind = "reduce1";
        candidates = p.hand.filter((_, i) => i !== handIdx).map((h) => h.uid);
        break;
      case "earth_order":
        kind = "reattack";
        candidates = p.field.filter((x) => x.attacked && !isInvincible(x)).map((x) => x.uid);
        break;
      case "saturn_fadeout":
        // 相手キャラ1体（屍30なら、相手のアビリティも選べる）
        kind = "vanish";
        candidates = [...foes];
        if (corpseOf(p) >= 30) {
          abilitiesOf(o).forEach((a) => { if (a.cardId !== SECOND_BONUS_ID) candidates.push(a.uid); });
        }
        break;
      case "saturn_replica":
        kind = "replica";
        candidates = p.hand.filter((_, i) => i !== handIdx).map((h) => h.uid);
        break;
      default:
        break;
    }
  }
  return kind ? { kind, candidates } : null;
}

// 攻撃できる対象（units: 攻撃できる相手キャラの uid / face: 相手プレイヤーを攻撃できるか）
export function attackOptions(s, pid, attackerUid) {
  if (!isActive(s, pid, "main")) return null;
  const p = s.players[pid];
  const o = s.players[otherId(s, pid)];
  const a = p.field.find((x) => x.uid === attackerUid);
  if (!a || a.attacked || !a.canAttack) return null;
  const defender = o.field.some((x) => hasKw(x, "defender"));
  const units = o.field
    .filter((x) => (defender ? hasKw(x, "defender") : !hasKw(x, "untargetable_by_attack")))
    .map((x) => x.uid);
  const face = !defender && !a.noFaceAttack && !hasKw(a, "no_attack_player");
  return { units, face, defender };
}

// 攻撃宣言時に追加で対象を選ぶキャラ（月のスケルトン）の候補。不要なら null
export function attackExtraCandidates(s, pid, attackerUid) {
  const p = s.players[pid];
  const o = s.players[otherId(s, pid)];
  const a = p.field.find((x) => x.uid === attackerUid);
  if (!a || effectId(a) !== "moon_goblin") return null;
  const c = o.field.filter((x) => !isInvincible(x)).map((x) => x.uid);
  return c.length ? c : null;
}

export function canSacrifice(s, pid) {
  if (!isActive(s, pid, "sacrifice")) return false;
  const p = s.players[pid];
  return !p.sacrificedThisTurn && p.maxCost < MAX_COST;
}

/* ============ 操作（次の状態を返す／不正なら null） ============ */

// ドローフェーズ：1枚引いてメインへ
export function drawStep(s0, pid) {
  if (!isActive(s0, pid, "draw")) return null;
  const s = cloneState(s0);
  drawCards(s.players[pid], 1);
  s.turnPhase = "main";
  return finish(s, pid, ["カードを1枚引いた"]);
}

// カードを使う
// opts.haste: 即時召喚 / opts.target: 対象の uid（playTargetKind の候補から）
export function playCard(s0, pid, handIdx, opts = {}) {
  const haste = !!opts.haste;
  const target = opts.target ?? null;
  if (!canPlay(s0, pid, handIdx, haste)) return null;
  const tk = playTargetKind(s0, pid, handIdx);
  const hasT = !!(tk && tk.candidates.length);
  if (hasT && !tk.candidates.includes(target)) return null;

  const s = cloneState(s0);
  const oid = otherId(s, pid);
  const p = s.players[pid];
  const o = s.players[oid];
  const inst = p.hand[handIdx];
  const card = handInfo(inst);
  const cost = playCost(inst) + (haste ? hasteExtraOf(p) : 0);
  const logs = [];

  p.cost -= cost;
  p.hand = p.hand.filter((_, i) => i !== handIdx);
  const playedBefore = p.playedThisTurn || 0; // このカードより前に使ったカードの枚数
  p.playedThisTurn = playedBefore + 1;

  if (card.type === "ability") {
    p.abilities = [...abilitiesOf(p), { uid: inst.uid, cardId: inst.cardId, timer: card.abilityKind === "timer" ? card.timer : null }];
    logs.push(`${card.name} を装着した`);
    if (inst.cardId === "mercury_gate") checkGate(p);
    // 装着トリガー：水星の覚醒（自分のキャラクター全員+1）
    if (inst.cardId === "mercury_awakening") {
      p.field.forEach((x) => { if (!isInvincible(x)) x.stat += 1; });
      logs.push("水星の覚醒: 自分のキャラクター全員 +1");
    }
    if (inst.cardId === "saturn_breakwater") summonToken(p, "saturn_wavegod", logs);
    if (inst.cardId === "saturn_dragongate") summonToken(p, "saturn_dragon", logs);
    return finish(s, pid, logs);
  }

  if (card.type === "character") {
    const u = card.isToken ? tokenUnit(card) : instFromCard(inst.cardId);
    if (haste) {
      u.canAttack = true;
      u.noFaceAttack = false; // 即時召喚なら相手プレイヤーも攻撃できる
    }
    p.field = [...p.field, u];
    logs.push(`${card.name} を召喚${haste ? "（即時）" : ""}`);

    p.summonCount = (p.summonCount || 0) + 1;
    // 手札にある間、キャラクターを召喚するたびコストが変わるカード（水星のキマイラなど）
    // カードデータの handCostOnSummon（変化量）と handCostMin（下限）で決まる
    p.hand.forEach((h) => {
      const hc = handInfo(h);
      if (!hc || !hc.handCostOnSummon) return;
      const next = playCost(h) + hc.handCostOnSummon;
      if (next >= (hc.handCostMin ?? 0)) h.costMod = (h.costMod || 0) + hc.handCostOnSummon;
    });

    // 召喚時効果（手札から出したコピー・トークンは元カードの召喚時効果を発動する）
    const sid = inst.cardId || card.copyOf || null;
    switch (sid) {
      case "sun_priest":
        if (hasT) damage(s, oid, target, 4, logs);
        break;
      case "earth_priest":
        activateCost(p);
        logs.push("コスト1有効化");
        break;
      case "sun_albert":
        p.field.forEach((x) => { if (x.uid !== u.uid && !isInvincible(x)) x.stat += 4; });
        logs.push("自軍全体 +4");
        break;
      case "moon_albert":
        if (hasT) effectDestroy(s, oid, target, logs);
        drawCards(p, 1);
        logs.push("1ドロー");
        break;
      case "earth_albert": {
        // 生贄置き場のコスト7以下のキャラ（トークン含む）のうち最もコストが高いもののコピーを出す
        const chars = p.sacrifice
          .map((x) => handInfo(x))
          .filter((c) => c && c.type === "character" && c.cost <= 7);
        if (chars.length && p.field.length < MAX_FIELD) {
          const maxC = Math.max(...chars.map((c) => c.cost));
          const cands = chars.filter((c) => c.cost === maxC);
          const pick = cands[Math.floor(Math.random() * cands.length)];
          const info = pick.isToken ? pick : tokenInfo({ copyOf: pick.id });
          p.field = [...p.field, tokenUnit(info)];
          logs.push(`生贄置き場の ${pick.name}（コスト${pick.cost}）をコピーして場に出した`);
        } else if (!chars.length) {
          logs.push("地球のアルベール: コピーできるキャラがいない");
        }
        break;
      }
      case "sun_hector": {
        const empty = MAX_FIELD - p.field.length;
        for (let i = 0; i < empty; i++) {
          p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "hector_soldier" }))];
        }
        logs.push(`空き枠に兵士を${empty}体展開`);
        break;
      }
      case "earth_emerada":
        if (hasT) effectDestroy(s, oid, target, logs);
        break;
      case "mercury_goblin":
        if (hasT) returnToHand(s, pid, target, logs);
        break;
      case "mercury_mercurino": {
        // このターン先に使ったカード1枚につき +2（ターン終了まで）
        const up = playedBefore * MERCURINO_PER_CARD;
        if (up > 0) {
          u.stat += up;
          u.tempBuff = (u.tempBuff || 0) + up;
        }
        logs.push(`マーキュリノ: このターン使ったカード${playedBefore}枚ぶん +${up}（ターン終了まで）`);
        break;
      }
      case "mercury_albert":
        if (hasT && p.field.length < MAX_FIELD) {
          const hi = p.hand.findIndex((h) => h.uid === target);
          const h = p.hand[hi];
          const c = handInfo(h);
          if (h && c) {
            // 手札のカードはそのまま残し、コピー・トークンを場に出す
            const nu = tokenUnit(c.isToken ? c : tokenInfo({ copyOf: h.cardId }));
            if (!isInvincible(nu)) {
              nu.canAttack = true;
              if (!nu.keywords.includes("speed")) {
                nu.noFaceAttack = true;
                if (!nu.keywords.includes("rush")) nu.keywords.push("rush");
              }
              if (!nu.keywords.includes("dies_end_of_turn")) nu.keywords.push("dies_end_of_turn");
            }
            p.field = [...p.field, nu];
            logs.push(`水星のアシュタール: ${c.name} のコピーを場に出した（ファストファイト・ターン終了時に破壊）`);
          }
        }
        break;
      case "mercury_chimera":
        if (hasT) damage(s, oid, target, 6, logs);
        break;
      case "moon_witch":
        s.skipNext = oid;
        logs.push("次の相手ターンをスキップ");
        break;
      case "saturn_hideo": {
        const c = corpseOf(p);
        if (c >= 30) {
          u.immuneDestroy = true;
          logs.push("土星の英雄・ヒデオ: 屍30・カードの効果で破壊されない");
        }
        if (c >= 40) {
          u.immuneEffectDamage = true;
          logs.push("土星の英雄・ヒデオ: 屍40・交戦以外でダメージを受けない");
        }
        break;
      }
      case "pluto_albert": {
        // 手札をすべて山札に戻してシャッフル → 5枚引いてコスト-1
        const back = p.hand.map((h) => ({ ...h, costMod: 0 }));
        p.hand = [];
        p.deck = shuffle([...p.deck, ...back]);
        logs.push(`手札${back.length}枚を山札に戻してシャッフル`);
        drawCards(p, 5, -1);
        logs.push("5ドロー（コスト-1）");
        break;
      }
      case "pluto_jabberwock": {
        // ① 相手キャラ1体と、このカード以外の自軍キャラ全員を破壊
        const destroyed = [];
        const canBreak = (owner, uid2) => {
          const x = s.players[owner].field.find((y) => y.uid === uid2);
          if (x && x.immuneDestroy) {
            logs.push(`${x.name} はカードの効果で破壊されない`);
            return false;
          }
          return true;
        };
        if (hasT && canBreak(oid, target)) {
          const du = removeUnit(s, oid, target, logs);
          if (du) destroyed.push({ owner: oid, u: du });
        }
        [...p.field].forEach((x) => {
          if (x.uid === u.uid || !canBreak(pid, x.uid)) return;
          const du = removeUnit(s, pid, x.uid, logs);
          if (du) destroyed.push({ owner: pid, u: du });
        });
        // ② 破壊時効果（カミラ・月の巡礼者など）。ターン主の効果が先
        [...destroyed.filter((d) => d.owner === pid), ...destroyed.filter((d) => d.owner !== pid)]
          .forEach((d) => onDestroyed(s, d.owner, d.u, logs));
        // ③ 破壊したキャラごとに、それよりコストが高いキャラのコピーを山札から場に出す（山札はそのまま）
        destroyed.forEach((d) => {
          if (p.field.length >= MAX_FIELD) return;
          const cands = p.deck
            .filter((c) => c.cardId)
            .map((c) => getCard(c.cardId))
            .filter((c) => c && c.type === "character" && c.cost > d.u.cost);
          let pool = cands;
          if (!pool.length) {
            // より高いコストのキャラがいなければ、山札でいちばんコストが高いキャラを出す
            const all = p.deck
              .filter((c) => c.cardId)
              .map((c) => getCard(c.cardId))
              .filter((c) => c && c.type === "character");
            if (!all.length) {
              logs.push("山札にキャラクターがいない");
              return;
            }
            const top = Math.max(...all.map((c) => c.cost));
            pool = all.filter((c) => c.cost === top);
          }
          const pick = pool[Math.floor(Math.random() * pool.length)];
          p.field = [...p.field, tokenUnit(tokenInfo({ copyOf: pick.id }))];
          logs.push(`${pick.name}（コスト${pick.cost}）のコピーを場に出した`);
        });
        break;
      }
      default:
        break;
    }
  } else {
    // マジック
    sendToGrave(p, inst);
    logs.push(`${card.name} を使用`);
    switch (inst.cardId) {
      case "sun_crest":
        if (hasT) {
          damage(s, oid, target, 4, logs);
          [...o.field].forEach((x) => {
            if (x.uid !== target) damage(s, oid, x.uid, 1, logs);
          });
        }
        break;
      case "moon_crest":
        if (hasT) {
          const t = o.field.find((x) => x.uid === target);
          if (t) {
            o.field = o.field.filter((x) => x.uid !== target);
            if (o.hand.length >= MAX_HAND) {
              // 手札が満杯：カードもトークンも墓地へ（破壊時効果なし）
              sendToGrave(o, t);
              logs.push(`${t.name} は手札が満杯のため墓地へ`);
            } else {
              const back = t.token
                ? {
                    uid: uid(), cardId: null, token: true,
                    tokenId: t.tokenId || null, copyOf: t.copyOf || null,
                    name: t.name, costMod: 0,
                  }
                : { uid: t.uid, cardId: t.cardId, costMod: 0 };
              o.hand = [...o.hand, back];
              logs.push(`${t.name} を手札に戻した`);
            }
          }
          drawCards(p, 1);
        }
        break;
      case "earth_crest":
        p.pendingCost = (p.pendingCost || 0) + 1;
        if (hasT) {
          const h = p.hand.find((x) => x.uid === target);
          if (h) {
            h.costMod = (h.costMod || 0) - 1;
            noteReduction(p, 1, true);
            logs.push("手札1枚のコスト-1");
          }
        }
        break;
      case "sun_order":
        for (let i = 0; i < 2 && p.field.length < MAX_FIELD; i++)
          p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "sun_soldier" }))];
        logs.push("太陽の兵士（スタッツ3）を展開");
        break;
      case "moon_order":
        drawCards(p, 2);
        logs.push("2ドロー");
        break;
      case "earth_order":
        if (hasT) {
          const t = p.field.find((x) => x.uid === target);
          if (t) {
            t.attacked = false;
            t.canAttack = true;
            logs.push(`${t.name} が再攻撃可能`);
          }
        }
        break;
      case "sun_judgment":
        [...o.field].forEach((x) => damage(s, oid, x.uid, 6, logs));
        logs.push("相手全体に6ダメージ");
        break;
      case "moon_judgment":
        drawCards(p, 2, -4);
        logs.push("2ドロー（コスト-4）");
        break;
      case "earth_judgment":
        for (let i = 0; i < 2 && p.field.length < MAX_FIELD; i++)
          p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "earth_guardian" }))];
        p.field.forEach((x) => {
          if (!isInvincible(x) && !x.keywords.includes("defender")) x.keywords.push("defender");
        });
        logs.push("大地の守人（スタッツ6）を展開・全体ディフェンダー");
        break;
      case "pluto_crest": {
        damagePlayer(s, pid, 3, logs);
        damagePlayer(s, oid, 3, logs);
        logs.push("自分と相手のHP-3");
        if (o.hand.length) {
          const i = Math.floor(Math.random() * o.hand.length);
          const h = o.hand[i];
          o.hand = o.hand.filter((_, j) => j !== i);
          sendToGrave(o, h);
          logs.push(`相手の手札の ${handInfo(h)?.name || "カード"} を破壊`);
        }
        break;
      }
      case "pluto_order":
        for (let i = 0; i < 2 && p.field.length < MAX_FIELD; i++)
          p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "pluto_soldier" }))];
        logs.push("冥王星の兵士（スタッツ3・スピードアタッカー）を展開");
        break;
      case "pluto_judgment":
        [...o.field].forEach((x) => damage(s, oid, x.uid, 2, logs));
        damagePlayer(s, oid, 8, logs);
        logs.push("相手全体に2ダメージ・相手プレイヤーに8ダメージ");
        break;
      case "saturn_rosegarden":
        summonToken(p, "saturn_rose", logs);
        summonToken(p, "saturn_rose", logs);
        break;
      case "saturn_fadeout":
        if (hasT) {
          if (o.field.some((x) => x.uid === target)) vanishUnit(s, oid, target, logs);
          else vanishAbility(s, oid, target, logs);
        }
        break;
      case "saturn_eclipse": {
        // 「月のカイル」を手札に加える（屍15で3枚、屍30でコスト-3）
        const c = corpseOf(p);
        const n = c >= 15 ? 3 : 2;
        const down = c >= 30 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const h = { uid: uid(), cardId: "moon_frog", costMod: -down };
          if (p.hand.length < MAX_HAND) {
            p.hand = [...p.hand, h];
            noteReduction(p, down, false);
          } else {
            sendToGrave(p, h);
          }
        }
        logs.push(`月のカイルを${n}枚手札に加えた（コスト-${down}）`);
        break;
      }
      case "saturn_replica":
        if (hasT) {
          const keep = p.hand.find((h) => h.uid === target);
          if (keep) {
            const others = p.hand.filter((h) => h.uid !== target);
            others.forEach((h) => sendToGrave(p, h));
            const copies = [];
            while (1 + copies.length < MAX_HAND) {
              copies.push({
                uid: uid(), cardId: keep.cardId || null, token: !!keep.token,
                tokenId: keep.tokenId || null, copyOf: keep.copyOf || null,
                name: keep.name, costMod: 0,
              });
            }
            p.hand = [keep, ...copies];
            p.hand.forEach((h) => { h.costMod = (h.costMod || 0) - 2; });
            noteReduction(p, 2, false);
            logs.push(`手札${others.length}枚を破壊し、${handInfo(keep)?.name || "カード"} のコピーを${copies.length}枚加えた（手札すべてコスト-2）`);
          }
        }
        break;
      default:
        break;
    }
  }

  return finish(s, pid, logs);
}

// 攻撃する
// opts.targetUid: 攻撃する相手キャラ / opts.toFace: 相手プレイヤーを攻撃
// opts.extraTarget: 月のスケルトンの -1 対象
export function attack(s0, pid, attackerUid, opts = {}) {
  const toFace = !!opts.toFace;
  const targetUid = opts.targetUid ?? null;
  const extraTarget = opts.extraTarget ?? null;
  const ao = attackOptions(s0, pid, attackerUid);
  if (!ao) return null;
  if (toFace ? !ao.face : !ao.units.includes(targetUid)) return null;
  const ex = attackExtraCandidates(s0, pid, attackerUid);
  if (ex && !ex.includes(extraTarget)) return null;

  const s = cloneState(s0);
  const oid = otherId(s, pid);
  const p = s.players[pid];
  const o = s.players[oid];
  const a = p.field.find((x) => x.uid === attackerUid);
  const eid = effectId(a);
  const logs = [];

  // 攻撃時誘発
  if (eid === "sun_goblin") {
    p.field.forEach((x) => { if (x.uid !== a.uid && !isInvincible(x)) x.stat += 1; });
    logs.push("太陽のグレムリン: 自軍+1");
  }
  if (eid === "earth_goblin") {
    // 判定は「現在の最大コスト」のみ（予約済みの有効化は含めない）
    // 6未満なら、次の自分のターン開始時に1有効化。6以上なら1ドロー
    if (p.maxCost < 6) {
      p.pendingCost = (p.pendingCost || 0) + 1;
      logs.push("地球のゴブリン: 次のターン開始時にコスト有効化");
    } else {
      drawCards(p, 1);
      logs.push("地球のゴブリン: 1ドロー");
    }
  }
  if (eid === "earth_abyss" && !a.firstAttackUsed) {
    a.firstAttackUsed = true;
    damagePlayer(s, oid, 6, logs);
    logs.push("地球の天地を破る者: 相手に6ダメージ");
    if (o.hp <= 0) {
      a.attacked = true;
      a.canAttack = false;
      return finish(s, pid, logs);
    }
  }
  if (eid === "pluto_frog" && !toFace) {
    damagePlayer(s, pid, 3, logs);
    damagePlayer(s, oid, 3, logs);
    logs.push("冥王星のカエサル: 自分と相手に3ダメージ");
    if (o.hp <= 0 || p.hp <= 0) {
      a.attacked = true;
      a.canAttack = false;
      return finish(s, pid, logs);
    }
  }
  if (ex) {
    const tg = o.field.find((x) => x.uid === extraTarget);
    if (tg && !isInvincible(tg)) {
      tg.stat -= 1;
      logs.push(`月のスケルトン: ${tg.name} -1`);
      if (tg.stat <= 0) destroy(s, oid, tg.uid, logs);
    }
  }

  // 戦闘解決
  a.attacked = true;
  a.canAttack = false;
  // 土星の英雄・ヒデオ：1回目の攻撃の対象が相手キャラなら、もう1回攻撃できる
  const hideoAfter = () => {
    if (effectId(a) !== "saturn_hideo" || a.hideoUsed) return;
    a.hideoUsed = true;
    if (!toFace && p.field.some((x) => x.uid === a.uid)) {
      a.attacked = false;
      a.canAttack = true;
      logs.push("土星の英雄・ヒデオ: もう1回攻撃できる");
    }
  };
  // 交戦トリガー（ターン主のキャラが先）：土星の薔薇＝交戦する相手のキャラに1ダメージ
  if (!toFace) {
    const d0 = o.field.find((x) => x.uid === targetUid);
    if (d0) {
      if (a.tokenId === "saturn_rose") {
        logs.push("土星の薔薇: 交戦する相手に1ダメージ");
        damage(s, oid, d0.uid, 1, logs);
      }
      const dNow = o.field.find((x) => x.uid === targetUid);
      if (dNow && dNow.tokenId === "saturn_rose" && p.field.some((x) => x.uid === a.uid)) {
        logs.push("土星の薔薇: 交戦する相手に1ダメージ");
        damage(s, pid, a.uid, 1, logs);
      }
      if (!o.field.some((x) => x.uid === targetUid) || !p.field.some((x) => x.uid === a.uid)) {
        logs.push("交戦する相手がいなくなったため、交戦は行わない");
        hideoAfter();
        return finish(s, pid, logs);
      }
    }
  }
  if (toFace) {
    a.directCount = (a.directCount || 0) + 1;
    // 水星のホーネット：2回目のダイレクトの時、ダメージの前に
    if (eid === "mercury_hornet" && a.directCount === 2) {
      o.hp = 4;
      const milled = o.deck.slice(0, 3);
      o.deck = o.deck.slice(3);
      milled.forEach((c) => sendToGrave(o, c));
      checkGate(o);
      o.maxCost = Math.max(0, o.maxCost - 2);
      clampCost(o);
      if (o.hand.length) {
        const i = Math.floor(Math.random() * o.hand.length);
        const h = o.hand[i];
        o.hand = o.hand.filter((_, j) => j !== i);
        sendToGrave(o, h);
        logs.push(`水星のホーネット: 相手のHPを4に・山札${milled.length}枚を墓地へ・最大コスト-2・手札の ${handInfo(h)?.name || "カード"} を破壊`);
      } else {
        logs.push(`水星のホーネット: 相手のHPを4に・山札${milled.length}枚を墓地へ・最大コスト-2`);
      }
    }
    const dmg = a.stat;
    logs.push(`${a.name} が相手プレイヤーに${dmg}ダメージ`);
    damagePlayer(s, oid, dmg, logs);
  } else {
    const d = o.field.find((x) => x.uid === targetUid);
    if (!d) {
      logs.push(`${a.name} の攻撃対象がいなくなった`);
    } else {
      const aStat = a.stat, dStat = d.stat;
      logs.push(`${a.name} が ${d.name} を攻撃`);
      // ① ダメージを同時に与える
      if (!isInvincible(d)) d.stat -= aStat;
      if (!isInvincible(a)) a.stat -= dStat;
      // ② 0以下になったキャラを先にまとめて場から取り除く（相殺完了）
      const deadD = d.stat <= 0 ? removeUnit(s, oid, d.uid, logs) : null;
      const deadA = a.stat <= 0 ? removeUnit(s, pid, a.uid, logs) : null;
      // ③ その後で破壊時効果を発動（ターン主の効果が先）
      if (deadA) onDestroyed(s, pid, deadA, logs);
      if (deadD) onDestroyed(s, oid, deadD, logs);
    }
  }
  hideoAfter();
  return finish(s, pid, logs);
}

// メインフェーズ終了 → 生贄フェーズ
export function toSacrifice(s0, pid) {
  if (!isActive(s0, pid, "main")) return null;
  const s = cloneState(s0);
  s.turnPhase = "sacrifice";
  return finish(s, pid, ["生贄フェーズへ"]);
}

// 手札を生贄にする
export function sacrifice(s0, pid, handIdx) {
  if (!canSacrifice(s0, pid)) return null;
  const card = handInfo(s0.players[pid].hand[handIdx]);
  if (!card) return null;

  const s = cloneState(s0);
  const p = s.players[pid];
  const inst = p.hand[handIdx];
  p.hand = p.hand.filter((_, i) => i !== handIdx);
  const entry = card.isToken
    ? {
        uid: inst.uid, cardId: null, token: true,
        tokenId: card.tokenId || null, copyOf: card.copyOf || null, name: card.name,
      }
    : { uid: inst.uid, cardId: inst.cardId };
  p.sacrifice = [...p.sacrifice, entry];
  p.maxCost += 1;
  const mult = p.field.some((x) => effectId(x) === "pluto_priest") ? 2 : 1;
  const gain = card.cost * mult;
  p.hp += gain;
  p.sacrificedThisTurn = true;
  const logs = [
    `${card.name} を生贄に（コスト上限+1 / HP+${gain}${mult > 1 ? "（冥王星のプリーストで2倍）" : ""} / 1ドロー）`,
  ];
  drawCards(p, 1);
  return finish(s, pid, logs);
}

// アビリティを外す（自分のメインフェーズのみ。コスト不要。破壊トリガーは発動しない。「自分で外した時」の効果は発動する）
export function canRemoveAbility(s, pid) {
  return isActive(s, pid, "main");
}
export function removeAbility(s0, pid, abilityUid) {
  if (!canRemoveAbility(s0, pid)) return null;
  const s = cloneState(s0);
  const p = s.players[pid];
  const a = abilitiesOf(p).find((x) => x.uid === abilityUid);
  if (!a) return null;
  if (a.cardId === SECOND_BONUS_ID) return null; // 後攻ボーナスは外せない
  p.abilities = abilitiesOf(p).filter((x) => x.uid !== abilityUid);
  sendToGrave(p, a);
  const logs = [`${getCard(a.cardId)?.name || "アビリティ"} を外した`];
  // 自分で外した時の効果（破壊された時は発動しない）
  switch (a.cardId) {
    case "mercury_awakening":
      drawCards(p, 2);
      logs.push("水星の覚醒: 外したので2ドロー");
      break;
    case "mercury_sonic":
      drawCards(p, 1);
      logs.push("水星のソニックバッチ: 外したので1ドロー");
      break;
    case "saturn_dragongate":
      summonToken(p, "saturn_dragon", logs);
      break;
    default:
      break;
  }
  return finish(s, pid, logs);
}

// ターン終了
export function endTurn(s0, pid) {
  if (!isActive(s0, pid, "sacrifice")) return null;
  const s = cloneState(s0);
  const oid = otherId(s, pid);
  const p = s.players[pid];
  const o = s.players[oid];
  const logs = ["ターン終了"];

  // 自分のターン終了時効果：冥王星の聖女
  p.field.forEach((x) => {
    if (effectId(x) === "pluto_maiden") {
      p.hp += 2;
      damagePlayer(s, oid, 2, logs);
      logs.push("冥王星の聖女: HP+2・相手に2ダメージ");
    }
  });
  // 自分のターン終了時のアビリティ
  if (hasAbility(p, SECOND_BONUS_ID)) {
    // 後攻ボーナス：手札からランダムに3枚選んでコスト-1
    // （次の自分のターン開始時にタイマーが0になって外れるので、効果が出るのは1回だけ）
    const picks = shuffle(p.hand.map((_, i) => i)).slice(0, SECOND_BONUS_CARDS);
    picks.forEach((i) => {
      p.hand[i].costMod = (p.hand[i].costMod || 0) - 1;
      noteReduction(p, 1, false);
    });
    logs.push(`後攻ボーナス: 手札${picks.length}枚のコスト-1`);
  }
  if (hasAbility(p, "mercury_awakening")) {
    p.field.forEach((x) => { if (!isInvincible(x)) x.stat += 1; });
    logs.push("水星の覚醒: 自分のキャラクター全員 +1");
  }
  if (hasAbility(p, "mercury_gate")) {
    drawCards(p, 1);
    logs.push("水星のリバースゲート・ゼロ: 1ドロー");
  }
  // 「ターン終了まで」のスタッツ上昇（マーキュリノ）を元に戻す
  [...p.field].forEach((x) => {
    if (!x.tempBuff) return;
    x.stat -= x.tempBuff;
    x.tempBuff = 0;
    if (x.stat <= 0) destroy(s, pid, x.uid, logs);
  });
  // ターン終了時に破壊されるトークン（冥王星の兵士）
  [pid, oid].forEach((id) => {
    s.players[id].field
      .filter((x) => hasKw(x, "dies_end_of_turn"))
      .forEach((x) => destroy(s, id, x.uid, logs));
  });
  // 相手のターン終了時：冥王星のセラフィム・ルクス（場にいて HP30以上なら勝利）
  if (!judge(s, pid) && o.hp >= 30 && o.field.some((x) => effectId(x) === "pluto_seraph")) {
    s.winner = oid;
    s.phase = "end";
    logs.push("冥王星のセラフィム・ルクス: HP30以上で特殊勝利！");
  }

  p.field.forEach((x) => { x.attacked = false; x.canAttack = true; x.noFaceAttack = false; x.hideoUsed = false; });
  p.sacrificedThisTurn = false;
  p.playedThisTurn = 0;

  let nextTurn = oid;
  let starter = o;
  if (s.skipNext === oid) {
    logs.push("相手のターンをスキップ（もう一度自分のターン）");
    nextTurn = pid;
    starter = p;
  }

  // 次のターンプレイヤーのターン開始処理（ドローはドローフェーズで行う）
  if (starter.pendingCost) {
    for (let i = 0; i < starter.pendingCost; i++) activateCost(starter);
    starter.pendingCost = 0;
  }
  starter.cost = starter.maxCost;
  starter.field.forEach((x) => { x.canAttack = true; x.attacked = false; x.hideoUsed = false; });
  starter.playedThisTurn = 0;
  // 念のため：開始時に後攻ボーナスが装着されていない試合（更新前に始まったルームなど）は、ここで装着する
  if ((s.turnCount || 1) === 1 && !s.secondBonusGiven) {
    giveSecondBonus(s, oid);
    logs.push("後攻ボーナスが装着された");
  }
  // タイマーを1進める（0になったアビリティは破壊。後攻ボーナスは外れる）
  tickAbilityTimers(s, nextTurn, logs);
  // 自分のターン開始時のアビリティ：土星の竜門
  if (hasAbility(starter, "saturn_dragongate")) summonToken(starter, "saturn_dragon", logs);

  s.turn = nextTurn;
  s.turnPhase = "draw";
  s.skipNext = null;
  s.turnCount = (s.turnCount || 1) + 1;
  return finish(s, pid, logs);
}
