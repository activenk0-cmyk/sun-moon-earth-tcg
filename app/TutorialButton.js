"use client";

// チュートリアル（実践式）
// ① 全体像：本物そっくりの盤面で「どこに何があるか」「1ターンの流れ」を俯瞰する
// ② 実践　：コーチの指示どおりに操作して、1試合を最後まで遊ぶ（操作のたびに「何が変わったか」を表示）
// ③ 詳しいルール：見出し（ひとこと要約）→ タップで詳細、の2段構成
// ※ 本物のエンジン（lib/engine.js）は使わず、このファイルの中だけで動く練習用の盤面

import { useState, useEffect, useRef } from "react";
import { ManaBar, PhaseBar, EmptySlots, PHASE_LABEL } from "./GameParts";

/* ============ 練習用の盤面 ============ */

const unit = (uid, name, stat, faction = "sun") => ({ uid, name, stat, base: stat, faction, sick: false, attacked: false });
const card = (uid, name, cost, faction = "sun") => ({ uid, name, cost, stat: cost, faction });

function initialBoard() {
  return {
    turn: "me",
    turnCount: 1,
    phase: "draw",
    me: {
      hp: 10, cost: 2, maxCost: 2, deck: 20, sac: 0, sacrificed: false,
      hand: [card("h1", "騎士見習い", 2), card("h2", "大剣士", 5), card("h3", "魔導士", 4)],
      field: [unit("u1", "戦士", 3), unit("u2", "弓兵", 2)],
      pile: [card("h4", "槍兵", 1), card("h5", "見張り番", 3), card("h6", "斥候", 2), card("h7", "司祭", 4)],
    },
    opp: {
      hp: 5, cost: 3, maxCost: 3, deck: 18, sac: 2, hand: 4,
      field: [unit("o1", "スライム", 2, "moon")],
    },
  };
}

const clone = (b) => JSON.parse(JSON.stringify(b));

// 自分がカードを1枚引く
function drawOne(me) {
  const c = me.pile.shift();
  if (c) me.hand.push(c);
  me.deck -= 1;
}

/* ---- 操作（どれも新しい盤面を返す） ---- */
const ACT = {
  draw(b) {
    const n = clone(b);
    drawOne(n.me);
    n.phase = "main";
    return n;
  },
  play(b, uid) {
    const n = clone(b);
    const i = n.me.hand.findIndex((h) => h.uid === uid);
    const c = n.me.hand[i];
    n.me.hand.splice(i, 1);
    n.me.cost -= c.cost;
    n.me.field.push({ ...unit(c.uid, c.name, c.stat, c.faction), sick: true });
    return n;
  },
  attack(b, uid, targetUid) {
    const n = clone(b);
    const a = n.me.field.find((u) => u.uid === uid);
    a.attacked = true;
    if (targetUid === "face") {
      n.opp.hp -= a.stat;
    } else {
      const t = n.opp.field.find((u) => u.uid === targetUid);
      const as = a.stat;
      a.stat -= t.stat;
      t.stat -= as;
      n.me.field = n.me.field.filter((u) => u.stat > 0);
      n.opp.field = n.opp.field.filter((u) => u.stat > 0);
    }
    return n;
  },
  toSac(b) {
    return { ...clone(b), phase: "sacrifice" };
  },
  sac(b, uid) {
    const n = clone(b);
    const i = n.me.hand.findIndex((h) => h.uid === uid);
    const c = n.me.hand[i];
    n.me.hand.splice(i, 1);
    n.me.sac += 1;
    n.me.maxCost += 1;
    n.me.hp += c.cost;
    n.me.sacrificed = true;
    drawOne(n.me);
    return n;
  },
};

// 相手のターン（自動で進む）：[待ち時間, 盤面の変化, コーチの一言]
const OPP_TURN = [
  [700, (n) => { n.turn = "opp"; n.phase = "draw"; n.opp.hand += 1; n.opp.deck -= 1; n.opp.cost = n.opp.maxCost; },
    "相手のターン。①ドロー：相手が1枚引いた"],
  [1300, (n) => { n.phase = "main"; n.opp.hand -= 1; n.opp.cost -= 3; n.opp.field.push({ ...unit("o2", "ゴブリン", 3, "moon"), sick: true }); },
    "②メイン：相手がゴブリン（3）を召喚"],
  [1300, (n) => { n.phase = "sacrifice"; n.opp.sac += 1; n.opp.deck -= 1; n.opp.maxCost += 1; n.opp.hp += 2; },
    "③生贄：相手がコスト2のカードを生贄に → 相手のHPが2回復"],
  [1400, (n) => {
    n.turn = "me"; n.phase = "draw"; n.turnCount = 2;
    n.me.cost = n.me.maxCost; n.me.sacrificed = false;
    n.me.field.forEach((u) => { u.sick = false; u.attacked = false; });
    n.opp.field.forEach((u) => { u.sick = false; });
  }, "あなたのターンに戻ってきた"],
];

/* ============ 変化の一覧（操作の前と後をくらべる） ============ */
function diff(a, b) {
  const out = []; // { key, text }
  const num = (key, label, x, y) => { if (x !== y) out.push({ key, text: `${label} ${x}→${y}` }); };
  num("oppHp", "相手HP", a.opp.hp, b.opp.hp);
  num("meHp", "自分HP", a.me.hp, b.me.hp);
  if (a.me.cost !== b.me.cost || a.me.maxCost !== b.me.maxCost) {
    out.push({ key: "meCost", text: `コスト ${a.me.cost}/${a.me.maxCost}→${b.me.cost}/${b.me.maxCost}` });
  }
  num("hand", "手札", a.me.hand.length, b.me.hand.length);
  num("meDeck", "山札", a.me.deck, b.me.deck);
  num("meSac", "生贄置き場", a.me.sac, b.me.sac);
  num("oppInfo", "相手の手札", a.opp.hand, b.opp.hand);
  for (const side of ["me", "opp"]) {
    const who = side === "me" ? "" : "相手の";
    for (const u of b[side].field) {
      const p = a[side].field.find((x) => x.uid === u.uid);
      if (!p) out.push({ key: `u:${u.uid}`, text: `${who}${u.name}が場に出た` });
      else if (p.stat !== u.stat) out.push({ key: `u:${u.uid}`, text: `${who}${u.name} ${p.stat}→${u.stat}` });
      else if (p.sick && !u.sick) out.push({ key: `u:${u.uid}`, text: `${who}${u.name}が攻撃できるように` });
    }
    for (const p of a[side].field) {
      if (!b[side].field.find((x) => x.uid === p.uid)) out.push({ key: `u:${p.uid}`, text: `${who}${p.name}が破壊された` });
    }
  }
  return out;
}

/* ============ 手順（コーチ） ============ */
// kind: "next" … 読んで「次へ」 / "action" … 指示どおりに操作する
// focus: 光らせる場所 / result: 操作したあとに出す説明（変化の一覧と一緒に表示）
const B = ({ children }) => <b className="text-amber-200">{children}</b>;

// 1ターンの流れの図（全体像で何度も使う）
function TurnFlow({ now }) {
  const steps = [
    ["draw", "①ドロー", "1枚引く"],
    ["main", "②メイン", "出す・攻撃"],
    ["sacrifice", "③生贄", "コストを増やす"],
  ];
  return (
    <div className="flex items-stretch gap-1 text-center my-2">
      {steps.map(([id, t, d]) => (
        <div key={id} className={`flex-1 rounded-lg border px-1 py-1.5 ${now === id ? "border-amber-300 bg-amber-400/20" : "border-white/15 bg-white/5"}`}>
          <div className="text-[11px] font-bold text-slate-100">{t}</div>
          <div className="text-[9px] text-slate-400 leading-tight">{d}</div>
        </div>
      ))}
      <div className="flex items-center text-[10px] text-slate-400 px-0.5">→相手<br />の番</div>
    </div>
  );
}

const STEPS = [
  /* ---------- ① 全体像 ---------- */
  {
    part: 0, kind: "next", focus: [],
    title: "このチュートリアルの流れ",
    body: (
      <>
        <div className="space-y-1 my-1">
          <div>① <B>全体像</B>：画面の見方と、1ターンの流れ（30秒）</div>
          <div>② <B>実践</B>：指示どおりに操作して、1試合やってみる</div>
          <div>③ <B>詳しいルール</B>：気になった所だけ読めばOK</div>
        </div>
      </>
    ),
  },
  {
    part: 0, kind: "next", focus: ["oppHp"],
    title: "ゴールはひとつ",
    body: <>上の赤い玉が<B>相手のHP</B>。これを<B>0にしたら勝ち</B>です（下の緑の玉が自分のHP）。</>,
  },
  {
    part: 0, kind: "next", focus: ["oppField", "meField"],
    title: "戦うのは「場」のキャラ",
    body: <>上が相手の場、下が自分の場。キャラの丸い数字は<B>攻撃力と体力を兼ねた1つの値</B>です。</>,
  },
  {
    part: 0, kind: "next", focus: ["hand", "meCost"],
    title: "キャラは手札から出す",
    body: <>手札のカード右上の◆が<B>コスト</B>。紫の◆（コスト）を払って場に出します。</>,
  },
  {
    part: 0, kind: "next", focus: ["phase"],
    title: "1ターンはいつもこの3ステップ",
    body: (
      <>
        <TurnFlow />
        自分のターンと相手のターンを<B>交互に繰り返すだけ</B>。全体像はこれで全部です。
      </>
    ),
  },
  {
    part: 0, kind: "next", focus: [], nextLabel: "やってみる ▶",
    title: "では実際にやってみよう",
    body: <>練習なので、相手のHPは<B>5</B>から（本番はお互い10から）。指示された所が光ります。</>,
  },

  /* ---------- ② 実践 ---------- */
  {
    part: 1, kind: "action", focus: ["controls"], flow: "draw",
    title: "①ドロー",
    body: <>ターンの最初は1枚引きます。<B>「カードを引く」</B>をタップ。</>,
    allow: { draw: true },
    result: <>手札が1枚増え、山札が1枚減りました。フェーズは<B>②メイン</B>へ。</>,
  },
  {
    part: 1, kind: "action", focus: ["card:h1"], flow: "main",
    title: "②メイン：キャラを出す",
    body: <>コスト2の<B>「騎士見習い」</B>をタップして場に出そう（今のコストは2）。</>,
    allow: { play: ["h1"] },
    result: (
      <>
        コストを2払って場に出ました。頭の★は<B>召喚酔い</B>：出したターンは攻撃できません。
        <div className="text-[10px] text-slate-400 mt-1">※本番はカードをタップ→「召喚」ボタン</div>
      </>
    ),
  },
  {
    part: 1, kind: "action", focus: ["u:u1", "u:o1"], flow: "main",
    title: "②メイン：キャラで攻撃",
    body: (sel) => sel
      ? <>次に、攻撃する相手の<B>「スライム」（2）</B>をタップ。</>
      : <>前のターンから場にいる<B>「戦士」（3）</B>をタップして選ぼう。</>,
    allow: { select: ["u1"], target: ["o1"] },
    result: (
      <>
        キャラ同士は<B>お互いの数字ぶん削り合い</B>ます。戦士 3−2＝<B>1</B>で生き残り、スライムは 2−3 で0以下→<B>破壊</B>。
        減った数字は回復しません。
      </>
    ),
  },
  {
    part: 1, kind: "action", focus: ["u:u2", "face"], flow: "main",
    title: "②メイン：相手に直接攻撃",
    body: (sel) => sel
      ? <>出てきた<B>「ダイレクト」</B>ボタンをタップ。</>
      : <><B>「弓兵」（2）</B>を選んで、今度は相手プレイヤーを狙おう。</>,
    allow: { select: ["u2"], target: ["face"] },
    result: <>相手HPが<B>2減りました</B>（5→3）。ダイレクトでは攻撃した側はダメージを受けません。</>,
  },
  {
    part: 1, kind: "action", focus: ["controls"], flow: "main",
    title: "②メイン：おしまい",
    body: <>やることは終わったので<B>「メインフェーズ終了」</B>をタップ。</>,
    allow: { toSac: true },
    result: <>フェーズは<B>③生贄</B>へ。</>,
  },
  {
    part: 1, kind: "action", focus: ["card:h2"], flow: "sacrifice",
    title: "③生贄：コストを増やす",
    body: <>今は重くて出せない<B>「大剣士」（5）</B>をタップして生贄にしよう。</>,
    allow: { sac: ["h2"] },
    result: (
      <>
        生贄の効果は3つ：<B>コスト上限+1</B>・<B>1枚引く</B>・<B>そのカードのコストぶんHP回復</B>（+5）。
        1ターンに1回まで。こうしてコストを伸ばしていきます。
      </>
    ),
  },
  {
    part: 1, kind: "action", focus: ["controls"], flow: "sacrifice",
    title: "ターン終了",
    body: <><B>「ターン終了」</B>をタップ。相手のターンが自動で進みます。</>,
    allow: { end: true },
    result: (
      <>
        相手も<B>同じ3ステップ</B>でした。あなたの2ターン目：コストは<B>3/3に全回復</B>（上限は生贄で増えた分）、
        騎士見習いの★も消えて攻撃できます。
      </>
    ),
  },
  {
    part: 1, kind: "action", focus: ["controls"], flow: "draw",
    title: "2ターン目：①ドロー",
    body: <>流れは毎ターン同じ。まずは<B>「カードを引く」</B>。</>,
    allow: { draw: true },
    result: null, // そのまま次へ
  },
  {
    part: 1, kind: "action", focus: ["meField", "face"], flow: "main",
    title: "とどめを刺そう",
    body: (sel, b) => (
      <>
        相手HPは<B>{b.opp.hp}</B>。攻撃できるキャラの数字の合計は 1＋2＋2＝<B>5</B>…ちょうど倒せる！
        {sel ? <>「ダイレクト」をタップ。</> : <>光っているキャラを選んでダイレクトしよう。</>}
      </>
    ),
    allow: { select: ["u1", "u2", "h1"], target: ["face"] },
    done: (b) => b.opp.hp <= 0,
    result: <>相手HPが<B>0</B>になりました。<B>あなたの勝ち！</B></>,
  },
  {
    part: 1, kind: "next", focus: [], nextLabel: "詳しいルールへ ▶",
    title: "🎉 クリア！",
    body: (
      <>
        これで1試合の流れは全部です。
        <TurnFlow />
        あとはカードごとの効果や細かいルールだけ。次の画面で、気になる所だけ読んでください。
      </>
    ),
  },
];

/* ============ ③ 詳しいルール（見出し＝ひとこと要約 → タップで詳細） ============ */
const DETAILS = [
  {
    title: "勝ち負け",
    summary: "相手HP0で勝ち。山札切れでも負け",
    items: [
      <>お互いのHPは<B>10</B>からスタート。HPは10を超えて増やせます（上限なし）。</>,
      <><B>山札の最後の1枚を引いた瞬間</B>にも負けになります。</>,
      <>お互いが同時に負け条件を満たした時は、<B>そのターンのプレイヤーの勝ち</B>。</>,
      <>一部のカードには、HP0以外で勝てる<B>特殊勝利</B>の効果もあります。</>,
    ],
  },
  {
    title: "デッキと手札",
    summary: "10枠から1種類ずつ選ぶ → 各4枚で40枚",
    items: [
      <>デッキは<B>10個の枠</B>から1種類ずつ選ぶだけ。選んだカードが<B>4枚ずつ</B>入り、40枚になります。</>,
      <>枠の数字はそのカードの<B>コスト</B>。キャラクターのほか、使い切りの<B>マジック</B>、リーダーに付ける<B>アビリティ</B>があります。</>,
      <>陣営は<B>自由に混ぜてOK</B>。迷ったら「おすすめデッキ」から。</>,
      <>最初の手札は<B>5枚</B>（引き直しなし）。手札は<B>最大10枚</B>で、あふれた分は墓地へ。</>,
    ],
  },
  {
    title: "先攻・後攻",
    summary: "先攻は1ターン目ドローなし、後攻はボーナスあり",
    items: [
      <>先攻は<B>1ターン目だけドローできません</B>。</>,
      <>後攻には<B>「後攻ボーナス」</B>が付きます：自分のターン終了時、手札からランダムに3枚のコストが-1（2ターンで外れる）。</>,
    ],
  },
  {
    title: "コスト",
    summary: "1から最大10。毎ターン全回復",
    items: [
      <>コストは<B>1</B>から始まり、生贄で<B>最大10</B>まで増えます。</>,
      <>使ったコストは<B>毎ターン全回復</B>。足りる限り何枚でもカードを使えます。</>,
      <>自分の場に出せるキャラは<B>最大5体</B>。</>,
    ],
  },
  {
    title: "生贄",
    summary: "1ターン1回：上限+1・1枚引く・HP回復",
    items: [
      <>ターンの最後に<B>手札を1枚</B>生贄にできます（しなくてもOK）。</>,
      <>効果は<B>コスト上限+1・1枚ドロー・そのカードのコストぶんHP回復</B>。重いカードほど大きく回復。</>,
      <>生贄にしたカードは「生贄置き場」へ（墓地とは別。基本的に戻らない）。</>,
      <>生贄は「破壊」ではないので<B>破壊トリガーは発動しません</B>。上限が10になったら生贄できません。</>,
    ],
  },
  {
    title: "攻撃",
    summary: "1体1ターン1回。出したターンは攻撃できない",
    items: [
      <>各キャラは<B>1ターンに1回</B>攻撃できます。狙えるのは相手のキャラか相手プレイヤー（<B>ダイレクト</B>）。</>,
      <>出したターンは攻撃できません（<B>召喚酔い</B>）。召喚時に<B>+4コスト</B>払えば、そのターンからすぐ攻撃できます。</>,
      <>交戦では<B>お互いに相手の数字ぶん</B>ダメージ。0以下で破壊。減った数字は戻りません。</>,
    ],
  },
  {
    title: "キーワード",
    summary: "守・速・闘・隠 などのマーク",
    items: [
      <><B>守 ディフェンダー</B>：相手の場にいると、<B>ディフェンダーにしか攻撃できない</B>。</>,
      <><B>速 ファストアタック</B>：出したターンから攻撃できる（ダイレクトも可）。</>,
      <><B>闘 ファストファイト</B>：出したターンから相手のキャラに攻撃できる（そのターンはダイレクト不可）。</>,
      <><B>隠 ステルス</B>：相手のキャラから攻撃されない。<B>直✕</B>：ダイレクト不可。</>,
    ],
  },
  {
    title: "効果が発動するタイミング",
    summary: "召喚・攻撃・交戦・破壊トリガーなど",
    items: [
      <><B>召喚トリガー</B>：召喚した時 ／ <B>破壊トリガー</B>：破壊された時 ／ <B>装着トリガー</B>：アビリティを装着した時。</>,
      <><B>攻撃トリガー</B>：攻撃を宣言した時（交戦の前）。</>,
      <><B>交戦トリガー</B>：交戦する直前（攻撃した時・された時の両方）。これで相手がいなくなったら交戦しない。</>,
      <><B>在場効果</B>：場にいる間ずっと有効。同時に発動する効果は<B>ターン主の効果が先</B>。</>,
    ],
  },
  {
    title: "墓地・屍・消滅",
    summary: "屍＝墓地のカードのコスト合計",
    items: [
      <>「<B>屍N</B>」は、自分の墓地にあるカードの元のコストの合計がN以上なら発動。今の屍は「墓地」の横に表示。</>,
      <>「<B>消滅</B>」したカードは墓地に行かず、破壊トリガーも発動しません。</>,
      <>カードの効果は、カードをタップ（場のキャラは右上の <B>i</B>）でいつでも確認できます。</>,
    ],
  },
];

function DetailsView({ onReplay, onClose }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-10 text-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="sme-heading text-lg">詳しいルール</div>
        <button onClick={onClose} className="px-2 text-xl leading-none text-slate-300">×</button>
      </div>
      <div className="text-[11px] text-slate-400 mb-3">見出しだけ読めば全体がわかります。気になる所をタップ。</div>
      <div className="space-y-1.5">
        {DETAILS.map((d, i) => (
          <div key={d.title} className="sme-panel overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-slate-100">{d.title}</div>
                <div className="text-[11px] text-amber-200/90">{d.summary}</div>
              </div>
              <span className="text-slate-400 text-xs">{open === i ? "▲" : "▼"}</span>
            </button>
            {open === i && (
              <ul className="px-3 pb-3 space-y-1.5 text-xs text-slate-200">
                {d.items.map((t, k) => (
                  <li key={k} className="flex gap-1.5 leading-relaxed">
                    <span className="text-amber-300">●</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onReplay} className="sme-btn sme-btn-ghost sme-btn-sm">もう一度練習</button>
        <button onClick={onClose} className="sme-btn sme-btn-sun sme-btn-sm">閉じる</button>
      </div>
    </div>
  );
}

/* ============ 練習用の盤面の表示（本番の対戦画面と同じ見た目） ============ */

function TutUnit({ u, foe, ready, selected, target, ghost, onTap }) {
  const statCls = u.stat > u.base ? "is-up" : u.stat < u.base ? "is-down" : "";
  let look = "";
  if (selected) look = "is-selected";
  else if (target) look = "is-target";
  else if (ready) look = "is-ready";
  const cls = ["unit", `fx-${u.faction}`, foe ? "is-foe" : "", look, u.attacked ? "is-attacked" : "", u.sick ? "opacity-60 grayscale" : ""]
    .filter(Boolean).join(" ");
  return (
    <div className={`relative ${ghost ? "tut-ghost" : "unit-enter"}`}>
      <button onClick={onTap} className={cls}>
        {u.sick && !ghost && (
          <span className="dizzy" aria-hidden="true"><span>★</span><span>★</span><span>★</span></span>
        )}
        <div className="unit-name">{u.name}</div>
        <div className="flex justify-between items-end mt-1">
          <span key={`s-${u.stat}`} className={`unit-stat ${statCls}`}>{ghost ? 0 : u.stat}</span>
        </div>
      </button>
      {ghost && <div className="tut-ghost-label">破壊</div>}
    </div>
  );
}

function Board({ b, ghosts, z, sel, allow, interactive, onAct }) {
  const isMine = b.turn === "me";
  const ok = (list, id) => interactive && !!list && list.includes(id);
  const canSelect = (u) => ok(allow.select, u.uid) && !u.attacked && !u.sick;
  const faceOk = sel && ok(allow.target, "face");

  return (
    <main className="max-w-lg mx-auto text-sm">
      {/* 相手情報 */}
      <div className={`sme-panel sme-panel-opp !rounded-none !border-x-0 !border-t-0 px-3 py-2 ${z("oppPanel")}`}>
        <div className="flex items-center gap-3">
          <div data-tut="oppHp" className={`rounded-full ${z("oppHp")}`}>
            <div key={`ohp-${b.opp.hp}`} className={`hp-orb opp ${b.opp.hp <= 3 ? "is-danger" : ""}`}>{Math.max(0, b.opp.hp)}</div>
          </div>
          <div data-tut="oppInfo" className={`flex-1 min-w-0 rounded ${z("oppInfo")}`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-rose-200">相手（練習用）</span>
              <span className="text-[11px] font-bold text-indigo-200">コスト {b.opp.cost}/{b.opp.maxCost}</span>
            </div>
            <div className="mt-0.5"><ManaBar cost={b.opp.cost} max={b.opp.maxCost} /></div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              手札 {b.opp.hand} ・ 山 {b.opp.deck} ・ 生贄 {b.opp.sac}
            </div>
          </div>
        </div>
      </div>
      <div className={`turn-strip ${isMine ? "mine" : "theirs"}`}>
        TURN {b.turnCount}｜{isMine ? "あなた" : "相手"}の{PHASE_LABEL[b.phase]}フェーズ
      </div>

      {/* 相手の場 */}
      <div data-tut="oppField" className={`mx-1 mt-1 px-1 py-1 rounded-lg ${z("oppField")}`}>
        <div className="sme-label mb-0.5">相手の場</div>
        <div className="flex gap-1 flex-wrap justify-center">
          {b.opp.field.map((u) => (
            <div key={u.uid} className={`rounded-xl ${z(`u:${u.uid}`)}`}>
              <TutUnit
                u={u} foe
                target={sel && ok(allow.target, u.uid)}
                onTap={() => sel && ok(allow.target, u.uid) && onAct({ type: "attack", uid: sel, target: u.uid })}
              />
            </div>
          ))}
          {ghosts.opp.map((u) => <TutUnit key={`g-${u.uid}`} u={u} foe ghost />)}
          <EmptySlots count={5 - b.opp.field.length - ghosts.opp.length} />
        </div>
      </div>

      {/* ダイレクト */}
      <div data-tut="face" className={`mx-2 my-1 rounded-lg ${z("face")}`}>
        {faceOk ? (
          <button onClick={() => onAct({ type: "attack", uid: sel, target: "face" })} className="sme-btn sme-btn-danger sme-btn-sm sme-glow">
            ⚔ 相手プレイヤーにダイレクト
          </button>
        ) : interactive && allow.target && allow.target.includes("face") ? (
          <div className="sme-panel py-1.5 text-center text-[11px] text-slate-400">キャラを選ぶと、ここに「ダイレクト」ボタンが出ます</div>
        ) : (
          <div className="h-1" />
        )}
      </div>

      {/* 自分の場 */}
      <div data-tut="meField" className={`mx-1 px-1 pt-1 pb-3 rounded-lg ${z("meField")}`}>
        <div className="sme-label mb-0.5">自分の場</div>
        <div className="flex gap-1 flex-wrap justify-center">
          {b.me.field.map((u) => (
            <div key={u.uid} className={`rounded-xl ${z(`u:${u.uid}`)}`}>
              <TutUnit
                u={u}
                ready={canSelect(u)}
                selected={sel === u.uid}
                onTap={() => canSelect(u) && onAct({ type: "select", uid: u.uid })}
              />
            </div>
          ))}
          {ghosts.me.map((u) => <TutUnit key={`g-${u.uid}`} u={u} ghost />)}
          <EmptySlots count={5 - b.me.field.length - ghosts.me.length} />
        </div>
      </div>

      {/* 自分情報 */}
      <div className={`sme-panel sme-panel-me !rounded-none !border-x-0 px-3 py-2 ${z("mePanel")}`}>
        <div className="flex items-center gap-3">
          <div data-tut="meHp" className={`rounded-full ${z("meHp")}`}>
            <div key={`mhp-${b.me.hp}`} className="hp-orb me">{b.me.hp}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-200">あなた</span>
            </div>
            <div data-tut="meCost" className={`mt-0.5 rounded px-0.5 ${z("meCost")}`}>
              <div className="text-[11px] font-bold text-indigo-200">コスト {b.me.cost}/{b.me.maxCost}</div>
              <ManaBar cost={b.me.cost} max={b.me.maxCost} />
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              <span data-tut="meDeck" className={`rounded px-0.5 ${z("meDeck")}`}>山 {b.me.deck}</span> ・{" "}
              <span data-tut="meSac" className={`rounded px-0.5 ${z("meSac")}`}>生贄 {b.me.sac}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 手札 */}
      <div data-tut="hand" className={`mx-1 px-1 pt-1 rounded-lg ${z("hand")}`}>
        <div className="sme-label">手札 ({b.me.hand.length})</div>
        <div className="flex gap-2 overflow-x-auto pt-2 pb-2 px-1">
          {b.me.hand.map((h) => {
            const canPlay = ok(allow.play, h.uid) && b.phase === "main" && h.cost <= b.me.cost;
            const canSac = ok(allow.sac, h.uid) && b.phase === "sacrifice";
            const look = canPlay || canSac ? "is-playable" : "is-dim";
            return (
              <div key={h.uid} data-tut={`card:${h.uid}`} className={`hand-enter shrink-0 rounded-xl ${z(`card:${h.uid}`)}`}>
                <button
                  onClick={() => (canPlay ? onAct({ type: "play", uid: h.uid }) : canSac && onAct({ type: "sac", uid: h.uid }))}
                  className={`hand-card fx-${h.faction} ${look}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-bold fx-text">練習</span>
                    <span className="cost-gem"><span>{h.cost}</span></span>
                  </div>
                  <div className="text-[11px] font-bold leading-tight mt-1 text-white">{h.name}</div>
                  <div className="mt-1"><span className="unit-stat">{h.stat}</span></div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 操作 */}
      <div data-tut="controls" className={`mx-1 px-2 pb-2 pt-1 rounded-lg ${z("controls")}`}>
        <div data-tut="phase" className={`rounded-lg ${z("phase")}`}>
          <PhaseBar phase={b.phase} mine={isMine} />
        </div>
        {!isMine && (
          <div className="sme-panel py-2 px-3 text-xs text-center text-slate-300 animate-pulse">相手のターン中…</div>
        )}
        {isMine && b.phase === "draw" && (
          <button
            disabled={!interactive || !allow.draw}
            onClick={() => onAct({ type: "draw" })}
            className={`sme-btn sme-btn-sun !py-2.5 ${interactive && allow.draw ? "sme-glow" : "opacity-60"}`}
          >
            カードを引く（山札 {b.me.deck}枚）
          </button>
        )}
        {isMine && b.phase === "main" && (
          <button
            disabled={!interactive || !allow.toSac}
            onClick={() => onAct({ type: "toSac" })}
            className={`sme-btn sme-btn-sun !py-2.5 ${interactive && allow.toSac ? "sme-glow" : "opacity-60"}`}
          >
            メインフェーズ終了 → 生贄フェーズへ
          </button>
        )}
        {isMine && b.phase === "sacrifice" && (
          <>
            <div className="text-[11px] text-slate-400 mb-1 text-center">
              {b.me.sacrificed ? "このターンは生贄済みです" : "手札をタップして生贄にできます（任意・1回まで）"}
            </div>
            <button
              disabled={!interactive || !allow.end}
              onClick={() => onAct({ type: "end" })}
              className={`sme-btn sme-btn-moon !py-2.5 ${interactive && allow.end ? "sme-glow" : "opacity-60"}`}
            >
              {b.me.sacrificed ? "ターン終了" : "生贄せずにターン終了"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

/* ============ コーチ（画面下の説明） ============ */
const PARTS = ["全体像", "実践", "詳しいルール"];

function Coach({ step, idx, sel, b, changes, oppMsg, showResult, onNext, onSkip, onClose }) {
  const body = typeof step.body === "function" ? step.body(sel, b) : step.body;
  const practiceSteps = STEPS.filter((s) => s.part === step.part);
  const pos = practiceSteps.indexOf(step) + 1;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[55] pointer-events-none">
      <div className="max-w-lg mx-auto p-2 pointer-events-auto">
        <div className="tut-coach rounded-2xl p-3 text-xs text-slate-200">
          {/* 今どこにいるか（チュートリアル全体の地図） */}
          <div className="flex items-center gap-1 mb-2">
            {PARTS.map((p, i) => (
              <div
                key={p}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  i === step.part ? "bg-amber-400 text-slate-900 border-amber-300 font-bold" : i < step.part ? "border-amber-400/50 text-amber-200" : "border-white/20 text-slate-400"
                }`}
              >
                {i + 1}.{p}
              </div>
            ))}
            <span className="flex-1" />
            <span className="text-[10px] text-slate-400">{pos}/{practiceSteps.length}</span>
            <button onClick={onClose} className="pl-2 text-lg leading-none text-slate-300">×</button>
          </div>

          {/* 相手のターン中 */}
          {oppMsg ? (
            <>
              <div className="text-sm font-bold text-indigo-200 mb-1">相手のターン</div>
              {step.flow && <TurnFlow now={b.phase} />}
              <div className="leading-relaxed">{oppMsg}</div>
            </>
          ) : showResult ? (
            <>
              <div className="text-sm font-bold text-emerald-300 mb-1">✔ {step.title}</div>
              {changes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {changes.map((c, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 font-bold">
                      {c.text}
                    </span>
                  ))}
                </div>
              )}
              <div className="leading-relaxed">{step.result}</div>
              <button onClick={onNext} className="sme-btn sme-btn-moon sme-btn-sm mt-2">次へ ▶</button>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-amber-200 mb-1">{step.title}</div>
              {step.flow && <TurnFlow now={step.flow} />}
              <div className="leading-relaxed">{body}</div>
              {/* とどめの途中経過 */}
              {step.kind === "action" && changes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {changes.map((c, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 font-bold">
                      {c.text}
                    </span>
                  ))}
                </div>
              )}
              {step.kind === "next" && (
                <div className="flex gap-2 mt-2">
                  {idx === 0 && (
                    <button onClick={onSkip} className="sme-btn sme-btn-ghost sme-btn-sm">ルールだけ読む</button>
                  )}
                  <button onClick={onNext} className="sme-btn sme-btn-sun sme-btn-sm">{step.nextLabel || "次へ ▶"}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ 光らせる・暗くする ============ */
// 大きな枠（container）と、その中の部品（leaf）
const CONTAINERS = {
  oppPanel: (k) => k === "oppHp" || k === "oppInfo",
  oppField: (k) => k.startsWith("u:o"),
  face: () => false,
  meField: (k) => k.startsWith("u:u") || k.startsWith("u:h"),
  mePanel: (k) => ["meHp", "meCost", "meDeck", "meSac"].includes(k),
  hand: (k) => k.startsWith("card:"),
  controls: (k) => k === "phase",
};
const parentOf = (k) => Object.keys(CONTAINERS).find((c) => CONTAINERS[c](k));

function zoneClass(key, focus, flash) {
  if (!focus.length) return "";
  if (focus.includes(key)) return flash ? "tut-flash" : "tut-focus";
  if (CONTAINERS[key]) {
    // 中の部品が光っている枠は暗くしない（部品の方を目立たせる）
    return focus.some((k) => CONTAINERS[key](k)) ? "" : "tut-dim";
  }
  // 部品：同じ枠の中で別の部品が光っていたら、自分は暗くする
  const p = parentOf(key);
  if (p && !focus.includes(p) && focus.some((k) => k !== key && CONTAINERS[p](k))) return "tut-dim";
  return "";
}

/* ============ チュートリアル本体 ============ */
function Tutorial({ onClose }) {
  const [board, setBoard] = useState(initialBoard);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [changes, setChanges] = useState([]); // [{ key, text }]
  const [ghosts, setGhosts] = useState({ me: [], opp: [] }); // 破壊されたキャラ（結果表示の間だけ残す）
  const [oppMsg, setOppMsg] = useState(null);
  const [details, setDetails] = useState(false);
  const before = useRef(null); // 相手ターン前の盤面
  const timers = useRef([]);
  const scrollRef = useRef(null);

  const step = STEPS[idx];
  const interactive = step.kind === "action" && !showResult && !oppMsg;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 光らせる場所（結果表示中は、変わった場所）
  const focus = oppMsg ? [] : showResult ? changes.map((c) => c.key) : step.focus;
  const z = (key) => zoneClass(key, focus, showResult);

  // 光っている場所が画面に入るようにスクロール
  useEffect(() => {
    if (!focus.length || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-tut="${focus[0]}"]`)
      || (focus[0].startsWith("u:") && scrollRef.current.querySelector(`[data-tut="${focus[0].startsWith("u:o") ? "oppField" : "meField"}"]`));
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, showResult]);

  function finishAction(prev, next) {
    setBoard(next);
    setSel(null);
    const ch = diff(prev, next);
    const done = step.done ? step.done(next) : true;
    // 破壊されたキャラは、結果表示の間だけ「破壊」として残す
    const g = { me: [], opp: [] };
    for (const side of ["me", "opp"]) {
      for (const u of prev[side].field) if (!next[side].field.find((x) => x.uid === u.uid)) g[side].push(u);
    }
    if (!done) {
      setChanges(ch);
      return;
    }
    if (!step.result) {
      // 説明なしでそのまま次の手順へ
      setChanges([]);
      setIdx(idx + 1);
      return;
    }
    setGhosts(g);
    setChanges(step.done ? diff(before.current || prev, next) : ch);
    setShowResult(true);
  }

  function onAct(a) {
    if (!interactive) return;
    const al = step.allow || {};
    if (a.type === "select") {
      setSel(sel === a.uid ? null : a.uid);
      return;
    }
    if (a.type === "draw" && al.draw) return finishAction(board, ACT.draw(board));
    if (a.type === "play") return finishAction(board, ACT.play(board, a.uid));
    if (a.type === "attack") {
      if (step.done && !before.current) before.current = board;
      return finishAction(board, ACT.attack(board, a.uid, a.target));
    }
    if (a.type === "toSac" && al.toSac) return finishAction(board, ACT.toSac(board));
    if (a.type === "sac") return finishAction(board, ACT.sac(board, a.uid));
    if (a.type === "end" && al.end) {
      // 相手のターンを自動で進める
      const start = board;
      let cur = board;
      let t = 0;
      setOppMsg("ターン終了…");
      OPP_TURN.forEach(([wait, fn, msg], i) => {
        t += wait;
        timers.current.push(setTimeout(() => {
          cur = clone(cur);
          fn(cur);
          setBoard(cur);
          if (i < OPP_TURN.length - 1) {
            setOppMsg(msg);
          } else {
            setOppMsg(null);
            setGhosts({ me: [], opp: [] });
            setChanges(diff(start, cur).filter((c) => !c.key.startsWith("u:o") && c.key !== "oppInfo"));
            setShowResult(true);
          }
        }, t));
      });
    }
  }

  function next() {
    setShowResult(false);
    setChanges([]);
    setGhosts({ me: [], opp: [] });
    setSel(null);
    before.current = null;
    if (idx + 1 >= STEPS.length) {
      setDetails(true);
      return;
    }
    setIdx(idx + 1);
  }

  function replay() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setBoard(initialBoard());
    setIdx(STEPS.findIndex((s) => s.part === 1)); // 実践の最初から
    setSel(null);
    setShowResult(false);
    setChanges([]);
    setGhosts({ me: [], opp: [] });
    setOppMsg(null);
    before.current = null;
    setDetails(false);
  }

  return (
    <div ref={scrollRef} className="fixed inset-0 z-50 overflow-y-auto sme-tut-root">
      <style>{TUT_CSS}</style>
      {details ? (
        <DetailsView onReplay={replay} onClose={onClose} />
      ) : (
        <>
          <div className="pb-72">
            <Board b={board} ghosts={ghosts} z={z} sel={sel} allow={step.allow || {}} interactive={interactive} onAct={onAct} />
          </div>
          <Coach
            step={step}
            idx={idx}
            sel={sel}
            b={board}
            changes={changes}
            oppMsg={oppMsg}
            showResult={showResult}
            onNext={next}
            onSkip={() => setDetails(true)}
            onClose={onClose}
          />
        </>
      )}
    </div>
  );
}

const TUT_CSS = `
.sme-tut-root { background: radial-gradient(120% 60% at 50% 0%, #1f1a45 0%, #0a0818 70%); }
.tut-dim { opacity: 0.28; filter: grayscale(40%); transition: opacity .25s; }
.tut-focus { position: relative; z-index: 5; box-shadow: 0 0 0 2px #fcd34d, 0 0 18px 4px rgba(252, 211, 77, .55); animation: tutPulse 1.4s ease-in-out infinite; }
.tut-flash { position: relative; z-index: 5; box-shadow: 0 0 0 2px #6ee7b7, 0 0 18px 4px rgba(110, 231, 183, .55); animation: tutPulse 1.1s ease-in-out infinite; }
@keyframes tutPulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
.tut-ghost { opacity: .45; filter: grayscale(80%); }
.tut-ghost .unit { border-style: dashed; }
.tut-ghost-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #fecaca; text-shadow: 0 1px 3px #000; transform: rotate(-12deg); pointer-events: none; }
.tut-coach { background: linear-gradient(165deg, rgba(40,34,88,.97), rgba(14,11,32,.97)); border: 1px solid rgba(252,211,77,.45); box-shadow: 0 -4px 28px rgba(0,0,0,.6); }
`;

/* ============ タイトル画面のボタン ============ */
export default function TutorialButton() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <button
        onClick={() => { setKey((k) => k + 1); setOpen(true); }}
        className="sme-btn sme-btn-ghost mt-6 w-full max-w-xs"
      >
        チュートリアル
      </button>
      {open && <Tutorial key={key} onClose={() => setOpen(false)} />}
    </>
  );
}
