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
