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
const LOG_LIMIT = 30;

/* ============ ユーティリティ ============ */
export const uid = () => Math.random().toString(36).slice(2, 10);
export const cloneState = (s) => JSON.parse(JSON.stringify(s));

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
  return {
    host: p1,
    guest: p2,
    phase: "play",
    turn: first,
    turnPhase: "main", // 先攻1ターン目はドローなし
    turnCount: 1,
    skipNext: null,
    winner: null,
    log: [...log, "対戦開始！ 先攻は初ターンドローなし"],
    players,
  };
}

/* ============ 判定ヘルパー ============ */
export const hasKw = (u, k) => !!(u && u.keywords && u.keywords.includes(k));
export const isInvincible = (u) => hasKw(u, "invincible");
// 効果判定用ID（コピー・トークンは元カードの能力を持つ）
export const effectId = (u) => u.cardId || u.copyOf || null;
// 手札・場・生贄置き場のカード情報（トークンも通常カードと同じ形で扱う）
export const handInfo = (h) => (h ? (h.cardId ? getCard(h.cardId) : tokenInfo(h)) : null);
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
function drawCards(p, n, costMod) {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) { p.dead = true; break; }
    const c = { ...p.deck[0] };
    if (costMod) c.costMod = (c.costMod || 0) + costMod;
    p.deck = p.deck.slice(1);
    if (p.deck.length === 0) p.dead = true;
    if (p.hand.length < MAX_HAND) p.hand = [...p.hand, c];
    else p.grave = [...p.grave, c];
  }
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
  if (!u.token) owner.grave = [...owner.grave, { uid: u.uid, cardId: u.cardId }];
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
      logs.push("月の少女: 1ドロー");
      break;
    case "earth_maiden":
      activateCost(owner);
      logs.push("地球の少女: コスト1有効化");
      break;
    case "moon_frog":
      owner.hp += 2;
      logs.push("月のカエル: HP+2");
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
      logs.push("月の僧侶: 2ドロー");
      break;
    case "moon_kamura": {
      const targets = foe.field.filter((x) => !isInvincible(x));
      if (targets.length) {
        const maxC = Math.max(...targets.map((x) => x.cost));
        const cands = targets.filter((x) => x.cost === maxC);
        const t = cands[Math.floor(Math.random() * cands.length)];
        owner.hp += t.cost;
        logs.push(`月の戦士・カムラ: ${t.name} を破壊しHP+${t.cost}`);
        destroy(s, foeId, t.uid, logs);
      } else {
        logs.push("月の戦士・カムラ: 破壊できる相手キャラがいない");
      }
      break;
    }
    case "earth_abyss":
      foe.hp -= 6;
      logs.push("地球の底より出でる者: 相手プレイヤーに6ダメージ");
      break;
    default:
      break;
  }
}

function damage(s, ownerId, unitUid, amount, logs) {
  const owner = s.players[ownerId];
  const u = owner.field.find((x) => x.uid === unitUid);
  if (!u || isInvincible(u)) return;
  u.stat -= amount;
  if (u.stat <= 0) destroy(s, ownerId, unitUid, logs);
}

// 勝敗判定（pid＝操作したプレイヤー＝ターンプレイヤー）
function judge(s, pid) {
  const oid = otherId(s, pid);
  const a = s.players[pid], b = s.players[oid];
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

/* ============ 使用条件・対象 ============ */
function usableNow(cardId, p) {
  if (cardId === "earth_order") return p.field.some((x) => x.attacked && !isInvincible(x));
  return true;
}

// 即時召喚（+4コスト）できるカードか
// スピードアタッカーは不要なので除外。rush持ち（底より出でる者など）は+4で相手プレイヤーも攻撃可能になる
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
  const cost = playCost(inst) + (haste ? HASTE_EXTRA : 0);
  if (p.cost < cost) return false;
  if (card.type === "character" && p.field.length >= MAX_FIELD) return false;
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
    if (kind) candidates = foes;
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
  const face = !defender && !a.noFaceAttack;
  return { units, face, defender };
}

// 攻撃宣言時に追加で対象を選ぶキャラ（月のゴブリン）の候補。不要なら null
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
  const cost = playCost(inst) + (haste ? HASTE_EXTRA : 0);
  const logs = [];

  p.cost -= cost;
  p.hand = p.hand.filter((_, i) => i !== handIdx);

  if (card.type === "character") {
    const u = card.isToken ? tokenUnit(card) : instFromCard(inst.cardId);
    if (haste) {
      u.canAttack = true;
      u.noFaceAttack = false; // 即時召喚なら相手プレイヤーも攻撃できる
    }
    p.field = [...p.field, u];
    logs.push(`${card.name}${card.isToken ? "（トークン）" : ""} を召喚${haste ? "（即時）" : ""}`);

    // 召喚時効果（手札から出したコピー・トークンは元カードの召喚時効果を発動する）
    const sid = inst.cardId || card.copyOf || null;
    switch (sid) {
      case "sun_priest":
        if (hasT) damage(s, oid, target, 3, logs);
        break;
      case "earth_priest":
        activateCost(p);
        logs.push("コスト1有効化");
        break;
      case "sun_albert":
        p.field.forEach((x) => { if (x.uid !== u.uid && !isInvincible(x)) x.stat += 3; });
        logs.push("自軍全体 +3");
        break;
      case "moon_albert":
        if (hasT) destroy(s, oid, target, logs);
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
        if (hasT) destroy(s, oid, target, logs);
        break;
      case "moon_witch":
        s.skipNext = oid;
        logs.push("次の相手ターンをスキップ");
        break;
      default:
        break;
    }
  } else {
    // マジック
    p.grave = [...p.grave, { uid: inst.uid, cardId: inst.cardId }];
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
              // 手札が満杯：トークンは破壊、カードは墓地へ（どちらも破壊時効果なし）
              if (t.token) {
                logs.push(`${t.name}（トークン）は手札が満杯のため破壊された（破壊時効果なし）`);
              } else {
                o.grave = [...o.grave, { uid: t.uid, cardId: t.cardId, costMod: 0 }];
                logs.push(`${t.name} は手札が満杯のため墓地へ`);
              }
            } else {
              const back = t.token
                ? {
                    uid: uid(), cardId: null, token: true,
                    tokenId: t.tokenId || null, copyOf: t.copyOf || null,
                    name: t.name, costMod: 0,
                  }
                : { uid: t.uid, cardId: t.cardId, costMod: 0 };
              o.hand = [...o.hand, back];
              logs.push(`${t.name}${t.token ? "（トークン）" : ""} を手札に戻した`);
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
      default:
        break;
    }
  }

  return finish(s, pid, logs);
}

// 攻撃する
// opts.targetUid: 攻撃する相手キャラ / opts.toFace: 相手プレイヤーを攻撃
// opts.extraTarget: 月のゴブリンの -1 対象
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
    logs.push("太陽のゴブリン: 自軍+1");
  }
  if (eid === "earth_goblin") {
    // 予約済みの分も含めて最大コスト6未満なら、次の自分のターン開始時に1有効化
    const planned = p.maxCost + (p.pendingCost || 0);
    if (planned < 6) {
      p.pendingCost = (p.pendingCost || 0) + 1;
      logs.push("地球のゴブリン: 次のターン開始時にコスト有効化");
    } else {
      drawCards(p, 1);
      logs.push("地球のゴブリン: 1ドロー");
    }
  }
  if (eid === "earth_abyss" && !a.firstAttackUsed) {
    a.firstAttackUsed = true;
    o.hp -= 6;
    logs.push("地球の底より出でる者: 相手に6ダメージ");
    if (o.hp <= 0) {
      a.attacked = true;
      a.canAttack = false;
      return finish(s, pid, logs);
    }
  }
  if (ex) {
    const tg = o.field.find((x) => x.uid === extraTarget);
    if (tg && !isInvincible(tg)) {
      tg.stat -= 1;
      logs.push(`月のゴブリン: ${tg.name} -1`);
      if (tg.stat <= 0) destroy(s, oid, tg.uid, logs);
    }
  }

  // 戦闘解決
  a.attacked = true;
  a.canAttack = false;
  if (toFace) {
    o.hp -= a.stat;
    logs.push(`${a.name} が相手プレイヤーに${a.stat}ダメージ`);
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
      // ③ その後で破壊時効果を発動
      if (deadD) onDestroyed(s, oid, deadD, logs);
      if (deadA) onDestroyed(s, pid, deadA, logs);
    }
  }
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
  p.hp += card.cost;
  p.sacrificedThisTurn = true;
  const logs = [
    `${card.name}${card.isToken ? "（トークン）" : ""} を生贄に（コスト上限+1 / HP+${card.cost} / 1ドロー）`,
  ];
  drawCards(p, 1);
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

  p.field.forEach((x) => { x.attacked = false; x.canAttack = true; x.noFaceAttack = false; });
  p.sacrificedThisTurn = false;

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
  starter.field.forEach((x) => { x.canAttack = true; x.attacked = false; });

  s.turn = nextTurn;
  s.turnPhase = "draw";
  s.skipNext = null;
  s.turnCount = (s.turnCount || 1) + 1;
  return finish(s, pid, logs);
}
