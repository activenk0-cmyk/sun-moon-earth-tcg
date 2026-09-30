"use client";

import { useState } from "react";

/* ============ 図解パーツ ============ */

// ミニカード（数字だけのキャラ）
function Card({ value, tone = "sun", dead, small }) {
  const tones = {
    sun: "border-amber-400 text-amber-200",
    moon: "border-indigo-400 text-indigo-200",
    gray: "border-slate-500 text-slate-300",
  };
  return (
    <div
      className={`flex items-center justify-center rounded border-2 bg-slate-900 font-bold ${
        small ? "h-10 w-8 text-sm" : "h-14 w-11 text-xl"
      } ${dead ? "border-slate-700 text-slate-600 line-through" : tones[tone]}`}
    >
      {value}
    </div>
  );
}

// HPバー
function HpBar({ hp, max = 10, color = "bg-emerald-400" }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700">
      <div className={`h-full ${color}`} style={{ width: `${(hp / max) * 100}%` }} />
    </div>
  );
}

// 下に置く一言メモ
function Note({ children }) {
  return <div className="mt-4 text-center text-[11px] leading-relaxed text-slate-300">{children}</div>;
}

const Arrow = ({ down }) => <div className="text-center text-slate-500">{down ? "▼" : "▶"}</div>;

/* ============ ページ（大カテゴリ3つ × 2ページ） ============ */

const CATEGORIES = [
  {
    name: "基本",
    pages: [
      {
        title: "HPを0にしたら勝ち",
        body: (
          <>
            <div className="space-y-3 rounded border border-slate-600 bg-slate-900/60 p-3">
              <div>
                <div className="mb-1 flex justify-between text-[11px]"><span>相手</span><span className="text-red-300">HP 0 → 勝ち！</span></div>
                <HpBar hp={0} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px]"><span>自分</span><span>HP 10</span></div>
                <HpBar hp={10} />
              </div>
            </div>
            <Note>HPは10からスタート。<br />山札の最後の1枚を引いても負け。</Note>
          </>
        ),
      },
      {
        title: "デッキは10種 × 4枚",
        body: (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {["1", "2a", "2b", "3a", "3b", "4", "5", "6", "7", "8"].map((s) => (
                <div key={s} className="flex flex-col items-center gap-0.5">
                  <Card value={s.replace(/[ab]/, "")} tone="gray" small />
                  <div className="text-[9px] text-slate-400">×4</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-center text-sm font-bold text-amber-300">= 40枚</div>
            <Note>各枠から1種ずつ選ぶだけ。<br />陣営は自由に混ぜてOK。</Note>
          </>
        ),
      },
    ],
  },
  {
    name: "ターン",
    pages: [
      {
        title: "ターンの流れ",
        body: (
          <>
            <div className="flex items-stretch gap-1 text-center text-[11px]">
              {[
                ["ドロー", "1枚引く"],
                ["プレイ", "召喚・マジック・攻撃"],
                ["生贄", "やらなくてもOK"],
              ].map(([t, d], i) => (
                <div key={t} className="flex flex-1 items-center gap-1">
                  <div className={`flex-1 rounded border p-2 ${i === 2 ? "border-fuchsia-400 bg-fuchsia-400/10" : "border-slate-500 bg-slate-800"}`}>
                    <div className="font-bold text-slate-100">{t}</div>
                    <div className="mt-1 text-[9px] leading-tight text-slate-400">{d}</div>
                  </div>
                  {i < 2 && <Arrow />}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-[11px]">
              <span className="text-slate-400">コスト</span>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div key={n} className={`h-3 w-3 rounded-full ${n <= 3 ? "bg-amber-400" : "border border-slate-600"}`} />
              ))}
            </div>
            <Note>コストは1から始まり、最大10。<br />毎ターン全回復する。</Note>
          </>
        ),
      },
      {
        title: "生贄でパワーアップ",
        body: (
          <>
            <div className="flex items-center justify-center gap-3">
              <div className="flex flex-col items-center">
                <Card value="6" tone="gray" />
                <div className="mt-1 text-[9px] text-slate-400">手札1枚</div>
              </div>
              <Arrow />
              <div className="space-y-1 text-[12px] font-bold">
                <div className="rounded bg-amber-400/15 px-2 py-1 text-amber-200">コスト上限 +1</div>
                <div className="rounded bg-indigo-400/15 px-2 py-1 text-indigo-200">1枚ドロー</div>
                <div className="rounded bg-emerald-400/15 px-2 py-1 text-emerald-200">HP +6</div>
              </div>
            </div>
            <Note>ターンの最後に1回だけ。<br />重いカードほどHPが多く回復する。</Note>
          </>
        ),
      },
    ],
  },
  {
    name: "バトル",
    pages: [
      {
        title: "数字は攻撃力＝体力",
        body: (
          <>
            <div className="rounded border border-slate-600 bg-slate-900/60 p-3">
              <div className="flex items-center justify-center gap-4">
                <Card value="5" tone="sun" />
                <span className="text-lg">⚔</span>
                <Card value="3" tone="moon" />
              </div>
              <div className="my-1"><Arrow down /></div>
              <div className="flex items-center justify-center gap-4">
                <Card value="2" tone="sun" />
                <span className="w-5" />
                <Card value="0" dead />
              </div>
            </div>
            <Note>お互いに相手の数字ぶん減る。<br />減った数字は戻らない。0で破壊。</Note>
          </>
        ),
      },
      {
        title: "攻撃のルール",
        body: (
          <>
            <div className="rounded border border-slate-600 bg-slate-900/60 p-3 text-center">
              <div className="mb-1 text-[10px] text-slate-400">相手の場</div>
              <div className="flex items-end justify-center gap-2">
                <Card value="3" tone="moon" small />
                <div className="flex flex-col items-center">
                  <div className="text-sm">🛡</div>
                  <Card value="4" tone="moon" small />
                </div>
                <Card value="2" tone="moon" small />
              </div>
              <div className="my-1 text-amber-300">▲</div>
              <div className="text-[10px] text-slate-300">ディフェンダーしか狙えない</div>
            </div>
            <Note>出したターンは攻撃できない。<br />+4コスト払えばすぐ攻撃OK。</Note>
          </>
        ),
      },
    ],
  },
];

// 平らなページ一覧にする
const PAGES = CATEGORIES.flatMap((c, ci) => c.pages.map((p, pi) => ({ ...p, ci, pi })));

export default function TutorialButton() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const close = () => setOpen(false);
  const last = PAGES.length - 1;
  const p = PAGES[page];
  const goCat = (ci) => setPage(PAGES.findIndex((x) => x.ci === ci));

  return (
    <>
      <button
        onClick={() => { setPage(0); setOpen(true); }}
        className="sme-btn sme-btn-ghost mt-6 w-full max-w-xs"
      >
        チュートリアル
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
          <div
            className="sme-panel relative w-full max-w-sm p-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 大カテゴリのタブ */}
            <div className="mb-3 flex items-center gap-1">
              {CATEGORIES.map((c, ci) => (
                <button
                  key={c.name}
                  onClick={() => goCat(ci)}
                  className={`flex-1 rounded py-1 text-[11px] font-bold ${
                    ci === p.ci ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              <button onClick={close} className="px-2 text-lg leading-none text-slate-300">×</button>
            </div>

            {/* タイトル＋カテゴリ内の位置（●○） */}
            <div className="mb-4 flex items-center justify-between">
              <div className="text-base font-bold text-slate-100">{p.title}</div>
              <div className="flex gap-1">
                {CATEGORIES[p.ci].pages.map((_, i) => (
                  <div key={i} className={`h-2 w-2 rounded-full ${i === p.pi ? "bg-amber-400" : "bg-slate-600"}`} />
                ))}
              </div>
            </div>

            {/* 本文（図解） */}
            <div className="min-h-[230px] text-xs text-slate-200">{p.body}</div>

            {/* ページ送り */}
            <div className="mt-4 flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="sme-btn sme-btn-ghost sme-btn-sm disabled:opacity-30"
              >
                ◀ 前へ
              </button>
              {page < last ? (
                <button onClick={() => setPage(page + 1)} className="sme-btn sme-btn-moon sme-btn-sm">
                  次へ ▶
                </button>
              ) : (
                <button onClick={close} className="sme-btn sme-btn-sun sme-btn-sm">
                  閉じる
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
