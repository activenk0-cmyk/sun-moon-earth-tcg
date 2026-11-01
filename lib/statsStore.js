/* ============================================================
   対戦の記録（マイページ用の統計）
   Firebase: players/{uid} の stats 項目に保存する
   ・何試合したか／何勝したか（モード別）
   ・カードごと：デッキに入れて戦った回数／そのうち勝った回数
   ・陣営ごと：デッキに入っていた枚数の合計（枠の数）／勝った試合での枚数
   ============================================================ */
import { db } from "./firebase";
import { doc, setDoc, increment } from "firebase/firestore";
import { SLOTS, getCard } from "./cards";

// 同じ試合を2回数えないために、記録済みの試合を端末に覚えておく
const DONE_KEY = "sme-stats-done-v1";

function loadDone() {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveDone(list) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify((list || []).slice(-50)));
  } catch {
    // 保存できなくても続ける
  }
}

/* ---- 1試合の結果を記録する ----
   uid: ログイン中のプレイヤー（未ログインなら何もしない）
   key: 試合を見分ける文字列
   mode: "cpu" / "room"
   selection: 使ったデッキ（{ "1": cardId, "2a": cardId, ... }）
   win: 勝ったかどうか */
export async function recordMatchStats(uid, key, mode, selection, win) {
  if (!uid || !key || !selection) return;
  const doneKey = `${uid}:${key}`;
  const done = loadDone();
  if (done.includes(doneKey)) return;

  const one = increment(1);
  const w = win ? 1 : 0;

  const cards = {};
  const factions = {};
  SLOTS.forEach((slot) => {
    const id = selection[slot];
    const c = id ? getCard(id) : null;
    if (!c) return;
    // カード：使った試合数・勝った試合数
    cards[id] = { g: one, w: increment(w) };
    // 陣営：入っていた枠の数（どの陣営のカードを多く使っているか）
    const f = c.faction || "common";
    if (!factions[f]) factions[f] = { n: 0, wn: 0 };
    factions[f].n += 1;
    if (win) factions[f].wn += 1;
  });

  const factionData = {};
  Object.keys(factions).forEach((f) => {
    factionData[f] = { n: increment(factions[f].n), wn: increment(factions[f].wn) };
  });

  const m = mode === "room" ? "room" : "cpu";

  try {
    await setDoc(
      doc(db, "players", uid),
      {
        stats: {
          games: one,
          wins: increment(w),
          modes: { [m]: { g: one, w: increment(w) } },
          cards,
          factions: factionData,
          lastAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );
    saveDone([...done, doneKey]);
  } catch {
    // 保存できなくてもゲームは続ける
  }
}

/* ---- マイページ用：保存された記録を見やすい形にする ----
   data: players/{uid} の stats 項目 */
export function summarizeStats(data) {
  const s = data && typeof data === "object" ? data : {};
  const cards = Object.entries(s.cards || {})
    .map(([id, v]) => ({ id, card: getCard(id), g: v?.g || 0, w: v?.w || 0 }))
    .filter((x) => x.card && x.g > 0)
    .sort((a, b) => b.g - a.g || b.w - a.w);
  const factions = Object.entries(s.factions || {})
    .map(([f, v]) => ({ faction: f, n: v?.n || 0, wn: v?.wn || 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return {
    games: s.games || 0,
    wins: s.wins || 0,
    modes: s.modes || {},
    cards,
    factions,
    lastAt: s.lastAt || null,
  };
}
