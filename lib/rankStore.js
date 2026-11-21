/* ============================================================
   CPU戦ランクの保存（Firebase: players/{uid} の rank 項目）
   ランクはモードごとに別々：
     クラシック → rank 項目 / オールスター → rankAllstar 項目
   どちらのランクかは試合ID（gameId）の頭で決まる（"allstar:" ならオールスター）
   計算そのものは lib/rank.js にまかせる
   ============================================================ */
import { db } from "./firebase";
import { doc, getDocFromServer, runTransaction } from "firebase/firestore";
import { normalizeRankData, startRankedMatch, settleRankedMatch } from "./rank";

// ランクの種類 → 保存する項目名
const RANK_FIELD = { classic: "rank", allstar: "rankAllstar" };
export const RANK_KINDS = Object.keys(RANK_FIELD);
// 試合IDからランクの種類を決める
export const rankKindOf = (gameId) => (String(gameId || "").startsWith("allstar:") ? "allstar" : "classic");
const fieldOf = (kind) => RANK_FIELD[kind] || "rank";

// 決着の保存に失敗したときに、端末へ一時的に覚えておく場所
const UNSENT_KEY = "sme-rank-unsent-v1";

function loadUnsent() {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveUnsent(list) {
  try {
    localStorage.setItem(UNSENT_KEY, JSON.stringify((list || []).slice(-10)));
  } catch {
    // 保存できなくても続ける
  }
}

function addUnsent(uid, gameId, win) {
  const list = loadUnsent().filter((x) => !(x.uid === uid && x.gameId === gameId));
  list.push({ uid, gameId, win: !!win });
  saveUnsent(list);
}

function removeUnsent(uid, gameId) {
  saveUnsent(loadUnsent().filter((x) => !(x.uid === uid && x.gameId === gameId)));
}

/* ---- 現在のランクデータを読み込む ---- */
// kind: "classic"（クラシック） / "allstar"（オールスター）
export async function loadRank(uid, kind = "classic") {
  if (!uid) return normalizeRankData(null);
  const snap = await getDocFromServer(doc(db, "players", uid));
  const data = snap.exists() ? snap.data() : {};
  return normalizeRankData(data[fieldOf(kind)]);
}

/* ---- 全モードのランクをまとめて読み込む ---- 戻り値: { classic, allstar } */
export async function loadAllRanks(uid) {
  const snap = uid ? await getDocFromServer(doc(db, "players", uid)) : null;
  const data = snap && snap.exists() ? snap.data() : {};
  const out = {};
  RANK_KINDS.forEach((k) => { out[k] = normalizeRankData(data[fieldOf(k)]); });
  return out;
}

/* ---- 対戦開始：負け分を先に引いて保存 ----
   失敗したら例外を投げる（呼び出し側で対戦開始を止める） */
export async function beginRankedMatch(uid, gameId) {
  if (!uid) throw new Error("ランク戦はログインが必要です");
  if (!gameId) throw new Error("試合IDがありません");
  const ref = doc(db, "players", uid);
  const field = fieldOf(rankKindOf(gameId));
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = normalizeRankData(snap.exists() ? snap.data()[field] : null);
    const next = startRankedMatch(cur, gameId);
    tx.set(ref, { [field]: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
}

/* ---- 対戦終了：結果を確定して保存 ----
   戻り値: { data, result }（result はリザルト画面用。確定済みの試合なら前回の結果）
   通信に失敗した場合は端末に覚えておき、例外を投げる */
export async function finishRankedMatch(uid, gameId, win) {
  if (!uid || !gameId) return { data: null, result: null };
  const ref = doc(db, "players", uid);
  const field = fieldOf(rankKindOf(gameId));
  try {
    const out = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const cur = normalizeRankData(snap.exists() ? snap.data()[field] : null);
      const settled = settleRankedMatch(cur, gameId, win);
      // 新しく確定したときだけ書き込む
      if (cur.pending && cur.pending.gameId === gameId) {
        tx.set(ref, { [field]: settled.data, updatedAt: new Date().toISOString() }, { merge: true });
      }
      return settled;
    });
    removeUnsent(uid, gameId);
    return out;
  } catch (e) {
    addUnsent(uid, gameId, win);
    throw e;
  }
}

/* ---- 送れなかった決着を再送（ログイン時などに呼ぶ） ----
   戻り値: 最新のランクデータ { classic, allstar } */
export async function flushUnsentRank(uid) {
  if (!uid) return null;
  const mine = loadUnsent().filter((x) => x.uid === uid);
  for (const u of mine) {
    try {
      await finishRankedMatch(uid, u.gameId, u.win);
    } catch {
      // まだ通信できない → 次の機会に再送
    }
  }
  return await loadAllRanks(uid);
}
