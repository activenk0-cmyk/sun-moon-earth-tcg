// オンライン対戦（ルームマッチ）の補助と、アカウント・連勝記録の補助をまとめたファイル
// ・連勝記録：loadStreaks / saveStreaksLocal / pushStreaks / mergeStreaks / recordStreak / isEmptyRank
//   （ログイン中のアカウントは currentUid に入れ、書き換えは setCurrentUid を使う）
// ・プレイヤーID・パスワード：PLAYER_ID_RE / PIN_RE / fetchUsedIds / firstFreeId / claimPlayerId
//   idToEmail / pinToPassword / authErrorText
// ・ルームのデータ：gameKey / newLobby / lobbyDoc / gameDoc
// ・ログと再生パネル：TRIVIAL_LOG / newEntries / stampLog / maxSeq / pickNewer / replayMs
//   lastOppActions / diffBoards
// ※ app/page.js から中身をそのまま移したもの

import { db } from "./firebase";
import { doc, getDocFromServer, getDocsFromServer, collection, setDoc } from "firebase/firestore";
import * as E from "./engine";

// 再生パネルに出さない細かいログ
export const TRIVIAL_LOG = /^(カードを1枚引いた|生贄フェーズへ|ターン終了)$/;

/* ============ 連勝記録（CPU戦とルームマッチで別々に保存） ============ */
// ログイン中はアカウントごとに端末へ保存し、Firebase（players コレクション）にも保存する
// ログインしていないときは、この端末だけに保存する
export const STREAK_KEY = "sme-streak-v1";
export let currentUid = null; // ログイン中のアカウント（Firebaseの内部ID）
// ログイン中のアカウントを切り替える（ほかのファイルからは currentUid を直接書き換えられないため）
export function setCurrentUid(uid) {
  currentUid = uid;
}

export const streakKeyFor = (uid) => (uid ? `${STREAK_KEY}:${uid}` : STREAK_KEY);

export function loadStreaks(uid = currentUid) {
  try {
    const raw = localStorage.getItem(streakKeyFor(uid));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function saveStreaksLocal(all, uid = currentUid) {
  try {
    localStorage.setItem(streakKeyFor(uid), JSON.stringify(all || {}));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}

export async function pushStreaks(uid, all) {
  if (!uid) return;
  try {
    await setDoc(
      doc(db, "players", uid),
      { streaks: all || {}, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch {
    // 保存できなくてもゲームは続ける（端末には残っている）
  }
}

// 端末の記録とFirebaseの記録を、モードごとに新しい方でまとめる
export function mergeStreaks(local, remote) {
  const out = { ...(local || {}) };
  for (const m of ["cpu", "room"]) {
    const a = (local || {})[m];
    const b = (remote || {})[m];
    if (b && (!a || (b.at || "") > (a.at || ""))) out[m] = b;
  }
  return out;
}

// ランクデータが「まだ一度もランク戦をしていない状態」かどうか
export function isEmptyRank(r) {
  return !!r && (r.points || 0) <= 1500 && !r.streak && !r.best && !r.last && !r.pending;
}

// 1試合の結果を記録する（同じ試合を2回数えないよう、試合ごとのキーで判定）
// mode: "cpu" / "room"、key: 試合を見分ける文字列、win: 勝ったかどうか
export function recordStreak(mode, key, win) {
  const all = loadStreaks();
  const cur = all[mode] || { cur: 0, best: 0, keys: [] };
  const keys = Array.isArray(cur.keys) ? cur.keys : [];
  if (!key || keys.includes(key)) {
    return { cur: cur.cur || 0, best: cur.best || 0, isNewBest: !!cur.lastNewBest && cur.lastKey === key };
  }
  const nextCur = win ? (cur.cur || 0) + 1 : 0;
  const prevBest = cur.best || 0;
  const nextBest = Math.max(prevBest, nextCur);
  const isNewBest = win && nextCur > prevBest && nextCur >= 2;
  all[mode] = {
    cur: nextCur,
    best: nextBest,
    keys: [...keys, key].slice(-30),
    lastKey: key,
    lastNewBest: isNewBest,
    at: new Date().toISOString(),
  };
  saveStreaksLocal(all);
  pushStreaks(currentUid, all);
  return { cur: nextCur, best: nextBest, isNewBest };
}

/* ============ プレイヤーアカウント ============ */
// プレイヤーID：英小文字1文字＋1〜99（a1〜z99）
export const PLAYER_ID_RE = /^[a-z]([1-9]|[1-9][0-9])$/;
export const PIN_RE = /^[0-9]{3}$/;
// Firebaseの仕組み上、IDとパスワードを内部用の形に変換して使う（実在のメールではない）
// a1, a2, … a99, b1, … z99 の順に並べたID一覧
export const ALL_PLAYER_IDS = Array.from({ length: 26 * 99 }, (_, i) =>
  `${String.fromCharCode(97 + Math.floor(i / 99))}${(i % 99) + 1}`
);

// 使用済みのプレイヤーIDを取得（playerIds コレクション）
export async function fetchUsedIds() {
  const snap = await getDocsFromServer(collection(db, "playerIds"));
  return new Set(snap.docs.map((d) => d.id));
}

export const firstFreeId = (used) => ALL_PLAYER_IDS.find((id) => !used.has(id)) || null;

// 自分のIDを使用済みとして登録（まだ無ければ）
export async function claimPlayerId(id, uid) {
  try {
    const ref = doc(db, "playerIds", id);
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) await setDoc(ref, { uid, createdAt: new Date().toISOString() });
  } catch {
    // 失敗しても、ログイン側でIDの重複は防がれている
  }
}

export const idToEmail = (id) => `${id}@players.sme-tcg.app`;
export const pinToPassword = (pin) => `sme-${pin}-tcg`;

export function authErrorText(e) {
  const c = e?.code || "";
  if (c === "auth/email-already-in-use") return "そのプレイヤーIDはすでに使われています";
  if (
    c === "auth/invalid-credential" || c === "auth/wrong-password" ||
    c === "auth/user-not-found" || c === "auth/invalid-login-credentials"
  ) return "プレイヤーIDかパスワードが違います";
  if (c === "auth/too-many-requests") return "失敗が続いたため、しばらく待ってからお試しください";
  if (c === "auth/operation-not-allowed") return "ログイン機能がまだ有効になっていません（管理者の設定が必要）";
  if (c === "auth/network-request-failed") return "通信に失敗しました。電波の良い所でお試しください";
  return `エラーが発生しました: ${c || e?.message || "不明"}`;
}

// 試合を見分けるキー
export function gameKey(state, room) {
  if (!state) return null;
  if (room) return `${room}:${state.host || ""}:${state.guest || ""}:${state.gameNo || 0}`;
  if (state.gameId) return state.gameId;
  return `legacy:${state.turnCount || 0}:${String((state.log || [])[0] || "")}`;
}

/* ---- ルームのデータ ---- */
// 新しく作る部屋（デッキ選択待ち）
export function newLobby(host) {
  return {
    host,
    guest: null,
    phase: "lobby",
    ready: {},
    sels: {},
    lobbyIn: { [host]: true },
    gameNo: 0,
    closed: false,
    turn: host,
    turnPhase: "main",
    turnCount: 1,
    skipNext: null,
    winner: null,
    logSeq: 0,
    log: ["ルームを作成しました"],
    players: {},
  };
}

// 対戦後、同じ部屋でデッキ選択待ちに戻す
export function lobbyDoc(d, me) {
  return {
    host: d.host || null,
    guest: d.guest || null,
    phase: "lobby",
    ready: {},
    sels: d.sels || {},
    lobbyIn: { [me]: true },
    gameNo: d.gameNo || 0,
    closed: false,
    turn: d.host || null,
    turnPhase: "main",
    turnCount: 1,
    skipNext: null,
    winner: null,
    logSeq: 0,
    log: ["再戦の準備中"],
    players: {},
  };
}

// 2人の準備が整ったら対戦開始の状態を作る
export function gameDoc(base, sels) {
  const h = base.host;
  const g = base.guest;
  const players = {
    [h]: E.newPlayer(E.buildDeck(sels[h]), sels[h]),
    [g]: E.newPlayer(E.buildDeck(sels[g]), sels[g]),
  };
  E.dealInitialHand(players[h]);
  E.dealInitialHand(players[g]);
  const first = Math.random() < 0.5 ? h : g; // 先攻をランダムに決定
  const s = {
    host: h,
    guest: g,
    phase: "play",
    ready: {},
    sels,
    lobbyIn: {},
    gameNo: (base.gameNo || 0) + 1,
    closed: false,
    turn: first,
    turnPhase: "main", // 先攻1ターン目はドローなし
    turnCount: 1,
    skipNext: null,
    winner: null,
    logSeq: 0,
    log: [E.START_LOG],
    players,
  };
  E.giveSecondBonus(s, first === h ? g : h); // 後攻ボーナス（ゲーム開始時から付く）
  return s;
}
// 前回のログと今回のログを比べて、新しく増えた分だけを返す（古いルーム用）
export function newEntries(prev, cur) {
  const ps = prev.map((x) => JSON.stringify(x));
  const cs = cur.map((x) => JSON.stringify(x));
  for (let k = Math.min(ps.length, cs.length); k > 0; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (ps[ps.length - k + i] !== cs[i]) { ok = false; break; }
    }
    if (ok) return cur.slice(k);
  }
  return [];
}

// ログに通し番号を付ける（新しい行動を確実に見分けるため）
export function stampLog(next, prev) {
  if (!next || !Array.isArray(next.log)) return next;
  let seq = next.logSeq || (prev && prev.logSeq) || 0;
  const log = next.log.map((l) => {
    if (!l || typeof l !== "object" || l.n) return l;
    seq += 1;
    return { ...l, n: seq };
  });
  return { ...next, log, logSeq: seq };
}

// ログの中で一番大きい通し番号
export function maxSeq(log) {
  return (log || []).reduce((m, l) => (l && typeof l === "object" && l.n > m ? l.n : m), 0);
}

// 定期取得した状態が、今の状態より新しいときだけ採用する
export function pickNewer(prev, next) {
  if (!prev) return next;
  const ga = prev.gameNo || 0;
  const gb = next.gameNo || 0;
  if (gb !== ga) return gb > ga ? next : prev;
  const rank = { play: 0, waiting: 0, end: 1, lobby: 2 };
  const ra = rank[prev.phase] || 0;
  const rb = rank[next.phase] || 0;
  if (rb !== ra) return rb > ra ? next : prev;
  if (next.phase === "lobby") return next;
  const a = prev.logSeq || 0;
  const b = next.logSeq || 0;
  if (b < a) return prev;
  if (b === a && prev.phase === next.phase && prev.guest === next.guest && prev.winner === next.winner) {
    return prev;
  }
  return next;
}

// 再生パネルの表示時間（攻撃は長め）
export function replayMs(item) {
  const atk = item.lines.some((t) => /を攻撃|プレイヤーに\d+ダメージ/.test(t));
  const base = atk ? 3600 : 2600;
  return Math.min(atk ? 5500 : 4200, base + item.changes.length * 300);
}

// 相手の直前ターンの行動（行った順）
export function lastOppActions(log, myId) {
  const arr = log || [];
  const out = [];
  let i = arr.length - 1;
  while (i >= 0 && !(arr[i] && typeof arr[i] === "object" && arr[i].by !== myId)) i--;
  for (; i >= 0; i--) {
    const l = arr[i];
    if (!l || typeof l !== "object" || l.by === myId) break;
    if (!TRIVIAL_LOG.test(l.t)) out.unshift(l.t);
  }
  return out;
}

// 盤面の変化（HP・スタッツ・登場・退場・攻撃）を調べる
export function diffBoards(prevP, curP, myId, oppId, lines) {
  const out = [];
  for (const [pid, side] of [[oppId, "opp"], [myId, "me"]]) {
    const a = prevP?.[pid], b = curP?.[pid];
    if (!a || !b) continue;
    if (a.hp !== b.hp) out.push({ side, kind: "hp", before: a.hp, after: b.hp });
    const af = a.field || [], bf = b.field || [];
    af.forEach((u) => {
      const n = bf.find((x) => x.uid === u.uid);
      if (!n) {
        out.push({
          side, kind: "gone", uid: u.uid, name: u.name, before: u.stat,
          destroyed: lines.some((t) => t.includes(`${u.name} が破壊`)),
        });
      } else {
        const acted = !u.attacked && n.attacked;
        if (n.stat !== u.stat || acted) {
          out.push({ side, kind: "unit", uid: u.uid, name: u.name, before: u.stat, after: n.stat, acted });
        }
      }
    });
    bf.forEach((n) => {
      if (!af.some((x) => x.uid === n.uid)) {
        out.push({ side, kind: "new", uid: n.uid, name: n.name, after: n.stat });
      }
    });
  }
  return out;
}
