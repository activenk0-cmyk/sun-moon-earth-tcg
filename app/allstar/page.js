"use client";

// ============================================================
// オールスター戦（CPU対戦）
// ・全カードを1枚ずつ入れたデッキで、自分とCPUが対戦する
// ・URL: /allstar（タイトル画面からは行けない。直接開く）
// ・ランク戦ではない（ポイントは動かない。マイページの記録にも入れない）
// ============================================================

import { useState, useEffect } from "react";
import { CARDS } from "../../lib/cards";
import * as E from "../../lib/engine";
import { CPU_DECKS } from "../../lib/cpu";
import { DECKS } from "../../lib/decks";
import { CPU_ID, YOU_ID, CpuGame } from "../GameScreen";

// アビリティ枠・水星/土星の色（app/page.js の EXTRA_CSS と同じもの）
// app/page.js を通らずにこのページを直接開くと読み込まれないため、ここでも入れる
const EXTRA_CSS = `
.fx-mercury { --fx: #4fd8f0; --fx-deep: #136c80; --fx-rgb: 79, 216, 240; }
.fx-saturn { --fx: #b9b37d; --fx-deep: #6a6439; --fx-rgb: 185, 179, 125; }
.ability-row { display: flex; gap: 4px; margin-top: 3px; }
.ability-chip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 50%;
  font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 6px;
  background: rgba(var(--fx-rgb), 0.16); border: 1px solid rgba(var(--fx-rgb), 0.6); color: #e6fbff;
}
.ability-chip .ab-kind {
  font-weight: 800; padding: 1px 4px; border-radius: 4px; background: var(--fx-deep); color: #fff; flex-shrink: 0;
}
.ability-chip .ab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ability-empty {
  font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 6px;
  border: 1px dashed rgba(255,255,255,0.18); color: rgba(255,255,255,0.3);
}
`;
if (typeof document !== "undefined" && !document.getElementById("sme-extra-css")) {
  const el = document.createElement("style");
  el.id = "sme-extra-css";
  el.textContent = EXTRA_CSS;
  document.head.appendChild(el);
}

// デッキに入るカード（枠のあるカードすべて）
const ALL_IDS = CARDS.filter((c) => c.slot).map((c) => c.id);

const CPU_DECK = {
  name: `オールスター（全${ALL_IDS.length}枚）`,
  tier: "-",
  style: "balanced",
};

// 全カード1枚ずつの山札
function allDeck() {
  return E.shuffle(ALL_IDS.map((id) => ({ uid: E.uid(), cardId: id, costMod: 0 })));
}

// 新しい試合を作る
function newGame() {
  // ゲームの土台を作るためだけに、ふつうのデッキを一時的に使う（山札はすぐ入れ替える）
  const base = (DECKS.length ? DECKS[0] : CPU_DECKS[0]).selection;
  const s = E.createLocalGame({
    p1: YOU_ID,
    p2: CPU_ID,
    sel1: base,
    sel2: base,
    first: Math.random() < 0.5 ? YOU_ID : CPU_ID,
    log: [`オールスター戦：全カード1枚ずつ・${ALL_IDS.length}枚デッキ`],
  });
  // 山札を全カード1枚ずつに入れ替えて、初期手札を配り直す
  [YOU_ID, CPU_ID].forEach((pid) => {
    const p = s.players[pid];
    p.deck = allDeck();
    E.dealInitialHand(p);
    p.selection = null; // 10枠のデッキではないので、マイページの記録には入れない
  });
  return {
    ...s,
    gameId: `allstar:${E.uid()}:${Date.now()}`,
    ranked: false,
  };
}

export default function AllStarPage() {
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);

  // 画面を開いたら試合開始（サーバー側ではシャッフルしない）
  useEffect(() => {
    setState(newGame());
  }, []);

  const toTitle = () => {
    window.location.href = "/";
  };

  if (!state) return <div className="p-8 text-center sme-label">LOADING...</div>;

  return (
    <CpuGame
      state={state}
      setState={setState}
      cpuDeck={CPU_DECK}
      detail={detail}
      setDetail={setDetail}
      onRematch={() => { setDetail(null); setState(newGame()); }}
      onTitle={toTitle}
      onRetire={toTitle}
      rankView={null}
    />
  );
}
