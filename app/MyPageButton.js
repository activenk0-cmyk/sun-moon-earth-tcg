"use client";

import { useState } from "react";
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "../lib/firebase";
import { FACTION_LABEL, FACTION_COLOR } from "../lib/cards";
import { summarizeStats } from "../lib/statsStore";

/* ============================================================
   マイページ（ボタンを押すと開く）
   props:
     uid       … ログイン中のアカウントの内部ID
     nickname  … ニックネーム
     playerId  … プレイヤーID（a1 など）
     rankData  … ランク戦のデータ（現在の連勝・最高連勝）
     streaks   … ルームマッチなどの連勝記録
   ============================================================ */

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function MyPageButton({ uid, nickname, playerId, rankData, streaks }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [stats, setStats] = useState(null);

  async function openPage() {
    setOpen(true);
    setErr("");
    if (!uid) return;
    setLoading(true);
    try {
      const snap = await getDocFromServer(doc(db, "players", uid));
      const data = snap.exists() ? snap.data() : {};
      setStats(summarizeStats(data.stats));
    } catch (e) {
      setErr(`読み込みに失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
    } finally {
      setLoading(false);
    }
  }

  const s = stats;
  const cpu = (s && s.modes && s.modes.cpu) || { g: 0, w: 0 };
  const room = (s && s.modes && s.modes.room) || { g: 0, w: 0 };
  const totalSlots = s ? s.factions.reduce((sum, f) => sum + f.n, 0) : 0;
  const topFaction = s && s.factions.length > 0 ? s.factions[0] : null;
  const topCards = s ? s.cards.slice(0, 5) : [];
  // 勝率の高いカード（3試合以上使ったものだけ）
  const bestCards = s
    ? s.cards
        .filter((c) => c.g >= 3)
        .sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g)
        .slice(0, 3)
    : [];

  const rankBest = rankData ? rankData.best || 0 : 0;
  const rankCur = rankData ? rankData.streak || 0 : 0;
  const cpuOldBest = (streaks && streaks.cpu && streaks.cpu.best) || 0;
  const roomCur = (streaks && streaks.room && streaks.room.cur) || 0;
  const roomBest = (streaks && streaks.room && streaks.room.best) || 0;

  return (
    <>
      <button onClick={openPage} className="sme-btn sme-btn-ghost text-sm">
        マイページ
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="sme-panel relative w-full max-w-md max-h-[85vh] overflow-y-auto p-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="sme-label">マイページ</div>
              <button onClick={() => setOpen(false)} className="px-2 text-lg leading-none text-slate-300">
                ×
              </button>
            </div>

            <div className="mb-4">
              <div className="text-base font-bold text-amber-300">{nickname || "（名前なし）"}</div>
              <div className="text-[11px] text-slate-400">ID: {playerId || "―"}</div>
            </div>

            {loading && <p className="text-xs text-slate-400 animate-pulse">記録を読み込み中...</p>}
            {err && <p className="text-xs text-rose-300">{err}</p>}

            {!loading && !err && s && (
              <>
                {/* ===== 戦績 ===== */}
                <Section title="戦績">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="試合数" value={s.games} />
                    <Stat label="勝利数" value={s.wins} />
                    <Stat label="勝率" value={`${pct(s.wins, s.games)}%`} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-slate-300">
                    <Row left="CPU戦" right={`${cpu.g}戦 ${cpu.w}勝（勝率 ${pct(cpu.w, cpu.g)}%）`} />
                    <Row left="ルームマッチ" right={`${room.g}戦 ${room.w}勝（勝率 ${pct(room.w, room.g)}%）`} />
                  </div>
                </Section>

                {/* ===== 連勝記録 ===== */}
                <Section title="連勝記録">
                  <div className="space-y-1 text-xs text-slate-300">
                    <Row left="CPU戦" right={`現在 ${rankCur}連勝 / 最高 ${Math.max(rankBest, cpuOldBest)}連勝`} />
                    <Row left="ルームマッチ" right={`現在 ${roomCur}連勝 / 最高 ${roomBest}連勝`} />
                  </div>
                </Section>

                {s.games === 0 ? (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    まだ記録がありません。ログインした状態で対戦すると、よく使う陣営やカードがここに表示されます。
                  </p>
                ) : (
                  <>
                    {/* ===== 陣営 ===== */}
                    <Section title="よく使う陣営">
                      {topFaction && (
                        <div className="mb-2 text-sm text-slate-100">
                          いちばん使っている陣営：
                          <span className="font-bold text-amber-300">{FACTION_LABEL[topFaction.faction] || topFaction.faction}</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {s.factions.map((f) => (
                          <div key={f.faction}>
                            <div className="flex justify-between text-[11px] text-slate-300">
                              <span>{FACTION_LABEL[f.faction] || f.faction}</span>
                              <span>
                                {pct(f.n, totalSlots)}%（勝率 {pct(f.wn, f.n)}%）
                              </span>
                            </div>
                            <div className="h-2 w-full rounded bg-slate-800">
                              <div
                                className={`h-2 rounded ${FACTION_COLOR[f.faction] || "bg-slate-400"}`}
                                style={{ width: `${pct(f.n, totalSlots)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        対戦で使ったデッキに入っていたカードの割合です。
                      </p>
                    </Section>

                    {/* ===== よく使うカード ===== */}
                    <Section title="よく使うカード">
                      <ol className="space-y-1">
                        {topCards.map((c, i) => (
                          <CardRow key={c.id} rank={i + 1} c={c} />
                        ))}
                      </ol>
                    </Section>

                    {/* ===== 勝率の高いカード ===== */}
                    <Section title="勝率の高いカード">
                      {bestCards.length === 0 ? (
                        <p className="text-[11px] text-slate-400">3試合以上使ったカードが出てくると表示されます。</p>
                      ) : (
                        <ol className="space-y-1">
                          {bestCards.map((c, i) => (
                            <CardRow key={c.id} rank={i + 1} c={c} />
                          ))}
                        </ol>
                      )}
                    </Section>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-bold text-amber-300">■ {title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 py-2">
      <div className="text-lg font-bold text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div className="flex justify-between">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function CardRow({ rank, c }) {
  return (
    <li className="flex items-center gap-2 text-xs text-slate-200">
      <span className="w-4 text-right text-slate-400">{rank}</span>
      <span className={`h-2 w-2 rounded-full ${FACTION_COLOR[c.card.faction] || "bg-slate-400"}`} />
      <span className="flex-1 truncate">{c.card.name}</span>
      <span className="text-[11px] text-slate-400">
        {c.g}戦 / 勝率 {pct(c.w, c.g)}%
      </span>
    </li>
  );
}
