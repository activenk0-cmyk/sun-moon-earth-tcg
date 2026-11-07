"use client";

import { useState, useEffect } from "react";
import { SLOTS, FACTION_LABEL, getCard, typeLabel } from "../lib/cards";
import {
  STARPICK_BATTLES, battleLabel, newRun, loadRun, saveRun, pickCard, afterBattle,
} from "../lib/starpick";
import { recordMatchStats, recordStarpickRun } from "../lib/statsStore";

/* ============================================================
   スターピックの画面（ピック・試合の合間・敗北・完全制覇）
   props:
     uid      … ログイン中のアカウント
     onStart  … 試合を始める（run を渡す。試合の準備は page.js がする）
     onTitle  … タイトルへ戻る
   ============================================================ */

const fxClass = (f) =>
  ["sun", "moon", "earth", "pluto", "mercury", "saturn"].includes(f) ? `fx-${f}` : "fx-none";

const SP_CSS = `
.sp-dot { width: 26px; height: 26px; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; border: 2px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.5); }
.sp-dot.is-win { background: radial-gradient(circle at 35% 30%, #fff6c8, #f2b632 55%, #8a5a06); border-color: #ffe08a; color: #3a2204;
  box-shadow: 0 0 10px rgba(255, 210, 90, 0.7); }
.sp-dot.is-next { border-color: #ffe08a; color: #ffe08a; animation: spPulse 1.4s ease-in-out infinite; }
.sp-dot.is-lose { background: #4a1d26; border-color: #cf7a86; color: #ffc2cc; }
@keyframes spPulse { 0%,100% { box-shadow: 0 0 0 rgba(255,224,138,0); } 50% { box-shadow: 0 0 14px rgba(255,224,138,0.9); } }
.sp-offer { animation: spDeal 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
@keyframes spDeal { 0% { transform: translateY(24px) scale(0.92); opacity: 0; } 100% { transform: none; opacity: 1; } }
.sp-confetti { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 40; }
.sp-confetti i { position: absolute; top: -24px; display: block; width: 9px; height: 15px; border-radius: 2px; opacity: 0.95;
  animation: spFall linear infinite; }
@keyframes spFall {
  0% { transform: translateY(-30px) rotate(0deg); }
  100% { transform: translateY(110vh) rotate(720deg); }
}
.sp-burst { position: fixed; left: 50%; top: 32%; width: 10px; height: 10px; pointer-events: none; z-index: 39; }
.sp-burst b { position: absolute; left: 0; top: 0; width: 6px; height: 6px; border-radius: 9999px; background: #ffe08a;
  box-shadow: 0 0 10px #ffd700; animation: spBurst 1.6s ease-out both; }
@keyframes spBurst { 0% { transform: translate(0,0) scale(1.4); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; } }
.sp-crown { font-size: 64px; animation: spCrown 1.2s cubic-bezier(0.2, 0.9, 0.3, 1.3) both, spFloat 2.6s ease-in-out 1.2s infinite; }
@keyframes spCrown { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes spFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.sp-clear-title { font-family: "Cinzel", "Noto Serif JP", serif; font-size: 40px; font-weight: 900; letter-spacing: 0.08em;
  background: linear-gradient(90deg, #fff6c8, #ffd700, #fff, #ffd700, #fff6c8); background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 18px rgba(255, 215, 0, 0.7));
  animation: smeResult 0.9s cubic-bezier(0.2, 0.9, 0.3, 1.2) both, spShine 2.4s linear 0.9s infinite; }
@keyframes spShine { to { background-position: 200% center; } }
`;

function useSpCss() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("sme-starpick-css")) return;
    const el = document.createElement("style");
    el.id = "sme-starpick-css";
    el.textContent = SP_CSS;
    document.head.appendChild(el);
  }, []);
}

/* ---- 試合が終わった時に呼ぶ（page.js から）----
   進行状況を進めて保存し、マイページ用の記録を送る。同じ試合を2回反映しない */
export function finishStarpickBattle(uid, gameId, win) {
  const run = loadRun(uid);
  if (!run || run.phase !== "battle" || run.gameId !== gameId) return run;
  const next = { ...afterBattle(run, win), gameId: null, lastGameId: gameId };
  saveRun(uid, next);
  recordMatchStats(uid, gameId, "starpick", run.selection, win);
  if (next.phase === "over" || next.phase === "clear") {
    recordStarpickRun(uid, String(run.startedAt), next.wins, next.phase === "clear");
  }
  return next;
}

/* ---- 試合を始める時に呼ぶ（page.js から）---- */
export function markStarpickBattle(uid, gameId) {
  const run = loadRun(uid);
  if (!run) return null;
  const next = { ...run, phase: "battle", gameId };
  saveRun(uid, next);
  return next;
}

/* ============ 本体 ============ */
export default function StarPick({ uid, onStart, onTitle }) {
  useSpCss();
  const [run, setRunState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState(null); // ピック画面で選びかけのカード
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setRunState(loadRun(uid));
    setLoaded(true);
  }, [uid]);

  const setRun = (r) => {
    setRunState(r);
    saveRun(uid, r);
  };

  function startNew() {
    setChosen(null);
    setRun(newRun());
  }

  if (!loaded) return <div className="p-8 text-center sme-label">LOADING...</div>;

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h2 className="sme-heading text-2xl">スターピック</h2>
      <button onClick={onTitle} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto">
        タイトルへ
      </button>
    </div>
  );

  /* ============ はじめての画面 ============ */
  if (!run) {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        {header}
        <div className="sme-panel p-4 text-sm text-slate-200 leading-relaxed mb-6">
          <p className="mb-2">コストの枠ごとに、陣営の違う3枚のカードから1枚を選んでデッキを作ります。</p>
          <p className="mb-2">
            完成したデッキで、CPUと<span className="text-amber-300 font-bold">{STARPICK_BATTLES}連戦</span>
            。1回でも負けたら終了です。
          </p>
          <p>{STARPICK_BATTLES}連勝で<span className="text-amber-300 font-bold">完全制覇</span>！　ランクポイントは変動しません。</p>
        </div>
        <button onClick={startNew} className="sme-btn sme-btn-sun sme-glow text-lg">
          ピックを始める
        </button>
      </main>
    );
  }

  /* ============ ピック ============ */
  if (run.phase === "pick") {
    const slot = SLOTS[run.slotIndex];
    const offer = (run.offers[slot] || []).map(getCard).filter(Boolean);
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto pb-28">
        {header}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="cost-gem"><span>{slot.replace(/[ab]/, "")}</span></span>
            <span className="sme-label">COST {slot}</span>
          </div>
          <span className="text-xs text-slate-400">
            {run.slotIndex + 1} / {SLOTS.length} 枚目
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 mb-4 overflow-hidden">
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${(run.slotIndex / SLOTS.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mb-3">1枚を選んで「このカードにする」を押してください（4枚ずつデッキに入ります）</p>

        <div className="flex flex-col gap-3" key={slot}>
          {offer.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setChosen(c.id)}
              className={`pick-card sp-offer ${fxClass(c.faction)} ${chosen === c.id ? "is-on" : ""}`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] fx-text font-bold">
                  {FACTION_LABEL[c.faction]} / {typeLabel(c)}
                </span>
                {c.stat && <span className="text-[11px] text-slate-300">STAT {c.stat}</span>}
              </div>
              <div className="text-base font-bold my-1">{c.name}</div>
              <div className="text-[12px] text-slate-300 leading-relaxed">{c.text}</div>
            </button>
          ))}
        </div>

        <MiniDeck selection={run.selection} onInfo={setDetail} title="これまでに選んだカード" />

        <div
          className="fixed bottom-0 left-0 right-0 z-20 p-4 sme-panel !rounded-none !border-x-0 !border-b-0"
          style={{ backdropFilter: "none", WebkitBackdropFilter: "none" }}
        >
          <div className="max-w-lg mx-auto">
            <button
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                setRun(pickCard(run, chosen));
                setChosen(null);
                if (typeof window !== "undefined") window.scrollTo(0, 0);
              }}
              className={`sme-btn sme-btn-sun ${chosen ? "sme-glow" : "opacity-50"}`}
            >
              このカードにする
            </button>
          </div>
        </div>
        {detail && <CardModal card={detail} onClose={() => setDetail(null)} />}
      </main>
    );
  }

  const deck = <MiniDeck selection={run.selection} onInfo={setDetail} title="あなたのデッキ" />;
  const modal = detail && <CardModal card={detail} onClose={() => setDetail(null)} />;

  /* ============ 完全制覇 ============ */
  if (run.phase === "clear") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto text-center">
        <Celebration />
        <div className="relative z-50 pt-8">
          <div className="sp-crown">👑</div>
          <div className="sp-clear-title mt-2">PERFECT</div>
          <div className="sme-heading text-2xl mt-2 mb-2">完全制覇！</div>
          <p className="text-sm text-amber-200 mb-5">{STARPICK_BATTLES}連勝おめでとうございます！</p>
          <Progress run={run} />
          <div className="text-left">{deck}</div>
          <div className="flex flex-col gap-2 mt-6">
            <button onClick={startNew} className="sme-btn sme-btn-sun sme-glow">
              新しくピックを始める
            </button>
            <button onClick={onTitle} className="sme-btn sme-btn-ghost">
              タイトルへ戻る
            </button>
          </div>
        </div>
        {modal}
      </main>
    );
  }

  /* ============ 敗北で終了 ============ */
  if (run.phase === "over") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto text-center">
        {header}
        <h1 className="result-title lose my-4">DEFEAT</h1>
        <div className="sme-heading text-lg mb-1">{battleLabel(run.battle)}で敗退</div>
        <p className="text-sm text-slate-300 mb-5">
          記録：<span className="text-amber-300 font-bold text-lg">{run.wins}連勝</span>
        </p>
        <Progress run={run} lost />
        <div className="text-left">{deck}</div>
        <div className="flex flex-col gap-2 mt-6">
          <button onClick={startNew} className="sme-btn sme-btn-sun sme-glow">
            新しくピックを始める
          </button>
          <button onClick={onTitle} className="sme-btn sme-btn-ghost">
            タイトルへ戻る
          </button>
        </div>
        {modal}
      </main>
    );
  }

  /* ============ 次の試合（ready / 中断された battle） ============ */
  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto text-center">
      {header}
      <div className="sme-label mt-4 mb-1">NEXT BATTLE</div>
      <div className="sme-heading text-3xl mb-1">{battleLabel(run.battle)}</div>
      <p className="text-xs text-slate-400 mb-5">
        {run.wins > 0 ? `${run.wins}連勝中！` : "デッキが完成しました"}　1回負けたら終了です
      </p>
      <Progress run={run} />
      {run.phase === "battle" && (
        <div className="sme-panel p-3 mb-4 text-xs text-amber-200">
          前回の試合を再開できなかったため、この戦をもう一度始めます
        </div>
      )}
      <button onClick={() => onStart(run)} className="sme-btn sme-btn-sun sme-glow text-lg mb-6">
        {battleLabel(run.battle)}を始める
      </button>
      <div className="text-left">{deck}</div>
      {modal}
    </main>
  );
}

/* ============ 6戦の進み具合 ============ */
function Progress({ run, lost }) {
  return (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: STARPICK_BATTLES }, (_, i) => {
        const n = i + 1;
        let cls = "";
        if (n <= run.wins) cls = "is-win";
        else if (lost && n === run.battle) cls = "is-lose";
        else if (!lost && run.phase !== "clear" && n === run.battle) cls = "is-next";
        return (
          <span key={n} className={`sp-dot ${cls}`}>
            {n === STARPICK_BATTLES ? "★" : n}
          </span>
        );
      })}
    </div>
  );
}

/* ============ デッキ一覧（タップで効果を表示） ============ */
function MiniDeck({ selection, onInfo, title }) {
  const ids = SLOTS.filter((s) => selection && selection[s]);
  if (!ids.length) return null;
  return (
    <div className="mt-6">
      <div className="sme-label mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {ids.map((s) => {
          const c = getCard(selection[s]);
          if (!c) return null;
          return (
            <button
              key={s}
              onClick={() => onInfo(c)}
              className={`pick-card ${fxClass(c.faction)} !p-1.5 flex items-center gap-1.5`}
            >
              <span className="cost-gem shrink-0"><span>{s.replace(/[ab]/, "")}</span></span>
              <span className="min-w-0">
                <span className="block text-[9px] fx-text font-bold leading-none">{FACTION_LABEL[c.faction]}</span>
                <span className="block text-[11px] font-bold leading-tight truncate">{c.name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============ カードの効果 ============ */
function CardModal({ card: c, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/75 flex items-center justify-center p-6 z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sme-modal ${fxClass(c.faction)} rounded-2xl p-5 max-w-sm w-full text-left`}
      >
        <div className="text-xs mb-1 fx-text font-bold">
          {FACTION_LABEL[c.faction]} / コスト {c.cost} / {typeLabel(c)}
        </div>
        <div className="sme-heading text-xl mb-2">{c.name}</div>
        {c.stat && (
          <div className="mb-3">
            <span className="unit-stat">{c.stat}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate-200">{c.text}</p>
        <button onClick={onClose} className="sme-btn sme-btn-ghost sme-btn-sm mt-5">
          閉じる
        </button>
      </div>
    </div>
  );
}

/* ============ 完全制覇のお祝い（紙吹雪＋光の粒） ============ */
const CONFETTI_COLORS = ["#ffd700", "#ff6b9a", "#6bd5ff", "#7ae8bd", "#c78bff", "#ffffff", "#ffb347"];

function Celebration() {
  const [pieces] = useState(() =>
    Array.from({ length: 48 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 4,
      dur: 3 + Math.random() * 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 6 + Math.random() * 6,
    }))
  );
  const [sparks] = useState(() =>
    Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const r = 120 + Math.random() * 90;
      return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, delay: Math.random() * 0.25 };
    })
  );
  return (
    <>
      <div className="sp-burst">
        {sparks.map((s, i) => (
          <b key={i} style={{ "--dx": s.dx, "--dy": s.dy, animationDelay: `${s.delay}s` }} />
        ))}
      </div>
      <div className="sp-confetti">
        {pieces.map((p, i) => (
          <i
            key={i}
            style={{
              left: `${p.left}%`,
              width: `${p.w}px`,
              background: p.color,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}
