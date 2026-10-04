"use client";
import { useEffect, useRef, useState } from "react";
import {
  fmt, getRank, getNextRank, pointsToNext, rankProgress, rankByKey,
} from "../lib/rank";

const COUNT_MS = 1400; // カウントアップの時間
const START_DELAY = 500; // 表示してからカウントを始めるまで

/* ============================================================
   ランク戦のリザルト表示
   props:
     win     … 勝ったかどうか（結果の読み込み前でもタイトルを出すため）
     result  … lib/rank.js の settleRankedMatch が返す result（null なら読み込み中）
     error   … 保存に失敗したときの文言（なければ null）
   ============================================================ */
export default function RankResult({ win, result, error }) {
  const [shown, setShown] = useState(result ? result.before : null);
  const [done, setDone] = useState(false);
  const [overlay, setOverlay] = useState(null); // "promoted" / "demoted" / null
  const startedFor = useRef(null);

  // 結果が届いたらカウントアップ開始
  useEffect(() => {
    if (!result || startedFor.current === result.gameId) return;
    startedFor.current = result.gameId;
    setShown(result.before);
    setDone(false);
    let raf = 0;
    let t0 = 0;
    const from = result.before;
    const to = result.after;
    const tick = (now) => {
      if (!t0) t0 = now;
      const k = Math.min(1, (now - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (k < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
        if (result.promoted) setOverlay("promoted");
        else if (result.demoted) setOverlay("demoted");
      }
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, START_DELAY);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [result]);

  const isWin = result ? result.win : !!win;
  const pts = shown == null ? null : shown;
  const rank = pts == null ? null : getRank(pts);
  const next = pts == null ? null : getNextRank(pts);
  const remain = pts == null ? null : pointsToNext(pts);
  const prog = pts == null ? 0 : rankProgress(pts);
  const delta = result ? result.delta : 0;
  const deltaText = delta > 0 ? `+${fmt(delta)}` : delta < 0 ? `−${fmt(-delta)}` : "±0";

  return (
    <div className="w-full">
      <style>{RESULT_CSS}</style>

      {/* 大きく WIN / LOSE */}
      <div className={`rr-title ${isWin ? "rr-win" : "rr-lose"}`}>{isWin ? "WIN" : "LOSE"}</div>

      <div className="sme-panel p-4 mb-6 text-center">
        <div className="text-xs text-slate-400 mb-2">ランク戦（CPU）</div>

        {error && !result && (
          <div className="text-sm text-rose-300">{error}</div>
        )}

        {!error && !result && (
          <div className="text-sm text-slate-300 animate-pulse">ポイントを計算中...</div>
        )}

        {result && rank && (
          <>
            {/* ランクバッジ */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="rr-badge" style={{ borderColor: rank.color, color: rank.color }}>
                <span className="mr-1">{rank.icon}</span>{rank.name}
              </span>
            </div>

            {/* 3,240 → 3,340（+100） */}
            <div className="flex items-baseline justify-center gap-2 flex-wrap">
              <span className="text-slate-400 text-lg tabular-nums">{fmt(result.before)}</span>
              <span className="text-slate-500">→</span>
              <span className="text-3xl font-bold tabular-nums" style={{ color: rank.color }}>
                {fmt(pts)}
              </span>
              <span className={`text-lg font-bold tabular-nums ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                （{deltaText}）
              </span>
            </div>

            {/* 内訳 */}
            {result.win && result.bonus > 0 && (
              <div className="text-sm text-amber-300 mt-2">
                🔥 連勝ボーナス +{fmt(result.bonus)}（{result.streak}連勝）
              </div>
            )}
            {result.win && result.bonus === 0 && result.streak > 0 && (
              <div className="text-xs text-slate-400 mt-2">{result.streak}連勝中（3連勝目からボーナス）</div>
            )}
            {!result.win && result.loss === 0 && (
              <div className="text-xs text-slate-400 mt-2">このランクではこれ以上下がりません</div>
            )}

            {/* 次のランクまでの進捗バー */}
            <div className="mt-4">
              <div className="rr-bar">
                <div
                  className="rr-bar-fill"
                  style={{ width: `${Math.round(prog * 100)}%`, background: rank.color }}
                />
              </div>
              <div className="text-xs text-slate-300 mt-1 text-right tabular-nums">
                {next ? `${next.name}まであと ${fmt(remain)}` : "最高ランク到達！"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 昇格・降格の全画面演出 */}
      {done && overlay && result && (
        <RankChangeOverlay
          type={overlay}
          rankKey={result.rankAfter}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

/* ---- 昇格・降格の全画面演出 ---- */
function RankChangeOverlay({ type, rankKey, onClose }) {
  const r = rankByKey(rankKey);
  const up = type === "promoted";
  // 一番下に不透明な濃紺を敷き、その上にランク色の光を重ねる（後ろの画面は透けない）
  const bg = up
    ? `radial-gradient(circle at center, ${r.color}40 0%, ${r.color}14 35%, transparent 65%), #020617`
    : "radial-gradient(circle at center, rgba(71,85,105,0.35) 0%, transparent 60%), #020617";
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center text-center p-6 rr-ov"
      style={{ background: bg }}
    >
      <div className={up ? "rr-ov-icon-up" : "rr-ov-icon-down"} style={{ color: r.color }}>
        {r.icon}
      </div>
      <div className="text-sm tracking-[0.3em] text-slate-300 mt-4 mb-2">
        {up ? "RANK UP" : "RANK DOWN"}
      </div>
      <div className={`font-bold ${up ? "rr-ov-text-up" : "rr-ov-text-down"}`} style={{ color: r.color }}>
        {r.name}に{up ? "昇格！" : "降格..."}
      </div>
      <div className="text-xs text-slate-400 mt-10">タップして閉じる</div>
    </div>
  );
}

const RESULT_CSS = `
.rr-title {
  font-size: 4.5rem;
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.08em;
  margin: 0 0 1rem;
  animation: rr-pop 0.5s cubic-bezier(.2,1.6,.4,1) both;
}
.rr-win {
  color: #fde68a;
  text-shadow: 0 0 18px rgba(251,191,36,0.7), 0 0 40px rgba(251,191,36,0.35);
}
.rr-lose {
  color: #94a3b8;
  text-shadow: 0 0 14px rgba(100,116,139,0.6);
}
.rr-badge {
  display: inline-flex;
  align-items: center;
  border: 1.5px solid;
  border-radius: 9999px;
  padding: 2px 12px;
  font-size: 0.85rem;
  font-weight: 700;
  background: rgba(15,23,42,0.6);
}
.rr-bar {
  height: 10px;
  border-radius: 9999px;
  background: rgba(51,65,85,0.7);
  overflow: hidden;
}
.rr-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.08s linear;
}
.rr-ov { animation: rr-fade 0.35s ease-out both; }
.rr-ov-icon-up {
  font-size: 6rem;
  line-height: 1;
  animation: rr-rise 0.9s cubic-bezier(.2,1.4,.4,1) both;
  filter: drop-shadow(0 0 24px currentColor);
}
.rr-ov-icon-down {
  font-size: 5rem;
  line-height: 1;
  opacity: 0.8;
  animation: rr-sink 0.9s ease-out both;
}
.rr-ov-text-up {
  font-size: 2rem;
  animation: rr-pop 0.6s 0.35s cubic-bezier(.2,1.6,.4,1) both;
  text-shadow: 0 0 20px currentColor;
}
.rr-ov-text-down {
  font-size: 1.75rem;
  animation: rr-fade 0.6s 0.35s ease-out both;
}
@keyframes rr-pop {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes rr-fade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes rr-rise {
  0% { transform: translateY(40px) scale(0.5); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes rr-sink {
  0% { transform: translateY(-30px); opacity: 0; }
  100% { transform: translateY(0); opacity: 0.8; }
}
`;
