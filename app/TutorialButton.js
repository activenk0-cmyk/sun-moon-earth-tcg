"use client";

import { useState } from "react";

/* ============ 図解パーツ ============ */

// ミニカード（数字だけのキャラ）
function Card({ value, tone = "sun", dead, small }) {
  const tones = {
    sun: "border-amber-400 text-amber-200",
    moon: "border-indigo-400 text-indigo-200",
    gray: "border-slate-500 text-slate-300",
    magic: "border-fuchsia-400 text-fuchsia-200",
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

// 図の囲み
function Figure({ children }) {
  return <div className="rounded border border-slate-600 bg-slate-900/60 p-3">{children}</div>;
}

// 図の下のルール説明（箇条書き）
function Rules({ items }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-1.5 leading-relaxed">
          <span className="text-amber-300">●</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// ワンポイント
function Tip({ children }) {
  return (
    <div className="mt-3 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] leading-relaxed text-amber-100">
      💡 {children}
    </div>
  );
}

const Arrow = ({ down }) => <div className="text-center text-slate-500">{down ? "▼" : "▶"}</div>;
const B = ({ children }) => <b className="text-amber-200">{children}</b>;

/* ============ ページ（大カテゴリ3つ × 2ページ） ============ */

const CATEGORIES = [
  {
    name: "基本",
    pages: [
      {
        title: "勝利条件",
        body: (
          <>
            <Figure>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-[11px]"><span>相手</span><span className="text-red-300">HP 0 → あなたの勝ち！</span></div>
                  <HpBar hp={0} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[11px]"><span>自分</span><span>HP 10</span></div>
                  <HpBar hp={10} />
                </div>
              </div>
            </Figure>
            <Rules
              items={[
                <>お互いのプレイヤーHPは<B>10</B>からスタート。<B>相手のHPを0以下にしたら勝ち</B>です。</>,
                <>HPは<B>10を超えて増やせます</B>（生贄などで回復）。上限はありません。</>,
                <><B>山札の最後の1枚を引いた瞬間</B>にも負けになります。山札の残りに注意。</>,
                <>お互いが同時に負け条件を満たした（相打ち）時は、<B>そのターンのプレイヤーの勝ち</B>。</>,
                <>一部のカードには、HP0以外で勝てる<B>特殊勝利</B>の効果もあります。</>,
              ]}
            />
          </>
        ),
      },
      {
        title: "デッキと手札",
        body: (
          <>
            <Figure>
              <div className="grid grid-cols-5 gap-1.5">
                {["1", "2a", "2b", "3a", "3b", "4", "5", "6", "7", "8"].map((s) => (
                  <div key={s} className="flex flex-col items-center gap-0.5">
                    <Card value={s} tone={s === "2b" || s === "3b" || s === "6" ? "magic" : "gray"} small />
                    <div className="text-[9px] text-slate-400">×4</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-center text-sm font-bold text-amber-300">10種 × 4枚 = 40枚</div>
              <div className="mt-1 text-center text-[10px] text-fuchsia-300">■ ピンクの枠はマジックカード</div>
            </Figure>
            <Rules
              items={[
                <>デッキは<B>10個の枠</B>から1種類ずつカードを選ぶだけ。選んだカードが自動で<B>4枚ずつ</B>入り、40枚になります。</>,
                <>枠の数字はそのカードの<B>コスト</B>です。<B>2b・3b・6</B>はマジックカード（使い切りの効果）、それ以外はキャラクター。</>,
                <>陣営（太陽・月・地球・冥王星）は<B>自由に混ぜてOK</B>。迷ったら「おすすめデッキ」から始めましょう。</>,
                <>最初の手札は<B>5枚</B>。引き直し（マリガン）はありません。</>,
                <>手札は<B>最大10枚</B>。いっぱいの時に引いたカードは、そのまま墓地へ行きます。</>,
              ]}
            />
          </>
        ),
      },
    ],
  },
  {
    name: "ターン",
    pages: [
      {
        title: "ターンの流れとコスト",
        body: (
          <>
            <Figure>
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
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px]">
                <span className="mr-1 text-slate-400">コスト 3/10</span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <div key={n} className={`h-3 w-3 rounded-full ${n <= 3 ? "bg-amber-400" : "border border-slate-600"}`} />
                ))}
              </div>
            </Figure>
            <Rules
              items={[
                <><B>ドロー</B>：ターンの最初に山札から1枚引きます。ただし<B>先攻の1ターン目だけは引けません</B>。</>,
                <><B>プレイ</B>：キャラクターの召喚・マジックの使用・攻撃を、<B>好きな順番で</B>行えます。コストが足りる限り何枚でも出せます。</>,
                <><B>生贄</B>：ターンの最後に、手札を1枚生贄にできます（次のページで説明）。終わったら相手のターンへ。</>,
                <>カードを使うには、カード左上の数字ぶんの<B>コスト</B>が必要。コストは<B>1からスタート、最大10</B>まで増えます。</>,
                <>使ったコストは<B>毎ターン全回復</B>します。</>,
                <>自分の場に出せるキャラクターは<B>最大5体</B>までです。</>,
              ]}
            />
          </>
        ),
      },
      {
        title: "生贄（いけにえ）",
        body: (
          <>
            <Figure>
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col items-center">
                  <Card value="6" tone="gray" />
                  <div className="mt-1 text-[9px] text-slate-400">コスト6のカード</div>
                </div>
                <Arrow />
                <div className="space-y-1 text-[12px] font-bold">
                  <div className="rounded bg-amber-400/15 px-2 py-1 text-amber-200">① コスト上限 +1</div>
                  <div className="rounded bg-indigo-400/15 px-2 py-1 text-indigo-200">② カードを1枚引く</div>
                  <div className="rounded bg-emerald-400/15 px-2 py-1 text-emerald-200">③ HP +6</div>
                </div>
              </div>
            </Figure>
            <Rules
              items={[
                <>コストを増やす基本の方法が<B>生贄</B>です。ターンの最後に、<B>手札のカードを1枚</B>選んで生贄にします。</>,
                <>生贄にすると<B>①コスト上限+1 ②1枚ドロー ③そのカードのコストぶんHP回復</B>。重いカードほどHPが大きく回復します。</>,
                <><B>1ターンに1回まで</B>。しなくてもOK（スキップ可）。</>,
                <>生贄にしたカードは「生贄置き場」へ。墓地とは別の場所で、<B>基本的に戻ってきません</B>。</>,
                <>生贄は「破壊」ではないので、<B>破壊された時の効果は発動しません</B>。</>,
                <>コスト上限が<B>10に達したら</B>、それ以上は生贄できなくなります。</>,
              ]}
            />
            <Tip>序盤は毎ターン生贄してコストを伸ばすのが基本。どのカードを手放すかが腕の見せどころです。</Tip>
          </>
        ),
      },
    ],
  },
  {
    name: "バトル",
    pages: [
      {
        title: "戦闘のしくみ",
        body: (
          <>
            <Figure>
              <div className="mb-2 text-center text-[10px] text-slate-400">例：5のキャラで3のキャラを攻撃</div>
              <div className="flex items-center justify-center gap-4">
                <Card value="5" tone="sun" />
                <span className="text-lg">⚔</span>
                <Card value="3" tone="moon" />
              </div>
              <div className="my-1"><Arrow down /></div>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <Card value="2" tone="sun" />
                  <div className="mt-1 text-[9px] text-slate-400">5−3＝2で生存</div>
                </div>
                <span className="w-5" />
                <div className="flex flex-col items-center">
                  <Card value="0" dead />
                  <div className="mt-1 text-[9px] text-slate-400">3−5＝破壊</div>
                </div>
              </div>
            </Figure>
            <Rules
              items={[
                <>キャラクターの数字は<B>攻撃力と体力を兼ねた1つの値</B>です。</>,
                <>キャラ同士で戦うと、<B>お互いに相手の数字ぶんダメージ</B>を受けます。攻撃した側も無傷ではありません。</>,
                <>減った数字は<B>回復しません</B>。減ったままの数字が、次からの攻撃力になります。</>,
                <>数字が<B>0以下</B>になったキャラクターは破壊されます。</>,
                <><B>相手プレイヤーを攻撃</B>すると、キャラの数字ぶん相手のHPが減ります（この時、攻撃したキャラはダメージを受けません）。</>,
              ]}
            />
          </>
        ),
      },
      {
        title: "攻撃のルール",
        body: (
          <>
            <Figure>
              <div className="text-center">
                <div className="mb-1 text-[10px] text-slate-400">相手の場</div>
                <div className="flex items-end justify-center gap-2">
                  <div className="opacity-40"><Card value="3" tone="moon" small /></div>
                  <div className="flex flex-col items-center">
                    <div className="text-sm">🛡</div>
                    <Card value="4" tone="moon" small />
                  </div>
                  <div className="opacity-40"><Card value="2" tone="moon" small /></div>
                </div>
                <div className="my-1 text-amber-300">▲</div>
                <div className="text-[10px] text-slate-300">ディフェンダー（🛡）がいると、そこしか狙えない</div>
              </div>
            </Figure>
            <Rules
              items={[
                <>各キャラクターは<B>1ターンに1回</B>攻撃できます。攻撃先は相手のキャラクターか相手プレイヤーを選べます。</>,
                <>召喚したターンは攻撃できません（<B>召喚酔い</B>）。ただし召喚時に<B>+4コスト追加</B>で払えば、そのターンからすぐ攻撃できます。</>,
                <>「スピードアタッカー」を持つキャラは、追加コストなしで召喚したターンから攻撃できます。</>,
                <>相手の場に<B>ディフェンダー</B>がいると、<B>ディフェンダーにしか攻撃できません</B>（他のキャラもプレイヤーも狙えない）。</>,
                <>「攻撃時」の効果は、<B>攻撃を宣言した時</B>（戦闘の前）に発動します。</>,
              ]}
            />
            <Tip>カードの効果はカードをタップすると確認できます。まずはCPU対戦で試してみましょう！</Tip>
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
  const go = (i) => {
    setPage(i);
    const el = document.getElementById("sme-tutorial-body");
    if (el) el.scrollTop = 0;
  };
  const goCat = (ci) => go(PAGES.findIndex((x) => x.ci === ci));

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
            className="sme-panel relative flex max-h-[90vh] w-full max-w-sm flex-col p-4 text-left"
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
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-bold text-slate-100">{p.title}</div>
              <div className="flex gap-1">
                {CATEGORIES[p.ci].pages.map((_, i) => (
                  <div key={i} className={`h-2 w-2 rounded-full ${i === p.pi ? "bg-amber-400" : "bg-slate-600"}`} />
                ))}
              </div>
            </div>

            {/* 本文（図解＋説明）。長い時はここだけスクロール */}
            <div id="sme-tutorial-body" className="flex-1 overflow-y-auto pr-1 text-xs text-slate-200">
              {p.body}
            </div>

            {/* ページ送り */}
            <div className="mt-4 flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => go(page - 1)}
                className="sme-btn sme-btn-ghost sme-btn-sm disabled:opacity-30"
              >
                ◀ 前へ
              </button>
              {page < last ? (
                <button onClick={() => go(page + 1)} className="sme-btn sme-btn-moon sme-btn-sm">
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
