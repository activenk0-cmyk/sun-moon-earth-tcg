/* ============================================================
   ゴースト用の記録（プレイの「癖」を集計する）
   Firebase: players/{uid} の ghost 項目に保存する（画面には出さない）

   1試合のあいだは端末（localStorage）に集計しておき、
   決着したときにまとめて Firebase に足し込む。

   保存する中身（すべて「回数」や「合計」の数字だけ）
   ・games / wins / modes        … 何試合記録したか
   ・plays[cardId]               … n: 使った回数 / t: 使った自分のターン数の合計
                                   h: 即時召喚した回数 / tg: 対象を選んで使った回数
   ・atk                         … face: 顔を攻撃 / unit: キャラを攻撃
                                   faceOverUnit: キャラを攻撃できたのに顔を選んだ
                                   unitOverFace: 顔を攻撃できたのにキャラを選んだ
   ・sac                         … n: 生贄にした回数 / t: その自分のターン数の合計
                                   cards[cardId]: 生贄にしたカード
   ・sac.skip                    … 生贄できたのに生贄せずにターンを終えた回数
   ・ends（メインフェーズ終了時）… n: 回数 / left: 余らせたコストの合計
                                   idle: 使えるカードがあるのにターンを終えた回数
                                   handSum: ターン終了時の手札枚数の合計
   ・rm[cardId]                  … 自分でアビリティを外した回数 / rmT: そのターン数の合計
   ============================================================ */
import { db } from "./firebase";
import { doc, setDoc, increment } from "firebase/firestore";
import * as E from "./engine";

const LIVE_KEY = "sme-ghost-live-v1"; // 試合中の集計
const DONE_KEY = "sme-ghost-done-v1"; // 送信済みの試合（2回数えない）

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : fallback;
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}

function emptyTally() {
  return {
    at: Date.now(),
    plays: {},
    atk: { face: 0, unit: 0, faceOverUnit: 0, unitOverFace: 0 },
    sac: { n: 0, t: 0, skip: 0, cards: {} },
    ends: { n: 0, left: 0, idle: 0, handSum: 0 },
    rm: {},
    rmT: 0,
  };
}

// 自分の何ターン目か（先攻・後攻どちらでも 1, 2, 3…）
function myTurnNo(s) {
  return Math.max(1, Math.ceil((s.turnCount || 1) / 2));
}

// 手札のカードID（コピー・トークンは元のカード）
function handCardId(inst) {
  if (!inst) return null;
  if (inst.cardId) return inst.cardId;
  const c = E.handInfo(inst);
  return (c && (c.copyOf || c.tokenId)) || null;
}

/* ---- 1回の行動を記録する（行動する直前の状態を渡す） ----
   key: 試合を見分ける文字列 / s: 行動前の状態 / pid: 自分のID
   act: { type: "play", handIdx, haste, target }
        { type: "attack", attackerUid, targetUid, toFace }
        { type: "sac", handIdx }
        { type: "remove", abilityUid }
        { type: "end" }      … メインフェーズを終えた（生贄フェーズへ）
        { type: "turnEnd" }  … ターン終了ボタンを押した */
export function ghostNote(key, s, pid, act) {
  if (!key || !s || !pid || !act || !s.players || !s.players[pid]) return;
  try {
    const all = loadJson(LIVE_KEY, {});
    const t = all[key] || emptyTally();
    const p = s.players[pid];
    const turn = myTurnNo(s);

    if (act.type === "play") {
      const id = handCardId(p.hand[act.handIdx]);
      if (id) {
        const r = t.plays[id] || { n: 0, t: 0, h: 0, tg: 0 };
        r.n += 1;
        r.t += turn;
        if (act.haste) r.h += 1;
        if (act.target) r.tg += 1;
        t.plays[id] = r;
      }
    } else if (act.type === "attack") {
      const ao = E.attackOptions(s, pid, act.attackerUid);
      if (act.toFace) {
        t.atk.face += 1;
        if (ao && ao.units && ao.units.length) t.atk.faceOverUnit += 1;
      } else {
        t.atk.unit += 1;
        if (ao && ao.face) t.atk.unitOverFace += 1;
      }
    } else if (act.type === "sac") {
      const id = handCardId(p.hand[act.handIdx]);
      t.sac.n += 1;
      t.sac.t += turn;
      if (id) t.sac.cards[id] = (t.sac.cards[id] || 0) + 1;
    } else if (act.type === "remove") {
      const a = E.abilitiesOf(p).find((x) => x.uid === act.abilityUid);
      if (a && a.cardId) {
        t.rm[a.cardId] = (t.rm[a.cardId] || 0) + 1;
        t.rmT += turn;
      }
    } else if (act.type === "turnEnd") {
      if (E.canSacrifice(s, pid)) t.sac.skip = (t.sac.skip || 0) + 1;
    } else if (act.type === "end") {
      t.ends.n += 1;
      t.ends.left += p.cost || 0;
      t.ends.handSum += (p.hand || []).length;
      let playable = false;
      if (E.phaseOf(s) === "main") {
        for (let i = 0; i < (p.hand || []).length; i++) {
          if (E.canPlay(s, pid, i, false)) { playable = true; break; }
        }
      }
      if (playable) t.ends.idle += 1;
    }

    t.at = Date.now();
    all[key] = t;
    // 古い試合の集計は捨てる（最大5試合ぶん）
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    keys.slice(5).forEach((k) => delete all[k]);
    saveJson(LIVE_KEY, all);
  } catch {
    // 記録できなくてもゲームは続ける
  }
}

/* ---- 決着したときに Firebase へ足し込む ----
   uid: ログイン中のプレイヤー（未ログインなら集計を捨てるだけ）
   key: 試合を見分ける文字列 / mode: "cpu" / "room" / "starpick" / win: 勝ったか */
export async function flushGhost(uid, key, mode, win) {
  if (!key) return;
  const all = loadJson(LIVE_KEY, {});
  const t = all[key];
  const forget = () => {
    const cur = loadJson(LIVE_KEY, {});
    delete cur[key];
    saveJson(LIVE_KEY, cur);
  };
  if (!uid || !t) { forget(); return; }

  const doneKey = `${uid}:${key}`;
  const done = loadJson(DONE_KEY, []);
  if (Array.isArray(done) && done.includes(doneKey)) { forget(); return; }

  const inc = (n) => increment(n || 0);
  const plays = {};
  Object.entries(t.plays).forEach(([id, r]) => {
    plays[id] = { n: inc(r.n), t: inc(r.t), h: inc(r.h), tg: inc(r.tg) };
  });
  const sacCards = {};
  Object.entries(t.sac.cards).forEach(([id, n]) => { sacCards[id] = inc(n); });
  const rm = {};
  Object.entries(t.rm).forEach(([id, n]) => { rm[id] = inc(n); });
  const m = mode === "room" || mode === "starpick" ? mode : "cpu";

  try {
    await setDoc(
      doc(db, "players", uid),
      {
        ghost: {
          v: 1,
          games: inc(1),
          wins: inc(win ? 1 : 0),
          modes: { [m]: { g: inc(1), w: inc(win ? 1 : 0) } },
          plays,
          atk: {
            face: inc(t.atk.face),
            unit: inc(t.atk.unit),
            faceOverUnit: inc(t.atk.faceOverUnit),
            unitOverFace: inc(t.atk.unitOverFace),
          },
          sac: { n: inc(t.sac.n), t: inc(t.sac.t), skip: inc(t.sac.skip), cards: sacCards },
          ends: {
            n: inc(t.ends.n),
            left: inc(t.ends.left),
            idle: inc(t.ends.idle),
            handSum: inc(t.ends.handSum),
          },
          rm,
          rmT: inc(t.rmT),
          lastAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );
    saveJson(DONE_KEY, [...(Array.isArray(done) ? done : []), doneKey].slice(-50));
    forget();
  } catch {
    // 送れなくてもゲームは続ける（集計は端末に残る）
  }
}
