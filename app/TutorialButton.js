"use client";

import { useState } from "react";

/* ============ チュートリアルの中身 ============
   ページを増やしたい時は、この配列に { title, body } を足すだけでOK
================================================ */

function Point({ children }) {
  return <div className="mt-3 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-100">{children}</div>;
}

function List({ items }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="text-amber-300">・</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Mini({ label, value, tone }) {
  const tones = {
    sun: "border-amber-400 text-amber-200",
    moon: "border-indigo-400 text-indigo-200",
    dead: "border-slate-600 text-slate-500 line-through",
  };
  return (
    <div className={`flex h-14 w-12 flex-col items-center justify-center rounded border-2 bg-slate-900 ${tones[tone]}`}>
      <div className="text-[9px]">{label}</div>
      <div className="text-lg font-bold leading-none">{value}</div>
    </div>
  );
}

const PAGES = [
  {
    title: "ゲームの目的",
    body: (
      <>
        <p className="mb-3">2人で対戦するカードバトルです。相手のプレイヤーHPを0にすれば勝ち！</p>
        <List
          items={[
            "お互いのHPは10からスタート",
            "HPが0以下になったプレイヤーの負け",
            "山札の最後の1枚を引いた瞬間にも負けになる",
            "両方が同時に負け条件を満たした時（相打ち）は、そのターンのプレイヤーの勝ち",
            "一部のカードには、特別な勝ち方（特殊勝利）を持つものもある",
          ]}
        />
      </>
    ),
  },
  {
    title: "デッキの作り方",
    body: (
      <>
        <p className="mb-3">デッキは 10個の「枠」 から1種類ずつカードを選んで作ります。</p>
        <div className="mb-3 grid grid-cols-5 gap-1 text-center text-[11px]">
          {["1", "2a", "2b", "3a", "3b", "4", "5", "6", "7", "8"].map((s) => (
            <div
              key={s}
              className={`rounded border py-1 ${
                s === "2b" || s === "3b" || s === "6" ? "border-fuchsia-400 text-fuchsia-200" : "border-slate-500 text-slate-200"
              }`}
            >
              {s}
            </div>
          ))}
        </div>
        <List
          items={[
            "選んだカードは自動で4枚ずつ入り、合計40枚のデッキになる",
            "枠の数字はそのカードのコスト（2b・3b・6 はマジックカードの枠）",
            "陣営を混ぜるのは自由。好きな組み合わせでOK",
            "迷ったら「おすすめデッキ」から始めてみよう",
          ]}
        />
      </>
    ),
  },
  {
    title: "4つの陣営",
    body: (
      <>
        <div className="space-y-2">
          <div className="rounded border border-amber-400/60 p-2">
            <div className="font-bold text-amber-300">☀ 太陽</div>
            <div className="text-[11px]">ストレートな攻撃が得意。どんどん攻めて押し切る。</div>
          </div>
          <div className="rounded border border-indigo-400/60 p-2">
            <div className="font-bold text-indigo-300">☾ 月</div>
            <div className="text-[11px]">守りとコントロールが得意。相手の攻めをしのいで逆転する。</div>
          </div>
          <div className="rounded border border-emerald-400/60 p-2">
            <div className="font-bold text-emerald-300">◈ 地球</div>
            <div className="text-[11px]">コストを伸ばすのが得意。早めに大きなカードを出す。</div>
          </div>
          <div className="rounded border border-fuchsia-400/60 p-2">
            <div className="font-bold text-fuchsia-300">♇ 冥王星</div>
            <div className="text-[11px]">HPの増減そのものがギミック。HPを削って猛攻するか、積み上げて耐え抜くか。</div>
          </div>
        </div>
        <Point>これは得意分野の目安です。どの陣営にも強い攻め札・守り札があります。</Point>
      </>
    ),
  },
  {
    title: "ターンの流れ",
    body: (
      <>
        <div className="mb-3 flex items-center justify-between gap-1 text-center text-[11px]">
          {["ドロー", "プレイ", "生贄", "エンド"].map((t, i) => (
            <div key={t} className="flex flex-1 items-center gap-1">
              <div className="flex-1 rounded border border-slate-500 bg-slate-800 py-2 font-bold">{t}</div>
              {i < 3 && <span className="text-slate-500">▶</span>}
            </div>
          ))}
        </div>
        <List
          items={[
            "ドロー：山札から1枚引く（先攻の1ターン目だけは引かない）",
            "プレイ：キャラの召喚・マジックの使用・攻撃を、好きな順番で何回でも",
            "生贄：手札を1枚生贄にできる（しなくてもOK）",
            "エンド：相手のターンへ",
          ]}
        />
        <Point>最初の手札は5枚。引き直し（マリガン）はありません。手札は最大10枚で、あふれた分は引いた瞬間に墓地へ行きます。</Point>
      </>
    ),
  },
  {
    title: "コスト",
    body: (
      <>
        <p className="mb-3">カードを使うにはコストが必要です。カードの左上の数字がそのカードのコスト。</p>
        <List
          items={[
            "使えるコストは 1 からスタート、最大 10 まで増える",
            "使ったコストは、毎ターン自分のターン開始時に全回復する",
            "コストの上限を増やす主な方法は「生贄」（次のページ）",
            "地球のカードなど、効果でコストを増やせるカードもある",
          ]}
        />
        <Point>コスト上限が10に達したら、それ以上は増えません（生贄もできなくなります）。</Point>
      </>
    ),
  },
  {
    title: "生贄（いけにえ）",
    body: (
      <>
        <p className="mb-3">ターンの最後に、手札のカードを1枚「生贄」にできます。これがこのゲームの一番のポイント！</p>
        <div className="mb-3 rounded border border-slate-600 bg-slate-900/60 p-2 text-[11px]">
          <div className="mb-1 font-bold text-slate-100">生贄にすると…</div>
          <div>① コスト上限が +1</div>
          <div>② カードを1枚引く</div>
          <div>③ 生贄にしたカードのコストぶん、自分のHPが回復</div>
        </div>
        <List
          items={[
            "1ターンに1回まで。スキップしてもOK",
            "生贄にしたカードは「生贄置き場」へ（墓地とは別で、基本的に戻らない）",
            "生贄は「破壊」ではないので、破壊された時の効果は発動しない",
          ]}
        />
        <Point>例：コスト6のカードを生贄にすると、コスト上限+1・1ドロー・HP+6。重いカードを生贄にするほどHPが大きく回復します。</Point>
      </>
    ),
  },
  {
    title: "キャラクターと戦闘",
    body: (
      <>
        <p className="mb-3">キャラクターの数字は「攻撃力」と「体力」を兼ねた1つの値です。</p>
        <div className="mb-3 rounded border border-slate-600 bg-slate-900/60 p-3">
          <div className="mb-2 text-[11px] text-slate-400">例：5 のキャラで 3 のキャラを攻撃</div>
          <div className="flex items-center justify-center gap-3">
            <Mini label="攻撃側" value="5" tone="sun" />
            <span className="text-slate-400">⚔</span>
            <Mini label="防御側" value="3" tone="moon" />
          </div>
          <div className="my-2 text-center text-slate-500">▼ お互いに相手の数値ぶんダメージ</div>
          <div className="flex items-center justify-center gap-3">
            <Mini label="攻撃側" value="2" tone="sun" />
            <span className="w-4" />
            <Mini label="防御側" value="0" tone="dead" />
          </div>
        </div>
        <List
          items={[
            "攻撃すると、攻撃した側も相手の数値ぶんダメージを受ける",
            "減った数値は回復しない。減った数値がそのまま次の攻撃力になる",
            "数値が0以下になったキャラは破壊される",
            "プレイヤーを攻撃すると、キャラの数値ぶん相手のHPが減る",
          ]}
        />
      </>
    ),
  },
  {
    title: "攻撃のルール",
    body: (
      <>
        <List
          items={[
            "キャラは1ターンに1回まで攻撃できる",
            "召喚したターンは攻撃できない（召喚酔い）",
            "ただし召喚する時に +4コスト 追加で払えば、そのターンからすぐ攻撃できる",
            "自分の場に出せるキャラは最大5体まで",
          ]}
        />
        <div className="mt-3 rounded border border-indigo-400/60 bg-indigo-400/10 p-2 text-[11px]">
          <div className="mb-1 font-bold text-indigo-200">🛡 ディフェンダーがいる時</div>
          相手の場にディフェンダーがいたら、ディフェンダーにしか攻撃できません。他のキャラもプレイヤーも狙えなくなります。
        </div>
        <Point>ディフェンダーがいなければ、相手のキャラ・プレイヤーのどちらでも自由に攻撃できます。</Point>
      </>
    ),
  },
  {
    title: "キーワード能力",
    body: (
      <div className="space-y-2 text-[11px]">
        {[
          ["ディフェンダー", "相手はこのキャラにしか攻撃できなくなる"],
          ["スピードアタッカー", "召喚したターンから攻撃できる（+4コスト不要）"],
          ["ラッシュ", "召喚したターンから相手キャラにだけ攻撃できる（プレイヤーは不可）"],
          ["召喚時", "場に出た時に効果が発動"],
          ["攻撃時", "攻撃を宣言した時（戦闘の前）に効果が発動"],
          ["破壊された時", "破壊された時に効果が発動（生贄やバウンスでは発動しない）"],
        ].map(([k, v]) => (
          <div key={k} className="rounded border border-slate-600 bg-slate-900/60 p-2">
            <div className="font-bold text-amber-300">{k}</div>
            <div>{v}</div>
          </div>
        ))}
        <p className="pt-1 text-slate-400">その他の効果は、カードをタップして効果テキストを確認してください。</p>
      </div>
    ),
  },
  {
    title: "トークン",
    body: (
      <>
        <p className="mb-3">カードの効果で、場に「トークン」というキャラクターが出ることがあります。</p>
        <List
          items={[
            "トークンにも召喚酔いがある（カードに書かれた特別なルールが優先）",
            "トークンはそれぞれ決まったコストを持つ",
            "手札に戻されたトークンは、そのコストで使えるカードとして手札に残る",
            "手札がいっぱいで戻れない時は、トークンは破壊される（破壊時効果は発動しない）",
          ]}
        />
      </>
    ),
  },
  {
    title: "さあ、遊んでみよう！",
    body: (
      <>
        <p className="mb-3">ルールはここまで！ まずはCPU対戦で一度遊んでみるのがおすすめです。</p>
        <List
          items={[
            "CPU対戦：ひとりでじっくり練習できる",
            "ルームマッチ：4文字のルームIDを友達に伝えて対戦",
            "迷ったら「おすすめデッキ」を使ってみよう",
          ]}
        />
        <Point>コツ：序盤は毎ターン生贄をしてコストを伸ばしつつ、HPも回復させるのが基本。いつ生贄をやめて攻めに回るかが勝負の分かれ目です。</Point>
      </>
    ),
  },
];

export default function TutorialButton() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const close = () => setOpen(false);
  const last = PAGES.length - 1;
  const p = PAGES[page];

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
            className="sme-panel relative flex max-h-[85vh] w-full max-w-md flex-col p-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="mb-2 flex items-center justify-between">
              <div className="sme-label">
                チュートリアル {page + 1} / {PAGES.length}
              </div>
              <button onClick={close} className="px-2 text-lg leading-none text-slate-300">
                ×
              </button>
            </div>

            {/* 目次（ページ番号の丸） */}
            <div className="mb-3 flex flex-wrap gap-1">
              {PAGES.map((pg, i) => (
                <button
                  key={pg.title}
                  onClick={() => setPage(i)}
                  title={pg.title}
                  className={`h-6 w-6 rounded-full text-[10px] font-bold ${
                    i === page ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* 本文 */}
            <div className="mb-2 text-base font-bold text-slate-100">{p.title}</div>
            <div className="flex-1 overflow-y-auto pr-1 text-xs leading-relaxed text-slate-200">{p.body}</div>

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
