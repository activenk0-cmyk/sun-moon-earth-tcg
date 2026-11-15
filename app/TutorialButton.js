"use client";

// チュートリアル（ゲーム型・文字は最小限）
// ・最初に2枚だけ：「ゴール」と「1ターンの流れ」
// ・あとは本物そっくりの盤面で、指さし＋ひとことの吹き出しどおりにタップするだけ
// ・操作すると、変わった場所に数字（−2・破壊！など）が飛び出して、自動で次へ進む
// ・画面の一番上に「ドロー → メイン → 生贄」の流れをずっと表示（今どこかが光る）
// ※ 本物のエンジン（lib/engine.js）は使わず、このファイルの中だけで動く練習用の盤面

import { useState, useEffect, useRef } from "react";
import { ManaBar, EmptySlots } from "./GameParts";

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

function drawOne(me) {
  const c = me.pile.shift();
  if (c) me.hand.push(c);
  me.deck -= 1;
}

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
  attack(b, uid, target) {
    const n = clone(b);
    const a = n.me.field.find((u) => u.uid === uid);
    a.attacked = true;
    if (target === "face") {
      n.opp.hp -= a.stat;
    } else {
      const t = n.opp.field.find((u) => u.uid === target);
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
};

// 生贄の3つの効果を、1つずつ順番に見せる
function sacSeq(uid) {
  return [
    [(n) => {
      const i = n.me.hand.findIndex((h) => h.uid === uid);
      n.me.sacCard = n.me.hand[i];
      n.me.hand.splice(i, 1);
      n.me.sac += 1;
      n.me.maxCost += 1;
      n.me.sacrificed = true;
    }, "① コスト上限 +1"],
    [(n) => { n.me.hp += n.me.sacCard.cost; }, "② HP回復（カードのコスト分）"],
    [(n) => { drawOne(n.me); delete n.me.sacCard; }, "③ 1枚引く"],
  ];
}

// 相手のターン（自動）：[盤面の変化, ひとこと, 数字の上書き]
const OPP_TURN = [
  [(n) => { n.turn = "opp"; n.phase = "draw"; n.opp.hand += 1; n.opp.deck -= 1; }, "相手のドロー"],
  [(n) => { n.phase = "main"; n.opp.hand -= 1; n.opp.cost -= 3; n.opp.field.push({ ...unit("o2", "ゴブリン", 3, "moon"), sick: true }); }, "相手が召喚"],
  [(n) => { n.phase = "sacrifice"; n.opp.sac += 1; n.opp.deck -= 1; n.opp.maxCost += 1; n.opp.hp += 2; }, "相手も生贄でパワーアップ"],
  [(n) => {
    n.turn = "me"; n.phase = "draw"; n.turnCount = 2;
    n.me.cost = n.me.maxCost; n.me.sacrificed = false;
    n.me.field.forEach((u) => { u.sick = false; u.attacked = false; });
    n.opp.field.forEach((u) => { u.sick = false; });
  }, "あなたの番！ コストが 2→3 に増えた", { meCost: "3/3" }],
];

/* ============ 変わった場所に出す数字（−2・破壊！など） ============ */
function pops(a, b) {
  const out = {};
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  if (a.opp.hp !== b.opp.hp) out.oppHp = sign(b.opp.hp - a.opp.hp);
  if (a.me.hp !== b.me.hp) out.meHp = sign(b.me.hp - a.me.hp);
  if (a.me.maxCost !== b.me.maxCost) out.meCost = "上限+1";
  else if (b.me.cost > a.me.cost && b.me.cost === b.me.maxCost) out.meCost = "全回復";
  else if (a.me.cost !== b.me.cost) out.meCost = sign(b.me.cost - a.me.cost);
  if (b.me.hand.length > a.me.hand.length) out.hand = "+1枚";
  for (const side of ["me", "opp"]) {
    for (const u of b[side].field) {
      const p = a[side].field.find((x) => x.uid === u.uid);
      if (!p) out[`u:${u.uid}`] = "召喚！";
      else if (p.stat !== u.stat) out[`u:${u.uid}`] = `${p.stat}→${u.stat}`;
    }
    for (const p of a[side].field) {
      if (!b[side].field.find((x) => x.uid === p.uid)) out[`u:${p.uid}`] = "破壊！";
    }
  }
  return out;
}

/* ============ 手順 ============ */
// hints(sel)：指さしの吹き出し [{ key, text, below }] / focus(sel)：光らせる場所
// toasts：操作のあとに順番に出すひとこと
const STEPS = [
  {
    allow: { draw: true },
    hints: () => [{ key: "controls", text: "タップして1枚引く" }],
    focus: () => ["controls"],
  },
  {
    allow: { play: ["h1"] },
    hints: () => [{ key: "meCost", text: "今のコストは 2" }, { key: "hand", text: "コスト2のカードを出そう", below: true, at: "bottom" }],
    focus: () => ["card:h1", "meCost"],
    toasts: ["コストを払って召喚！", "出したターンはお休み（★）"],
  },
  {
    allow: { select: ["u1"], target: ["o1"] },
    hints: (sel) => [sel ? { key: "oppField", text: "スライムを攻撃！", below: true } : { key: "u:u1", text: "戦士をタップ" }],
    focus: (sel) => (sel ? ["u:o1"] : ["u:u1"]),
    toasts: ["数字どうしで削り合う"],
  },
  {
    allow: { select: ["u2"], target: ["face"] },
    hints: (sel) => [sel ? { key: "face", text: "相手に直接攻撃！" } : { key: "u:u2", text: "弓兵をタップ" }],
    focus: (sel) => (sel ? ["face"] : ["u:u2"]),
    toasts: ["相手のHPに直接ダメージ"],
  },
  {
    allow: { toSac: true },
    hints: () => [{ key: "controls", text: "メインはおしまい" }],
    focus: () => ["controls"],
  },
  {
    allow: { sac: ["h2"] },
    hints: () => [{ key: "hand", text: "使わないカードを生贄に" }],
    focus: () => ["card:h2"],
  },
  {
    allow: { end: true },
    hints: () => [{ key: "controls", text: "ターン終了" }],
    focus: () => ["controls"],
  },
  {
    allow: { draw: true },
    hints: () => [{ key: "controls", text: "また1枚引く" }],
    focus: () => ["controls"],
  },
  {
    allow: { play: ["h5"] },
    hints: () => [{ key: "meCost", text: "コスト 3 に増えた" }, { key: "hand", text: "コスト3のカードも出せる！", below: true, at: "bottom" }],
    focus: () => ["card:h5", "meCost"],
    toasts: ["コストが増えるほど強いカードが出せる"],
  },
  {
    allow: { select: ["u1", "u2", "h1"], target: ["face"] },
    hints: (sel) => [sel ? { key: "face", text: "相手に直接攻撃！" } : { key: "meField", text: "全員で攻撃！" }],
    focus: (sel) => (sel ? ["face"] : ["meField", "oppHp"]),
    done: (b) => b.opp.hp <= 0,
  },
];

/* ============ 光らせる・暗くする ============ */
const CONTAINERS = {
  oppPanel: (k) => k === "oppHp",
  oppField: (k) => k.startsWith("u:o"),
  face: () => false,
  meField: (k) => k.startsWith("u:u") || k.startsWith("u:h"),
  mePanel: (k) => k === "meHp" || k === "meCost",
  hand: (k) => k.startsWith("card:"),
  controls: () => false,
};
const parentOf = (k) => Object.keys(CONTAINERS).find((c) => CONTAINERS[c](k));

function zoneClass(key, focus) {
  if (!focus.length) return "";
  if (focus.includes(key)) return "tut-focus";
  if (CONTAINERS[key]) return focus.some((k) => CONTAINERS[key](k)) ? "" : "tut-dim";
  const p = parentOf(key);
  if (p && !focus.includes(p) && focus.some((k) => k !== key && CONTAINERS[p](k))) return "tut-dim";
  return "";
}

/* ============ 部品 ============ */

// 光る・指さし・飛び出す数字をまとめて付ける枠
function Spot({ k, ui, className = "", children }) {
  const pop = ui.pops[k];
  return (
    <div data-tut={k} className={`relative ${className} ${zoneClass(k, ui.focus)}`}>
      {children}
      {ui.hints.filter((h) => h.key === k).map((h) => (
        <div key={h.text} className={`tut-hint ${h.below ? "below" : ""}`}>
          {h.below ? "👆 " : ""}{h.text}{h.below ? "" : " 👇"}
        </div>
      ))}
      {pop && <div key={`${ui.popN}-${k}`} className={`tut-pop ${k.endsWith("Hp") ? "side" : ""} ${pop.startsWith("-") || pop === "破壊！" ? "bad" : ""}`}>{pop}</div>}
    </div>
  );
}

// 一番上の「流れ」の帯
function FlowBar({ b }) {
  const mine = b.turn === "me";
  const steps = [["draw", "ドロー"], ["main", "メイン"], ["sacrifice", "生贄"]];
  return (
    <div className={`tut-flow ${mine ? "mine" : "theirs"}`}>
      <span className="who">{mine ? "あなた" : "相手"}</span>
      {steps.map(([id, t], i) => (
        <span key={id} className="flex items-center">
          <span className={`step ${b.phase === id ? "on" : ""}`}>{t}</span>
          {i < 2 && <span className="arrow">›</span>}
        </span>
      ))}
    </div>
  );
}

function TutUnit({ u, foe, ready, selected, target, onTap }) {
  const statCls = u.stat > u.base ? "is-up" : u.stat < u.base ? "is-down" : "";
  let look = "";
  if (selected) look = "is-selected";
  else if (target) look = "is-target";
  else if (ready) look = "is-ready";
  const cls = ["unit", `fx-${u.faction}`, foe ? "is-foe" : "", look, u.attacked ? "is-attacked" : "", u.sick ? "opacity-60 grayscale" : ""]
    .filter(Boolean).join(" ");
  return (
    <div className="unit-enter">
      <button onClick={onTap} className={cls}>
        {u.sick && <span className="dizzy" aria-hidden="true"><span>★</span><span>★</span><span>★</span></span>}
        <div className="unit-name">{u.name}</div>
        <div className="flex justify-between items-end mt-1">
          <span key={`s-${u.stat}`} className={`unit-stat ${statCls}`}>{u.stat}</span>
        </div>
      </button>
    </div>
  );
}

/* ============ 盤面 ============ */
function Board({ b, ui, sel, allow, interactive, onAct }) {
  const isMine = b.turn === "me";
  const ok = (list, id) => interactive && !!list && list.includes(id);
  const canSelect = (u) => ok(allow.select, u.uid) && !u.attacked && !u.sick;
  const faceOk = sel && ok(allow.target, "face");
  const btn = (on) => `sme-btn !py-2.5 ${on ? "sme-glow" : "opacity-50"}`;

  return (
    <div className="max-w-lg mx-auto text-sm">
      {/* 相手 */}
      <Spot k="oppPanel" ui={ui} className="sme-panel sme-panel-opp !rounded-none !border-x-0 !border-t-0 px-3 py-2">
        <div className="flex items-center gap-3">
          <Spot k="oppHp" ui={ui} className="rounded-full">
            <div key={`ohp-${b.opp.hp}`} className={`hp-orb opp ${b.opp.hp <= 3 ? "is-danger" : ""}`}>{Math.max(0, b.opp.hp)}</div>
          </Spot>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-rose-200">相手</span>
              <span className="text-[11px] font-bold text-indigo-200">コスト {b.opp.cost}/{b.opp.maxCost}</span>
            </div>
            <div className="mt-0.5"><ManaBar cost={b.opp.cost} max={b.opp.maxCost} /></div>
          </div>
        </div>
      </Spot>

      <Spot k="oppField" ui={ui} className="mx-1 mt-2 px-1 py-1 rounded-lg">
        <div className="flex gap-1 flex-wrap justify-center">
          {b.opp.field.map((u) => (
            <Spot key={u.uid} k={`u:${u.uid}`} ui={ui} className="rounded-xl">
              <TutUnit
                u={u} foe
                target={sel && ok(allow.target, u.uid)}
                onTap={() => sel && ok(allow.target, u.uid) && onAct({ type: "attack", uid: sel, target: u.uid })}
              />
            </Spot>
          ))}
          {ui.ghosts.opp.map((u) => (
            <Spot key={`g-${u.uid}`} k={`u:${u.uid}`} ui={ui} className="tut-ghost"><TutUnit u={{ ...u, stat: 0 }} foe /></Spot>
          ))}
          <EmptySlots count={5 - b.opp.field.length - ui.ghosts.opp.length} />
        </div>
      </Spot>

      {/* ダイレクト */}
      <Spot k="face" ui={ui} className="mx-2 my-2 rounded-lg min-h-[36px]">
        {faceOk && (
          <button onClick={() => onAct({ type: "attack", uid: sel, target: "face" })} className="sme-btn sme-btn-danger sme-btn-sm sme-glow">
            ⚔ ダイレクト
          </button>
        )}
      </Spot>

      {/* 自分の場 */}
      <Spot k="meField" ui={ui} className="mx-1 px-1 pt-1 pb-2 rounded-lg">
        <div className="flex gap-1 flex-wrap justify-center">
          {b.me.field.map((u) => (
            <Spot key={u.uid} k={`u:${u.uid}`} ui={ui} className="rounded-xl">
              <TutUnit
                u={u}
                ready={canSelect(u)}
                selected={sel === u.uid}
                onTap={() => canSelect(u) && onAct({ type: "select", uid: u.uid })}
              />
            </Spot>
          ))}
          {ui.ghosts.me.map((u) => (
            <Spot key={`g-${u.uid}`} k={`u:${u.uid}`} ui={ui} className="tut-ghost"><TutUnit u={{ ...u, stat: 0 }} /></Spot>
          ))}
          <EmptySlots count={5 - b.me.field.length - ui.ghosts.me.length} />
        </div>
      </Spot>

      {/* 自分 */}
      <Spot k="mePanel" ui={ui} className="sme-panel sme-panel-me !rounded-none !border-x-0 px-3 py-2">
        <div className="flex items-center gap-3">
          <Spot k="meHp" ui={ui} className="rounded-full">
            <div key={`mhp-${b.me.hp}`} className="hp-orb me">{b.me.hp}</div>
          </Spot>
          <Spot k="meCost" ui={ui} className="flex-1 min-w-0 rounded px-0.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-200">あなた</span>
              <span className="text-[11px] font-bold text-indigo-200">コスト {b.me.cost}/{b.me.maxCost}</span>
            </div>
            <ManaBar cost={b.me.cost} max={b.me.maxCost} />
          </Spot>
        </div>
      </Spot>

      {/* 手札 */}
      <Spot k="hand" ui={ui} className="mx-1 mt-8 px-1 rounded-lg">
        <div className="flex gap-2 overflow-x-auto pt-2 pb-2 px-1">
          {b.me.hand.map((h) => {
            const canPlay = ok(allow.play, h.uid) && b.phase === "main" && h.cost <= b.me.cost;
            const canSac = ok(allow.sac, h.uid) && b.phase === "sacrifice";
            return (
              <div key={h.uid} className={`hand-enter shrink-0 rounded-xl ${zoneClass(`card:${h.uid}`, ui.focus)}`}>
                <button
                  onClick={() => (canPlay ? onAct({ type: "play", uid: h.uid }) : canSac && onAct({ type: "sac", uid: h.uid }))}
                  className={`hand-card fx-${h.faction} ${canPlay || canSac ? "is-playable" : "is-dim"}`}
                >
                  <div className="flex justify-end">
                    <span className="cost-gem"><span>{h.cost}</span></span>
                  </div>
                  <div className="text-[11px] font-bold leading-tight mt-1 text-white">{h.name}</div>
                  <div className="mt-1"><span className="unit-stat">{h.stat}</span></div>
                </button>
              </div>
            );
          })}
        </div>
      </Spot>

      {/* ボタン */}
      <Spot k="controls" ui={ui} className="mx-1 mt-8 px-2 pb-2 pt-1 rounded-lg">
        {!isMine && <div className="sme-panel py-2.5 text-xs text-center text-slate-300">相手のターン…</div>}
        {isMine && b.phase === "draw" && (
          <button disabled={!interactive || !allow.draw} onClick={() => onAct({ type: "draw" })} className={`${btn(interactive && allow.draw)} sme-btn-sun`}>
            カードを引く
          </button>
        )}
        {isMine && b.phase === "main" && (
          <button disabled={!interactive || !allow.toSac} onClick={() => onAct({ type: "toSac" })} className={`${btn(interactive && allow.toSac)} sme-btn-sun`}>
            メイン終了 → 生贄へ
          </button>
        )}
        {isMine && b.phase === "sacrifice" && (
          <button disabled={!interactive || !allow.end} onClick={() => onAct({ type: "end" })} className={`${btn(interactive && allow.end)} sme-btn-moon`}>
            ターン終了
          </button>
        )}
      </Spot>
    </div>
  );
}

/* ============ 最初の2枚（タップで進む） ============ */
function Intro({ page, onNext }) {
  return (
    <div onClick={onNext} className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 px-6 text-center cursor-pointer">
      {page === 0 ? (
        <div key="p0" className="tut-intro">
          <div className="hp-orb opp mx-auto !text-3xl !min-w-[80px] !h-[80px]">0</div>
          <div className="mt-5 text-2xl font-black text-white">相手のHPを<br /><span className="text-rose-300">0</span>にしたら勝ち</div>
        </div>
      ) : (
        <div key="p1" className="tut-intro w-full max-w-xs">
          <div className="text-sm font-bold text-slate-300 mb-3">1ターンはこれだけ</div>
          {[["ドロー", "1枚引く"], ["メイン", "出す・攻撃"], ["生贄", "コスト↑ HP↑ 1枚引く"]].map(([t, d], i) => (
            <div key={t}>
              <div className="rounded-xl border-2 border-amber-300/80 bg-amber-400/15 py-2.5">
                <div className="text-xl font-black text-amber-200">{t}</div>
                <div className="text-xs text-slate-300">{d}</div>
              </div>
              {i < 2 && <div className="text-amber-300 text-lg leading-6">▼</div>}
            </div>
          ))}
          <div className="mt-3 text-sm font-bold text-slate-200">↻ 相手と交互にくり返す</div>
        </div>
      )}
      <div className="absolute bottom-10 text-xs text-slate-400 animate-pulse">タップで次へ</div>
    </div>
  );
}

/* ============ クリア画面 ============ */
function Clear({ onDetails, onReplay, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 px-6 text-center">
      <div className="tut-intro">
        <div className="text-5xl font-black text-amber-300 tut-win">WIN!</div>
        <div className="mt-3 text-lg font-bold text-white">これで遊べます！</div>
        <div className="mt-1 text-xs text-slate-400">カードの効果はタップで確認できます</div>
      </div>
      <div className="mt-8 w-full max-w-xs space-y-2">
        <button onClick={onDetails} className="sme-btn sme-btn-sun">もっと詳しいルール</button>
        <button onClick={onReplay} className="sme-btn sme-btn-ghost sme-btn-sm">もう一度</button>
        <button onClick={onClose} className="sme-btn sme-btn-ghost sme-btn-sm">閉じる</button>
      </div>
    </div>
  );
}

/* ============ もっと詳しいルール（見出しだけでわかる → タップで中身） ============ */
const DETAILS = [
  ["勝ち負け", "相手HP0で勝ち", ["山札の最後の1枚を引いたら負け。", "同時に負けたら、そのターンの人の勝ち。", "HPは10を超えて増やせる。"]],
  ["デッキ", "10種類 × 4枚 = 40枚", ["10個の枠から1枚ずつ選ぶと、4枚ずつ入る。", "陣営は混ぜてOK。迷ったらおすすめデッキ。", "最初の手札は5枚。手札は10枚まで。"]],
  ["先攻・後攻", "後攻はちょっと有利", ["先攻は最初のターンだけドローなし。", "後攻は最初のターンの終わりに、手札3枚のコストが1下がる。"]],
  ["コスト", "毎ターン全回復", ["最初は1、生贄で増えて最大10。", "場に出せるキャラは5体まで。"]],
  ["生贄", "1ターン1回", ["コスト上限+1・1枚引く・カードのコスト分HP回復。", "しなくてもOK。上限10になったらできない。"]],
  ["攻撃", "1体につき1ターン1回", ["出したターンは攻撃できない（+4コストで即攻撃）。", "減った数字は元に戻らない。"]],
  ["マーク", "キャラの右下のマーク", ["守：相手はこのキャラしか攻撃できない", "速：出したターンから攻撃できる", "闘：出したターンからキャラを攻撃できる", "隠：相手のキャラから攻撃されない"]],
];

function DetailsView({ onBack }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-10 text-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="sme-heading text-lg">ルール</div>
        <button onClick={onBack} className="px-2 text-xl leading-none text-slate-300">×</button>
      </div>
      <div className="space-y-1.5">
        {DETAILS.map(([title, summary, items], i) => (
          <div key={title} className="sme-panel overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
              <span className="w-20 shrink-0 text-[13px] font-bold text-slate-100">{title}</span>
              <span className="flex-1 text-[12px] text-amber-200">{summary}</span>
              <span className="text-slate-500 text-xs">{open === i ? "▲" : "▼"}</span>
            </button>
            {open === i && (
              <ul className="px-3 pb-3 space-y-1 text-xs text-slate-300">
                {items.map((t) => <li key={t}>・{t}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <button onClick={onBack} className="sme-btn sme-btn-ghost sme-btn-sm mt-5">閉じる</button>
    </div>
  );
}

/* ============ チュートリアル本体 ============ */
const SEQ_MS = 1500; // ひとことを1つ見せる時間

function Tutorial({ onClose }) {
  const [board, setBoard] = useState(initialBoard);
  const [intro, setIntro] = useState(0); // 0,1 = 最初の2枚 / 2 = 終わり
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false); // 変化を見せている間・相手のターン中
  const [popMap, setPopMap] = useState({});
  const [popN, setPopN] = useState(0);
  const [ghosts, setGhosts] = useState({ me: [], opp: [] });
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("play"); // play / clear / details
  const timers = useRef([]);
  const rootRef = useRef(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const step = STEPS[idx];
  const interactive = intro >= 2 && !busy && view === "play";
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ui = {
    // 操作待ちは「次に押す所」、変化を見せている間は「変わった所」を光らせる
    focus: interactive ? step.focus(sel, board) : Object.keys(popMap),
    hints: interactive ? step.hints(sel, board) : [],
    pops: popMap,
    popN,
    ghosts,
  };

  // 変化を見せる（数字・破壊されたキャラ・ひとこと）。変化がない時は前の数字を残す
  function show(prev, next, text, popOver) {
    const p = { ...pops(prev, next), ...(popOver || {}) };
    if (Object.keys(p).length) {
      const g = { me: [], opp: [] };
      for (const side of ["me", "opp"]) {
        for (const u of prev[side].field) if (!next[side].field.find((x) => x.uid === u.uid)) g[side].push(u);
      }
      setGhosts(g);
      setPopMap(p);
      setPopN((n) => n + 1);
    }
    setToast(text ? { text, n: Date.now() } : null);
  }
  function clearShow() {
    setGhosts({ me: [], opp: [] });
    setPopMap({});
    setToast(null);
  }

  // 盤面の変化を順番に見せて、最後に次の手順へ
  // items: [[(盤面) => 盤面を書き換える, ひとこと, 数字の上書き], ...]
  function runSeq(items, first = 0) {
    setBusy(true);
    setSel(null);
    let cur = boardRef.current;
    items.forEach(([fn, text, popOver], i) => {
      later(first + i * SEQ_MS, () => {
        const prev = cur;
        cur = clone(cur);
        fn(cur);
        setBoard(cur);
        show(prev, cur, text, popOver);
      });
    });
    const end = first + (items.length - 1) * SEQ_MS + (items.some((x) => x[1]) ? SEQ_MS + 200 : 900);
    later(end, () => {
      clearShow();
      setBusy(false);
      if (idx + 1 >= STEPS.length) setView("clear");
      else setIdx(idx + 1);
    });
  }

  // ふつうの操作：盤面を変えたあと、ひとことを順番に出す
  function apply(next) {
    if (step.done && !step.done(next)) {
      // とどめの途中：数字だけ見せて、そのまま続けて操作できる
      const prev = board;
      setBoard(next);
      setSel(null);
      show(prev, next, null);
      later(SEQ_MS, () => setPopMap({}));
      return;
    }
    const toasts = step.toasts || [];
    const items = [[(n) => Object.assign(n, clone(next)), toasts[0]], ...toasts.slice(1).map((t) => [() => {}, t])];
    runSeq(items);
  }

  function onAct(a) {
    if (!interactive) return;
    const al = step.allow;
    if (a.type === "select") return setSel(sel === a.uid ? null : a.uid);
    if (a.type === "draw" && al.draw) return apply(ACT.draw(board));
    if (a.type === "play") return apply(ACT.play(board, a.uid));
    if (a.type === "attack") return apply(ACT.attack(board, a.uid, a.target));
    if (a.type === "toSac" && al.toSac) return apply(ACT.toSac(board));
    if (a.type === "sac") return runSeq(sacSeq(a.uid));
    if (a.type === "end" && al.end) return runSeq(OPP_TURN, 500);
  }

  function replay() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setBoard(initialBoard());
    setIdx(0);
    setSel(null);
    setBusy(false);
    clearShow();
    setView("play");
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 overflow-y-auto sme-tut-root">
      <style>{TUT_CSS}</style>
      {view === "details" ? (
        <DetailsView onBack={() => setView("clear")} />
      ) : (
        <>
          <div className="sticky top-0 z-30">
            <FlowBar b={board} />
            <button onClick={onClose} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded bg-black/50 border border-white/30 text-white">
              スキップ
            </button>
          </div>
          <div className="pb-20">
            <Board b={board} ui={ui} sel={sel} allow={step.allow} interactive={interactive} onAct={onAct} />
          </div>
          {toast && (
            <div className="fixed inset-x-0 bottom-8 z-40 flex justify-center pointer-events-none px-3">
              <div key={toast.n} className="tut-toast">{toast.text}</div>
            </div>
          )}
          {intro < 2 && <Intro page={intro} onNext={() => setIntro(intro + 1)} />}
          {view === "clear" && <Clear onDetails={() => setView("details")} onReplay={replay} onClose={onClose} />}
        </>
      )}
    </div>
  );
}

const TUT_CSS = `
.sme-tut-root { background: radial-gradient(120% 60% at 50% 0%, #1f1a45 0%, #0a0818 70%); }
.tut-dim { opacity: 0.3; filter: grayscale(40%); transition: opacity .25s; }
.tut-focus { z-index: 5; box-shadow: 0 0 0 2px #fcd34d, 0 0 18px 4px rgba(252,211,77,.55); animation: tutPulse 1.4s ease-in-out infinite; }
@keyframes tutPulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }

.tut-hint { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); z-index: 20; white-space: nowrap;
  padding: 5px 11px; border-radius: 999px; font-size: 13px; font-weight: 900; color: #2a1800;
  background: linear-gradient(160deg, #fff4c8, #fbbf24); box-shadow: 0 3px 12px rgba(0,0,0,.6), 0 0 14px rgba(251,191,36,.6);
  animation: tutBob 0.9s ease-in-out infinite; pointer-events: none; }
.tut-hint.below { bottom: auto; top: calc(100% + 6px); }
@keyframes tutBob { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -5px); } }

.tut-pop { position: absolute; left: 50%; top: 40%; z-index: 25; white-space: nowrap; pointer-events: none;
  font-size: 22px; font-weight: 900; color: #6ee7b7; text-shadow: 0 2px 4px #000, 0 0 10px rgba(110,231,183,.8);
  animation: tutPopUp 1.5s ease-out both; }
.tut-pop.bad { color: #fda4af; text-shadow: 0 2px 4px #000, 0 0 10px rgba(253,164,175,.8); }
@keyframes tutPopUp { 0% { transform: translate(-50%, 0) scale(.5); opacity: 0; } 15% { transform: translate(-50%, -14px) scale(1.25); opacity: 1; }
  70% { transform: translate(-50%, -26px) scale(1); opacity: 1; } 100% { transform: translate(-50%, -38px); opacity: 0; } }

.tut-pop.side { left: 170%; top: 10%; font-size: 26px; }
.tut-ghost { opacity: .45; filter: grayscale(80%); }

.tut-toast { padding: 10px 22px; border-radius: 14px; font-size: 18px; font-weight: 900; color: #fff;
  background: rgba(20,14,50,.92); border: 2px solid rgba(252,211,77,.7); box-shadow: 0 6px 30px rgba(0,0,0,.7);
  animation: tutToast 1.6s ease-out both; }
@keyframes tutToast { 0% { transform: scale(.6); opacity: 0; } 12% { transform: scale(1.08); opacity: 1; } 22% { transform: scale(1); } 85% { opacity: 1; } 100% { opacity: 0; } }

.tut-flow { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 60px 8px 8px; }
.tut-flow.mine { background: linear-gradient(90deg, #3a2604, #6b4708, #3a2604); }
.tut-flow.theirs { background: linear-gradient(90deg, #1c1840, #3a3470, #1c1840); }
.tut-flow .who { font-size: 11px; font-weight: 900; color: #fff; margin-right: 4px; }
.tut-flow .step { font-size: 13px; font-weight: 800; padding: 3px 10px; border-radius: 999px; color: rgba(255,255,255,.4); }
.tut-flow .step.on { color: #2a1800; background: linear-gradient(160deg, #fff4c8, #fbbf24); box-shadow: 0 0 12px rgba(251,191,36,.7); }
.tut-flow.theirs .step.on { color: #fff; background: linear-gradient(160deg, #8f8af0, #4b44b8); box-shadow: 0 0 12px rgba(154,166,255,.7); }
.tut-flow .arrow { color: rgba(255,255,255,.4); font-weight: 900; margin: 0 1px; }

.tut-intro { animation: tutIn .35s ease-out both; }
@keyframes tutIn { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.tut-win { animation: tutWin 1s ease-in-out infinite; text-shadow: 0 0 24px rgba(252,211,77,.8); }
@keyframes tutWin { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
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
