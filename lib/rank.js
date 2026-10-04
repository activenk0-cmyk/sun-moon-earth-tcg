/* ============================================================
   CPU戦ランク制度（計算ロジックのみ。保存や画面表示は別ファイル）
   ============================================================ */

// 初期ポイント
export const START_POINTS = 1500;

// 勝ったときの基本ポイント（どのランクでも共通）
export const WIN_POINTS = 100;

// 連勝ボーナス：この連勝数「目」以降の勝利に BONUS_POINTS を追加
export const BONUS_FROM_STREAK = 3;
export const BONUS_POINTS = 20;

// ランク一覧（下から順）
// min: このランクになるポイント / loss: このランクで負けたときに減るポイント
// floor: true のランクは、そのランクの min より下がらない（降格なし）
export const RANKS = [
  { key: "regular",     name: "レギュラー",       min: 1500,  loss: 100, floor: true,  icon: "◇", color: "#94a3b8" },
  { key: "bronze",      name: "ブロンズ",         min: 2000,  loss: 110, floor: true,  icon: "◆", color: "#c08457" },
  { key: "silver",      name: "シルバー",         min: 3000,  loss: 120, floor: true,  icon: "◆", color: "#cbd5e1" },
  { key: "gold",        name: "ゴールド",         min: 4000,  loss: 130, floor: false, icon: "★", color: "#facc15" },
  { key: "platinum",    name: "プラチナ",         min: 5000,  loss: 140, floor: false, icon: "★", color: "#5eead4" },
  { key: "diamond",     name: "ダイヤモンド",     min: 7000,  loss: 150, floor: false, icon: "✦", color: "#60a5fa" },
  { key: "master",      name: "マスター",         min: 10000, loss: 160, floor: false, icon: "♛", color: "#c084fc" },
  { key: "grandmaster", name: "グランドマスター", min: 15000, loss: 160, floor: false, icon: "♛", color: "#f472b6" },
];

// 数値を「3,240」の形にする
export function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("ja-JP");
}

// 安全な整数ポイントに直す（不正な値なら初期値）
export function normalizePoints(p) {
  const n = Math.floor(Number(p));
  if (!Number.isFinite(n)) return START_POINTS;
  return Math.max(START_POINTS, n);
}

// ポイントから何番目のランクか（0〜7）
export function rankIndex(points) {
  const p = normalizePoints(points);
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (p >= RANKS[i].min) idx = i;
  }
  return idx;
}

// ポイントからランク情報を返す
export function getRank(points) {
  return RANKS[rankIndex(points)];
}

// 次のランク（グランドマスターなら null）
export function getNextRank(points) {
  const i = rankIndex(points);
  return i < RANKS.length - 1 ? RANKS[i + 1] : null;
}

// 次のランクまでの残りポイント（グランドマスターなら null）
export function pointsToNext(points) {
  const next = getNextRank(points);
  if (!next) return null;
  return Math.max(0, next.min - normalizePoints(points));
}

// 今のランク内での進み具合（0〜1）。グランドマスターは常に 1
export function rankProgress(points) {
  const p = normalizePoints(points);
  const cur = getRank(p);
  const next = getNextRank(p);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (p - cur.min) / (next.min - cur.min)));
}

// 今のランクで負けたときに減るポイント
export function lossAmount(points) {
  return getRank(points).loss;
}

// 負けた後のポイント（下限処理込み）
export function pointsAfterLoss(points) {
  const p = normalizePoints(points);
  const cur = getRank(p);
  let next = p - cur.loss;
  // レギュラー・ブロンズ・シルバーは、そのランクの下限で止まる
  if (cur.floor) next = Math.max(next, cur.min);
  // 全体の下限（レギュラーの1500）
  return Math.max(START_POINTS, next);
}

// 勝った時の増加量。streakBefore はこの試合の前の連勝数
export function winGain(streakBefore) {
  const streakAfter = (Number(streakBefore) || 0) + 1;
  const bonus = streakAfter >= BONUS_FROM_STREAK ? BONUS_POINTS : 0;
  return { base: WIN_POINTS, bonus, total: WIN_POINTS + bonus, streakAfter };
}

// 保存データの形をそろえる
// { points, streak, best, pending: { gameId, prevPoints, prevStreak } | null, last: 直近の結果 | null }
// streak: ランク戦の現在の連勝数 / best: ランク戦の最高連勝数
export function normalizeRankData(d) {
  const src = d && typeof d === "object" ? d : {};
  const pending =
    src.pending && typeof src.pending === "object" && src.pending.gameId
      ? {
          gameId: String(src.pending.gameId),
          prevPoints: normalizePoints(src.pending.prevPoints),
          prevStreak: Math.max(0, Math.floor(Number(src.pending.prevStreak) || 0)),
        }
      : null;
  const streak = Math.max(0, Math.floor(Number(src.streak) || 0));
  return {
    points: normalizePoints(src.points),
    streak,
    best: Math.max(streak, Math.floor(Number(src.best) || 0)),
    pending,
    last: src.last && typeof src.last === "object" ? src.last : null,
  };
}

/* ------------------------------------------------------------
   対戦開始：負け分を先に引き、連勝数もいったん0にしておく
   （ブラウザを閉じて負けから逃げられないようにするため）
   ------------------------------------------------------------ */
export function startRankedMatch(data, gameId) {
  const d = normalizeRankData(data);
  // 同じ試合ですでに開始済みなら何もしない（画面の再読み込み対策）
  if (d.pending && d.pending.gameId === gameId) return d;
  return {
    points: pointsAfterLoss(d.points),
    streak: 0,
    best: d.best,
    pending: { gameId, prevPoints: d.points, prevStreak: d.streak },
    last: d.last,
  };
}

/* ------------------------------------------------------------
   対戦終了：結果を確定する
   勝ち → 開始前のポイントに戻して勝ち分を加算、連勝+1
   負け → 開始時に引いた状態のまま確定（追加ペナルティなし）
   戻り値: { data: 保存する新しいデータ, result: リザルト表示用 }
   ------------------------------------------------------------ */
export function settleRankedMatch(data, gameId, win) {
  const d = normalizeRankData(data);

  // この試合の確定がすでに済んでいる（再読み込みなど）→ 前回の結果をそのまま返す
  if (!d.pending || d.pending.gameId !== gameId) {
    const result = d.last && d.last.gameId === gameId ? d.last : null;
    return { data: d, result };
  }

  const before = d.pending.prevPoints;
  const prevStreak = d.pending.prevStreak;
  let after;
  let streak;
  let base = 0;
  let bonus = 0;
  let loss = 0;

  if (win) {
    const g = winGain(prevStreak);
    after = before + g.total;
    streak = g.streakAfter;
    base = g.base;
    bonus = g.bonus;
  } else {
    after = d.points; // 開始時に引いた値
    streak = 0;
    loss = before - after;
  }

  const rb = rankIndex(before);
  const ra = rankIndex(after);
  const result = {
    gameId,
    win: !!win,
    before,
    after,
    delta: after - before,
    base,
    bonus,
    loss,
    streak,
    rankBefore: RANKS[rb].key,
    rankAfter: RANKS[ra].key,
    promoted: ra > rb,
    demoted: ra < rb,
    at: new Date().toISOString(),
  };

  return {
    data: { points: after, streak, best: Math.max(d.best, streak), pending: null, last: result },
    result,
  };
}

// ランクのキーからランク情報を返す
export function rankByKey(key) {
  return RANKS.find((r) => r.key === key) || RANKS[0];
}
