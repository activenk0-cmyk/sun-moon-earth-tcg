// 対戦中の演出（案B）の「出来事 → 演出」の対応表と、再生の下ごしらえをまとめたファイル
// ・出来事は lib/engine.js がログの行（{ by, t, n, fx }）の fx に入れたもの
// ・FX_SPEEDS / loadFxSpeed / saveFxSpeed：演出の速さ（ふつう／はやい／なし）
// ・buildGroups：新しいログを「1回の操作」ごとにまとめる
// ・buildSteps：出来事を「同時に再生するまとまり」に分ける
// ・stepDuration：1まとまりの再生時間
// ・applyPre / applyPost：演出中に表示する盤面を、出来事に合わせて少しずつ進める
// ・markOf / overlaysOf：カードに付けるアニメーションのクラス、数字のポップ・札・光る枠
// ・diffToEvents：出来事の記録が無い古いログ用（盤面の差分から出来事を作る）
// ・logGroupAt / fxToChanges：ログの行をタップしたときの「詳しく見る」用
// アニメーション自体は app/globals.css（fxa- / fxo- で始まるクラス）

import { getCard, tokenInfo } from "./cards";
import { TRIVIAL_LOG } from "./online";

/* ============ 演出の速さ ============ */
export const FX_SPEEDS = [
  { id: "normal", label: "ふつう", mul: 1 },
  { id: "fast", label: "はやい", mul: 0.5 },
  { id: "none", label: "なし", mul: 0 },
];
const SPEED_KEY = "sme-fx-speed";
export function loadFxSpeed() {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return FX_SPEEDS.some((s) => s.id === v) ? v : "normal";
  } catch {
    return "normal";
  }
}
export function saveFxSpeed(v) {
  try {
    localStorage.setItem(SPEED_KEY, v);
  } catch {
    // 保存できなくても続ける
  }
}
export const speedMul = (id) => (FX_SPEEDS.find((s) => s.id === id) || FX_SPEEDS[0]).mul;

/* ============ 時間（ふつうの速さ・ミリ秒） ============ */
export const BANNER_LEAD = 220; // 帯を出してから最初の演出までの間
export const GROUP_GAP = 160; // 操作と操作の間
export const CUTIN_MS = 820; // カットイン
const DURATION = {
  attack: 380,
  dmg: 520,
  buff: 460,
  hp: 520,
  destroy: 480,
  vanish: 480,
  bounce: 480,
  summon: 500,
  trigger: 540,
  kw: 440,
  resist: 460,
  cost: 440,
  handCost: 440,
  abBreak: 480,
  abRemove: 420,
  abTimer: 440,
  equip: 460,
  draw: 420,
  sac: 540,
  handBreak: 480,
  mill: 480,
  shuffle: 440,
};
// 演出の無い出来事
const SILENT = new Set(["play", "skip"]);
// 場から消える出来事（同じまとまりの中では、ほかの演出の後に再生する）
const REMOVE = new Set(["destroy", "vanish", "bounce", "abBreak", "abRemove"]);

/* ============ 名前・カード ============ */
export function cardOf(id) {
  if (!id) return null;
  return getCard(id) || tokenInfo({ tokenId: id }) || tokenInfo({ copyOf: id }) || null;
}

/* ============ ログを操作ごとにまとめる ============ */
// fresh：新しく増えたログの行（古い順）
// 戻り値：[{ by, mine, lines（帯・詳細に出す文）, all（すべての文）, events, legacy }]
export function buildGroups(fresh, myId) {
  const groups = [];
  let cur = null;
  (fresh || []).forEach((l) => {
    if (!l || typeof l !== "object") return;
    const hasFx = Array.isArray(l.fx);
    if (hasFx || !cur || cur.by !== l.by) {
      cur = { by: l.by, mine: l.by === myId, lines: [], all: [], events: hasFx ? [...l.fx] : [], legacy: !hasFx };
      groups.push(cur);
    }
    if (l.t) {
      cur.all.push(l.t);
      if (!TRIVIAL_LOG.test(l.t) && l.t !== "決着！") cur.lines.push(l.t);
    }
  });
  return groups.filter((g) => g.lines.length || g.events.some((e) => !SILENT.has(e.k)));
}

// 帯に出す文（攻撃・召喚・使用などの主な1行）
export function mainLine(g) {
  const lines = g.lines.length ? g.lines : g.all;
  return (
    lines.find((t) => /を攻撃|プレイヤーに\d+ダメージ|を召喚|を使用|を装着した|を付けた|を外した|を生贄/.test(t)) ||
    lines[0] ||
    ""
  );
}

// 帯の左に出す種類
export function groupTag(g) {
  const ks = g.events.map((e) => e.k);
  const t = mainLine(g);
  if (ks.includes("attack") || /を攻撃|プレイヤーに\d+ダメージ/.test(t)) return { text: "攻撃", cls: "atk" };
  if (ks.includes("magic") || /を使用/.test(t)) return { text: "マジック", cls: "mag" };
  if (ks.includes("equip") || ks.includes("abRemove") || /を装着した|を外した/.test(t)) return { text: "アビリティ", cls: "abl" };
  if (ks.includes("sac") || /を生贄/.test(t)) return { text: "生贄", cls: "sac" };
  if (g.events.some((e) => e.k === "summon" && (e.how === "play" || e.how === "haste")) || /を召喚/.test(t)) {
    return { text: "召喚", cls: "sum" };
  }
  if (/ターン終了/.test(g.all.join(" "))) return { text: "ターン終了", cls: "end" };
  return { text: "行動", cls: "etc" };
}

/* ============ 再生のまとまり ============ */
// w=1（同時）の出来事を1つのまとまりにし、その中で「変化 → 場から消える」の順に分ける
export function buildSteps(events) {
  const raw = [];
  (events || []).forEach((ev) => {
    if (!ev || SILENT.has(ev.k)) return;
    const last = raw[raw.length - 1];
    if (ev.w && last) last.push(ev);
    else raw.push([ev]);
  });
  const out = [];
  raw.forEach((list) => {
    const a = list.filter((e) => !REMOVE.has(e.k));
    const b = list.filter((e) => REMOVE.has(e.k));
    if (a.length) out.push(a);
    if (b.length) out.push(b);
  });
  return out;
}

export function stepDuration(evs, mul) {
  const ms = Math.max(0, ...evs.map((e) => DURATION[e.k] || 0));
  return Math.round(ms * mul);
}

/* ============ 演出中の盤面を進める ============ */
// players：演出中に表示しているプレイヤーのデータ（直接書き換える）
// final：演出後の本当のプレイヤーのデータ（場に出たキャラの情報を取るため）
const clone = (v) => JSON.parse(JSON.stringify(v));
export const clonePlayers = (p) => (p ? clone(p) : p);

function unitFrom(ev, final) {
  const fu = final?.[ev.p]?.field?.find((x) => x.uid === ev.u);
  if (fu) return { ...clone(fu), stat: ev.st ?? fu.stat };
  return {
    uid: ev.u, cardId: ev.cid || null, token: !ev.cid, tokenId: ev.tid || null, copyOf: ev.cof || null,
    name: ev.nm || "", stat: ev.st ?? 0, keywords: [], canAttack: false, attacked: false,
  };
}

// 出来事が始まるとき（数字が変わる・場に出る）
export function applyPre(players, ev, final) {
  const p = players?.[ev.p];
  if (!p) return;
  const unit = () => (p.field || []).find((x) => x.uid === ev.u);
  switch (ev.k) {
    case "dmg":
    case "buff": {
      const u = unit();
      if (u && ev.s != null) u.stat = ev.s;
      break;
    }
    case "hp":
      if (ev.hp != null) p.hp = ev.hp;
      break;
    case "summon":
      if (!unit()) p.field = [...(p.field || []), unitFrom(ev, final)];
      break;
    case "equip":
      if (!(p.abilities || []).some((a) => a.uid === ev.u)) {
        p.abilities = [...(p.abilities || []), { uid: ev.u, cardId: ev.c, timer: ev.v ?? null }];
      }
      break;
    case "abTimer": {
      const a = (p.abilities || []).find((x) => x.uid === ev.u);
      if (a) a.timer = ev.v;
      break;
    }
    case "cost":
      if (ev.mc != null) p.maxCost = ev.mc;
      if (ev.cc != null) p.cost = ev.cc;
      break;
    case "kw": {
      const u = unit();
      const fu = final?.[ev.p]?.field?.find((x) => x.uid === ev.u);
      if (u && fu) u.keywords = [...(fu.keywords || [])];
      break;
    }
    case "attack": {
      const u = unit();
      if (u) u.attacked = true;
      break;
    }
    default:
      break;
  }
}

// 出来事が終わるとき（場から消える）
export function applyPost(players, ev) {
  const p = players?.[ev.p];
  if (!p) return;
  if (ev.k === "destroy" || ev.k === "vanish" || ev.k === "bounce") {
    p.field = (p.field || []).filter((x) => x.uid !== ev.u);
  }
  if (ev.k === "abBreak" || ev.k === "abRemove") {
    p.abilities = (p.abilities || []).filter((x) => x.uid !== ev.u);
  }
}

// その出来事の原因が、今表示している盤面にいるか（いれば盤面で、いなければカットインで見せる）
export function onBoard(players, ev) {
  const p = players?.[ev.p];
  if (!p) return false;
  if (ev.u && (p.field || []).some((x) => x.uid === ev.u)) return true;
  if (ev.ab && (p.abilities || []).some((x) => x.uid === ev.ab)) return true;
  return false;
}

/* ============ カードに付けるクラス ============ */
// 戻り値：{ "u:uid": クラス名, "ab:uid": クラス名 }
export function marksOf(evs, myId) {
  const m = {};
  evs.forEach((ev) => {
    const mine = ev.p === myId;
    const u = ev.u ? `u:${ev.u}` : null;
    switch (ev.k) {
      case "attack": m[u] = mine ? "fxa-bob-up" : "fxa-bob-down"; break;
      case "dmg": m[u] = "fxa-hit"; break;
      case "buff": m[u] = ev.v > 0 ? "fxa-buff" : "fxa-hit"; break;
      case "destroy": m[u] = "fxa-die"; break;
      case "vanish": m[u] = "fxa-vanish"; break;
      case "bounce": m[u] = mine ? "fxa-back-down" : "fxa-back-up"; break;
      case "summon":
        m[u] = ev.how === "token" ? "fxa-sum-token" : ev.how === "copy" || ev.how === "revive" ? "fxa-sum-copy" : mine ? "fxa-sum-me" : "fxa-sum-opp";
        break;
      case "kw":
      case "resist": m[u] = "fxa-glow"; break;
      case "trigger":
        if (ev.u) m[u] = "fxa-glow";
        if (ev.ab) m[`ab:${ev.ab}`] = "fxa-ab-glow";
        break;
      case "equip": m[`ab:${ev.u}`] = "fxa-ab-in"; break;
      case "abBreak":
      case "abRemove": m[`ab:${ev.u}`] = "fxa-ab-break"; break;
      case "abTimer": m[`ab:${ev.u}`] = "fxa-ab-tick"; break;
      default: break;
    }
  });
  return m;
}

/* ============ 数字のポップ・札・光る枠・スライド ============ */
// target：画面の要素（data-fx の値）
// type：pop（数字）／ chip（札）／ ring（光る枠）／ draw（裏向きのカードが入る）／ sac（生贄置き場へ吸い込まれる）
export function overlaysOf(evs, myId) {
  const out = [];
  const side = (p) => (p === myId ? "me" : "opp");
  evs.forEach((ev) => {
    const s = side(ev.p);
    const ut = ev.u ? `u-${ev.u}` : null;
    switch (ev.k) {
      case "dmg":
        out.push({ type: "pop", target: ut, text: `-${ev.v}`, tone: "bad" });
        break;
      case "buff":
        out.push({ type: "pop", target: ut, text: ev.v > 0 ? `+${ev.v}` : `${ev.v}`, tone: ev.v > 0 ? "good" : "bad" });
        break;
      case "hp":
        out.push({ type: "ring", target: `hp-${s}`, tone: ev.v < 0 ? "bad" : "good" });
        out.push({
          type: "pop", target: `hp-${s}`, tone: ev.v < 0 ? "bad" : "good",
          text: ev.set ? `HP${ev.hp}` : ev.v < 0 ? `${ev.v}` : `+${ev.v}`,
        });
        break;
      case "trigger":
        if (ev.u) out.push({ type: "chip", target: ut, text: ev.lb || "効果" });
        else if (ev.ab) out.push({ type: "chip", target: `ab-${ev.ab}`, text: ev.lb || "効果" });
        break;
      case "kw":
        out.push({ type: "chip", target: ut, text: ev.lb || "効果", tone: "good" });
        break;
      case "resist":
        out.push({ type: "chip", target: ut, text: "効かない", tone: "info" });
        break;
      case "cost":
        out.push({ type: "ring", target: `cost-${s}`, tone: ev.v < 0 ? "bad" : "cost" });
        out.push({ type: "pop", target: `cost-${s}`, tone: ev.v < 0 ? "bad" : "cost", text: `最大${ev.v > 0 ? "+" : ""}${ev.v}` });
        break;
      case "handCost":
        out.push({ type: "ring", target: `hand-${s}`, tone: ev.v < 0 ? "good" : "bad" });
        out.push({ type: "pop", target: `hand-${s}`, tone: ev.v < 0 ? "good" : "bad", text: `コスト${ev.v > 0 ? "+" : ""}${ev.v}${ev.n > 1 ? `×${ev.n}` : ""}` });
        break;
      case "draw":
        if (ev.v) out.push({ type: "draw", target: `hand-${s}`, from: `deck-${s}`, n: Math.min(ev.v, 3) });
        if (ev.cm) out.push({ type: "pop", target: `hand-${s}`, tone: "good", text: `コスト${ev.cm}` });
        if (ev.burn) out.push({ type: "pop", target: `deck-${s}`, tone: "bad", text: `手札満杯 ${ev.burn}枚墓地へ` });
        break;
      case "sac":
        out.push({ type: "sac", target: `sac-${s}`, from: `hand-${s}` });
        out.push({ type: "ring", target: `sac-${s}`, tone: "cost" });
        break;
      case "handBreak":
        out.push({ type: "ring", target: `hand-${s}`, tone: "bad" });
        out.push({ type: "pop", target: `hand-${s}`, tone: "bad", text: `手札-${ev.v}` });
        break;
      case "mill":
        out.push({ type: "ring", target: `deck-${s}`, tone: "bad" });
        out.push({ type: "pop", target: `deck-${s}`, tone: "bad", text: `山札-${ev.v}` });
        break;
      case "shuffle":
        out.push({ type: "ring", target: `hand-${s}`, tone: "info" });
        out.push({ type: "ring", target: `deck-${s}`, tone: "info" });
        break;
      case "abTimer":
        out.push({ type: "pop", target: `ab-${ev.u}`, tone: "cost", text: `T${ev.v}` });
        break;
      case "bounce":
        out.push({ type: "chip", target: ut, text: ev.gr ? "手札満杯で墓地へ" : "手札へ", tone: "info" });
        break;
      case "vanish":
        out.push({ type: "chip", target: ut, text: "消滅", tone: "info" });
        break;
      default:
        break;
    }
  });
  return out;
}

// カットインに出す内容（出来事の前に挟む）
// shown：この操作の中ですでにカットインを出したカード（同じカードを2回出さない）
export function cutinsOf(evs, players, myId, shown) {
  const out = [];
  evs.forEach((ev) => {
    let lb = null;
    if (ev.k === "magic") lb = "マジック";
    else if (ev.k === "equip") lb = ev.c === "second_bonus" ? "後攻ボーナス" : "アビリティ装着";
    else if (ev.k === "trigger" && !onBoard(players, ev)) lb = ev.lb || "効果";
    else if ((ev.k === "handBreak" || ev.k === "mill") && ev.c && !shown.has(ev.c)) lb = ev.k === "mill" ? "山札を墓地へ" : "手札を破壊";
    if (!lb) return;
    const key = ev.c || ev.nm || lb;
    if (ev.k !== "trigger" && ev.k !== "magic" && ev.k !== "equip" && shown.has(key)) return;
    shown.add(key);
    const c = cardOf(ev.c);
    out.push({ lb, mine: ev.k === "handBreak" || ev.k === "mill" ? ev.p !== myId : ev.p === myId, card: c, name: c?.name || ev.nm || "" });
  });
  return out;
}

/* ============ 古いログ用：盤面の差分から出来事を作る ============ */
// changes：lib/online.js の diffBoards の結果
export function diffToEvents(changes, myId, oppId, finalPlayers) {
  const pidOf = (side) => (side === "me" ? myId : oppId);
  const out = [];
  (changes || []).forEach((c) => {
    const p = pidOf(c.side);
    if (c.kind === "unit" && c.acted) out.push({ k: "attack", p, u: c.uid });
  });
  (changes || []).forEach((c) => {
    const p = pidOf(c.side);
    if (c.kind === "hp") out.push({ k: "hp", p, v: c.after - c.before, hp: c.after, w: 1 });
    if (c.kind === "unit" && c.before !== c.after) {
      const v = c.after - c.before;
      out.push(v < 0 ? { k: "dmg", p, u: c.uid, v: -v, s: c.after, w: 1 } : { k: "buff", p, u: c.uid, v, s: c.after, w: 1 });
    }
    if (c.kind === "new") {
      const fu = finalPlayers?.[p]?.field?.find((x) => x.uid === c.uid);
      out.push({ k: "summon", p, u: c.uid, how: "play", nm: c.name, st: c.after, cid: fu?.cardId, tid: fu?.tokenId, cof: fu?.copyOf, w: 1 });
    }
  });
  (changes || []).forEach((c) => {
    if (c.kind === "gone") out.push({ k: c.destroyed ? "destroy" : "vanish", p: pidOf(c.side), u: c.uid, w: 1 });
  });
  if (out[0]) delete out[0].w;
  // 最初の攻撃（跳ねる）は単独、そのあとの変化はまとめて
  const firstNonAtk = out.findIndex((e) => e.k !== "attack");
  if (firstNonAtk > 0) delete out[firstNonAtk].w;
  return out;
}

/* ============ ログの「詳しく見る」 ============ */
// log の i 番目の行を含む操作（行の範囲と出来事）
export function logGroupAt(log, i) {
  const arr = log || [];
  const l = arr[i];
  if (!l || typeof l !== "object") return null;
  let start = i;
  while (start > 0 && !Array.isArray(arr[start].fx)) {
    const prev = arr[start - 1];
    if (!prev || typeof prev !== "object" || prev.by !== l.by) break;
    start -= 1;
  }
  let end = i;
  while (end + 1 < arr.length) {
    const nx = arr[end + 1];
    if (!nx || typeof nx !== "object" || nx.by !== l.by || Array.isArray(nx.fx)) break;
    end += 1;
  }
  const rows = arr.slice(start, end + 1);
  const lines = rows.map((r) => r.t).filter((t) => t && !TRIVIAL_LOG.test(t));
  return {
    by: l.by,
    lines: lines.length ? lines : rows.map((r) => r.t).filter(Boolean),
    events: Array.isArray(arr[start].fx) ? arr[start].fx : [],
  };
}

// 出来事から、詳しく見るパネルに出す「変化の一覧」を作る（旧モーダルと同じ形）
// nameOf(uid)：キャラの名前
export function fxToChanges(events, myId, nameOf) {
  const side = (p) => (p === myId ? "me" : "opp");
  const hp = {};
  const units = new Map();
  const unitOf = (ev) => {
    if (!units.has(ev.u)) {
      units.set(ev.u, { side: side(ev.p), kind: "unit", uid: ev.u, name: nameOf(ev.u) || ev.nm || "キャラ" });
    }
    return units.get(ev.u);
  };
  (events || []).forEach((ev) => {
    if (ev.k === "hp") {
      if (!hp[ev.p]) hp[ev.p] = { side: side(ev.p), kind: "hp", before: ev.hp - ev.v };
      hp[ev.p].after = ev.hp;
    } else if (ev.k === "dmg" || ev.k === "buff") {
      const m = unitOf(ev);
      const before = ev.k === "dmg" ? ev.s + ev.v : ev.s - ev.v;
      if (m.before == null) m.before = before;
      m.after = ev.s;
    } else if (ev.k === "attack") {
      unitOf(ev).acted = true;
    } else if (ev.k === "summon") {
      const m = unitOf(ev);
      m.kind = "new";
      m.name = ev.nm || m.name;
      m.after = ev.st;
    } else if (ev.k === "destroy" || ev.k === "vanish" || ev.k === "bounce") {
      const m = unitOf(ev);
      m.kind = "gone";
      m.destroyed = ev.k === "destroy";
      if (m.before == null) m.before = m.after ?? "";
    }
  });
  const list = [...Object.values(hp), ...units.values()];
  list.forEach((c) => {
    if (c.kind === "unit") {
      if (c.after == null) c.after = c.before ?? "";
      if (c.before == null) c.before = c.after;
    }
  });
  return list;
}
