"use client";
import { useState } from "react";
import {
  RANKS, WIN_POINTS, BONUS_FROM_STREAK, BONUS_POINTS,
  fmt, getRank, getNextRank, pointsToNext, rankProgress, rankIndex,
} from "../lib/rank";

/* ============================================================
   ランクバッジ（タップでランク表を開く）
   props:
     points  … 現在のポイント（null なら読み込み中）
     streak  … 現在のランク戦連勝数
     compact … true なら小さめ表示
     mini    … true ならさらに小さい1行表示（TOP画面用）
   ============================================================ */
export default function RankBadge({ points, streak = 0, compact = false, mini = false }) {
  const [open, setOpen] = useState(false);

  if (points == null) {
    return (
      <div className={`sme-panel ${mini ? "p-1.5" : "p-3"} text-xs text-slate-400 animate-pulse w-full text-center`}>
        ランク情報を読み込み中...
      </div>
    );
  }

  const r = getRank(points);
  const next = getNextRank(points);
  const remain = pointsToNext(points);
  const prog = rankProgress(points);

  if (mini) {
    return (
      <>
        <style>{BADGE_CSS}</style>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rb-card w-full text-left px-2.5 py-1.5"
          style={{ borderColor: r.color }}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold" style={{ color: r.color }}>{r.icon} {r.name}</span>
            <span className="font-bold tabular-nums text-slate-100">{fmt(points)} pt</span>
            <span className="flex-1 rb-bar">
              <span className="rb-bar-fill block" style={{ width: `${Math.round(prog * 100)}%`, background: r.color }} />
            </span>
            {streak > 0 && <span className="text-amber-300 tabular-nums">🔥{streak}</span>}
          </div>
        </button>
        {open && <RankTableModal points={points} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <style>{BADGE_CSS}</style>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rb-card w-full text-left ${compact ? "p-2" : "p-3"}`}
        style={{ borderColor: r.color }}
      >
        <div className="flex items-center gap-3">
          <div className="rb-icon" style={{ color: r.color, borderColor: r.color }}>
            {r.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold" style={{ color: r.color }}>{r.name}</span>
              <span className="font-bold tabular-nums text-slate-100">{fmt(points)} pt</span>
            </div>
            <div className="rb-bar mt-1">
              <div className="rb-bar-fill" style={{ width: `${Math.round(prog * 100)}%`, background: r.color }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>{streak > 0 ? `🔥 ${streak}連勝中` : "ランク表を見る ›"}</span>
              <span className="tabular-nums">
                {next ? `${next.name}まであと ${fmt(remain)}` : "最高ランク"}
              </span>
            </div>
          </div>
        </div>
      </button>

      {open && <RankTableModal points={points} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---- ランク表モーダル ---- */
export function RankTableModal({ points, onClose }) {
  const curIdx = rankIndex(points);
  // 上位ランクから並べる
  const rows = RANKS.map((r, i) => ({ r, i, upper: i < RANKS.length - 1 ? RANKS[i + 1].min - 1 : null })).reverse();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50"
    >
      <style>{BADGE_CSS}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="sme-panel w-full max-w-md p-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="sme-heading text-lg mb-1 text-center">ランク表</div>
        <div className="text-xs text-slate-400 text-center mb-3">
          現在 <span className="font-bold text-slate-100 tabular-nums">{fmt(points)} pt</span>
          （{getRank(points).name}）
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="w-4"></th>
              <th className="text-left py-1">ランク</th>
              <th className="text-right py-1">ポイント</th>
              <th className="text-right py-1">勝ち</th>
              <th className="text-right py-1">負け</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i, upper }) => {
              const me = i === curIdx;
              return (
                <tr
                  key={r.key}
                  className={`border-b border-slate-800 ${me ? "rb-row-me" : ""}`}
                  style={me ? { background: `${r.color}22` } : undefined}
                >
                  <td className="text-center font-bold" style={{ color: r.color }}>{me ? "▶" : ""}</td>
                  <td className="py-2">
                    <span style={{ color: r.color }} className="font-bold">
                      {r.icon} {r.name}
                    </span>
                    <div className="text-[10px] text-slate-500">
                      {r.floor ? "降格なし" : "降格あり"}
                    </div>
                  </td>
                  <td className="text-right tabular-nums text-slate-200">
                    {fmt(r.min)}〜{upper != null ? fmt(upper) : ""}
                  </td>
                  <td className="text-right tabular-nums text-emerald-300">+{WIN_POINTS}</td>
                  <td className="text-right tabular-nums text-rose-300">−{r.loss}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="text-[11px] text-slate-300 mt-3 space-y-1 leading-relaxed">
          <div>・{BONUS_FROM_STREAK}連勝目以降の勝利は、さらに +{BONUS_POINTS}（負けると連勝リセット）</div>
          <div>・負けの減少量は、そのとき今いるランクで決まります</div>
          <div>・レギュラー・ブロンズ・シルバーは、そのランクの最低ポイントより下がりません</div>
          <div>・ゴールド以上は降格があります（昇格直後でも降格します）</div>
          <div>・リタイアや途中で画面を閉じた場合も負けになります</div>
        </div>

        <div className="text-center mt-4">
          <button onClick={onClose} className="sme-btn sme-btn-ghost sme-btn-sm">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

const BADGE_CSS = `
.rb-card {
  display: block;
  border: 1.5px solid;
  border-radius: 12px;
  background: rgba(15,23,42,0.75);
  transition: transform 0.1s ease;
}
.rb-card:active { transform: scale(0.98); }
.rb-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border: 2px solid;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  background: rgba(2,6,23,0.6);
  box-shadow: 0 0 12px currentColor inset;
}
.rb-bar {
  height: 6px;
  border-radius: 9999px;
  background: rgba(51,65,85,0.7);
  overflow: hidden;
}
.rb-bar-fill {
  height: 100%;
  border-radius: 9999px;
}
.rb-row-me td:first-child { animation: rb-blink 1.2s ease-in-out infinite; }
@keyframes rb-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`;
