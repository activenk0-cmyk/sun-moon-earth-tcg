"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { SLOTS, FACTION_LABEL, cardsBySlot } from "../lib/cards";
import * as E from "../lib/engine";
import { CPU_DECKS, pickCpuDeck, cpuStep } from "../lib/cpu";

/* ============ 定数 ============ */
const PHASE_LABEL = { draw: "ドロー", main: "メイン", sacrifice: "生贄" };
const CPU_ID = "cpu";
const YOU_ID = "you";

const MODE_MSG = {
  damage3: "3ダメージを与える相手キャラを選んでください",
  destroy: "破壊する相手キャラを選んでください",
  destroyDraw: "破壊する相手キャラを選んでください",
  crest: "4ダメージを与える相手キャラを選んでください",
  bounce: "手札に戻す相手キャラ（コスト5以下）を選んでください",
  goblin: "スタッツ-1する相手キャラを選んでください",
  reduce1: "コストを-1する手札を選んでください",
  reattack: "再攻撃させる攻撃済みの自軍キャラを選んでください",
};

/* ============ ユーティリティ ============ */
const roomId = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const factionText = (f) =>
  f === "sun" ? "text-amber-400" : f === "moon" ? "text-indigo-300" : "text-emerald-300";

/* ============ メイン ============ */
export default function Home() {
  const [screen, setScreen] = useState("menu");
  const [selection, setSelection] = useState({});
  const [myId] = useState(() => E.uid());
  const [room, setRoom] = useState("");
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const unsubRef = useRef(null);

  // CPU戦
  const [cpuState, setCpuState] = useState(null);
  const [cpuDeck, setCpuDeck] = useState(null);

  useEffect(() => () => unsubRef.current && unsubRef.current(), []);

  const deckComplete = SLOTS.every((s) => selection[s]);

  /* ---- ルーム作成 ---- */
  async function createRoom() {
    const id = roomId();
    const deck = E.buildDeck(selection);
    const init = {
      host: myId,
      guest: null,
      phase: "waiting",
      turn: myId,
      turnPhase: "main", // 先攻1ターン目はドローなし
      turnCount: 1,
      skipNext: null,
      winner: null,
      log: ["ルームを作成しました"],
      players: { [myId]: E.newPlayer(deck, selection) },
    };
    await setDoc(doc(db, "rooms", id), init);
    setRoom(id);
    subscribe(id);
    setScreen("game");
  }

  /* ---- ルーム参加 ---- */
  async function joinRoom(id) {
    const ref = doc(db, "rooms", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) { setMsg("ルームが見つかりません"); return; }
    const d = snap.data();
    if (d.guest) { setMsg("すでに満室です"); return; }

    const hp = { ...d.players };
    hp[myId] = E.newPlayer(E.buildDeck(selection), selection);
    E.dealInitialHand(hp[d.host]);
    E.dealInitialHand(hp[myId]);
    await updateDoc(ref, {
      guest: myId, players: hp, phase: "play", turnPhase: "main",
      log: [...d.log, "対戦開始！ 先攻は初ターンドローなし"],
    });
    setRoom(id);
    subscribe(id);
    setScreen("game");
  }

  function subscribe(id) {
    unsubRef.current = onSnapshot(doc(db, "rooms", id), (s) => {
      if (s.exists()) setState(s.data());
    });
  }

  async function pushOnline(next) {
    await updateDoc(doc(db, "rooms", room), next);
  }

  /* ---- CPU戦開始 ---- */
  function startCpu() {
    const d = pickCpuDeck();
    setCpuDeck(d);
    setCpuState(
      E.createLocalGame({
        p1: YOU_ID,
        p2: CPU_ID,
        sel1: selection,
        sel2: d.selection,
        first: Math.random() < 0.5 ? YOU_ID : CPU_ID,
        log: [`CPUのデッキ: ${d.name}（Tier${d.tier}）`],
      })
    );
    setScreen("cpu");
  }

  /* ============ 画面: メニュー ============ */
  if (screen === "menu") {
    return (
      <main className="min-h-screen p-5 max-w-lg mx-auto">
        <h1 className="text-3xl font-bold mb-2">SUN / MOON / EARTH</h1>
        <p className="text-sm text-slate-400 mb-8">3陣営カードゲーム</p>
        <button
          onClick={() => setScreen("deck")}
          className="w-full py-4 rounded-xl bg-amber-500 text-slate-900 font-bold text-lg"
        >
          デッキを作って対戦
        </button>
        <div className="mt-8 text-xs text-slate-500 leading-relaxed">
          10のコスト枠から各1種を選び、4枚ずつ計40枚のデッキを作ります。
          友達とのルーム対戦と、CPU対戦が遊べます。
        </div>
      </main>
    );
  }

  /* ============ 画面: デッキ構築 ============ */
  if (screen === "deck") {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto pb-40">
        <h2 className="text-xl font-bold mb-1">デッキ構築</h2>
        <p className="text-xs text-slate-400 mb-3">
          各枠から1種類ずつ選択（「詳細」で効果を確認）
        </p>

        {/* プリセット */}
        <div className="mb-5">
          <div className="text-xs text-slate-400 mb-1">おすすめデッキから選ぶ</div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {CPU_DECKS.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelection({ ...d.selection })}
                className="shrink-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-[11px]"
              >
                <span className="text-slate-400">T{d.tier} </span>{d.name}
              </button>
            ))}
          </div>
        </div>

        {SLOTS.map((slot) => (
          <div key={slot} className="mb-5">
            <div className="text-xs text-slate-400 mb-1">
              コスト {slot}
              {(slot === "2b" || slot === "3b" || slot === "6") && " / マジック"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cardsBySlot(slot).map((c) => {
                const on = selection[slot] === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelection({ ...selection, [slot]: c.id })}
                    className={`p-2 rounded-lg text-left border-2 transition ${
                      on ? "border-white bg-slate-700" : "border-slate-700 bg-slate-800"
                    }`}
                  >
                    <div className={`text-[10px] mb-1 ${factionText(c.faction)}`}>
                      {FACTION_LABEL[c.faction]}
                    </div>
                    <div className="text-[11px] font-bold leading-tight">{c.name}</div>
                    {c.stat && <div className="text-[10px] text-slate-400 mt-1">STAT {c.stat}</div>}
                    <div
                      onClick={(e) => { e.stopPropagation(); setDetail(c); }}
                      className="text-[10px] text-sky-400 mt-1 underline"
                    >
                      詳細
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-700">
          <div className="max-w-lg mx-auto">
            <div className="text-xs mb-2 text-slate-400">
              {Object.keys(selection).length} / 10 枠選択済み
            </div>
            <button
              disabled={!deckComplete}
              onClick={startCpu}
              className="w-full py-3 mb-2 rounded-lg bg-emerald-500 text-slate-900 font-bold disabled:opacity-30"
            >
              CPUと対戦
            </button>
            <div className="flex gap-2">
              <button
                disabled={!deckComplete}
                onClick={createRoom}
                className="flex-1 py-3 rounded-lg bg-amber-500 text-slate-900 font-bold disabled:opacity-30"
              >
                ルーム作成
              </button>
              <button
                disabled={!deckComplete}
                onClick={() => setScreen("join")}
                className="flex-1 py-3 rounded-lg bg-indigo-500 font-bold disabled:opacity-30"
              >
                ルーム参加
              </button>
            </div>
          </div>
        </div>

        {detail && <DetailModal card={detail} onClose={() => setDetail(null)} />}
      </main>
    );
  }

  /* ============ 画面: ルーム参加 ============ */
  if (screen === "join") {
    return (
      <main className="min-h-screen p-5 max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-4">ルームに参加</h2>
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value.toUpperCase())}
          placeholder="ルームID（4文字）"
          className="w-full p-4 rounded-lg bg-slate-800 border border-slate-600 text-center text-2xl tracking-widest mb-3"
          maxLength={4}
        />
        {msg && <div className="text-red-400 text-sm mb-3">{msg}</div>}
        <button onClick={() => joinRoom(room)} className="w-full py-3 rounded-lg bg-indigo-500 font-bold">
          参加する
        </button>
        <button onClick={() => setScreen("deck")} className="w-full py-3 mt-2 rounded-lg bg-slate-700">
          戻る
        </button>
      </main>
    );
  }

  /* ============ 画面: CPU戦 ============ */
  if (screen === "cpu") {
    return (
      <CpuGame
        state={cpuState}
        setState={setCpuState}
        cpuDeck={cpuDeck}
        detail={detail}
        setDetail={setDetail}
        onRetry={startCpu}
        onMenu={() => { setCpuState(null); setScreen("deck"); }}
      />
    );
  }

  /* ============ 画面: オンライン対戦 ============ */
  return (
    <GameScreen
      state={state}
      myId={myId}
      room={room}
      apply={pushOnline}
      detail={detail}
      setDetail={setDetail}
      onRetry={() => location.reload()}
    />
  );
}

/* ============ CPU戦（CPUの手番を自動で進める） ============ */
function CpuGame({ state, setState, cpuDeck, detail, setDetail, onRetry, onMenu }) {
  useEffect(() => {
    if (!state || state.phase !== "play" || state.turn !== CPU_ID) return;
    // ドロー（ターン開始）は長めに待ってバナーを見せる
    const delay = E.phaseOf(state) === "draw" ? 1400 : 850;
    const t = setTimeout(() => {
      const next = cpuStep(state, CPU_ID, cpuDeck?.style);
      if (next) setState(next);
    }, delay);
    return () => clearTimeout(t);
  }, [state, cpuDeck, setState]);

  return (
    <GameScreen
      state={state}
      myId={YOU_ID}
      room={null}
      apply={(next) => setState(next)}
      detail={detail}
      setDetail={setDetail}
      cpuDeck={cpuDeck}
      onRetry={onRetry}
      onMenu={onMenu}
    />
  );
}

/* ============ カード詳細モーダル（デッキ構築用） ============ */
function DetailModal({ card, onClose }) {
  const c = card;
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-800 rounded-2xl p-5 max-w-sm w-full border border-slate-600"
      >
        <div className={`text-xs mb-1 ${factionText(c.faction)}`}>
          {FACTION_LABEL[c.faction]} / コスト {c.cost} / {c.type === "magic" ? "マジック" : "キャラクター"}
        </div>
        <div className="text-lg font-bold mb-1">{c.name}</div>
        {c.stat && <div className="text-sm text-slate-300 mb-2">スタッツ {c.stat}</div>}
        <p className="text-sm leading-relaxed text-slate-200">{c.text}</p>
        <button onClick={onClose} className="w-full mt-4 py-2 rounded-lg bg-slate-700 text-sm">
          閉じる
        </button>
      </div>
    </div>
  );
}

/* ============ フェーズ表示 ============ */
function PhaseBar({ phase, mine }) {
  const steps = ["draw", "main", "sacrifice"];
  return (
    <div className="flex gap-1 mb-2">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`flex-1 text-center text-[11px] py-1 rounded ${
            phase === s
              ? mine ? "bg-amber-500 text-slate-900 font-bold" : "bg-slate-600 text-white font-bold"
              : "bg-slate-800 text-slate-500"
          }`}
        >
          {i + 1}. {PHASE_LABEL[s]}
        </div>
      ))}
    </div>
  );
}

/* ============ ゲーム画面（オンライン・CPU共通） ============ */
function GameScreen({ state, myId, room, apply, detail, setDetail, cpuDeck, onRetry, onMenu }) {
  const [sel, setSel] = useState(null); // 選択中の自軍ユニット
  const [pendingPlay, setPendingPlay] = useState(null); // 対象選択待ちのカード使用
  const [pendingAttack, setPendingAttack] = useState(null); // 月のゴブリンの追加対象待ち
  const [banner, setBanner] = useState(null);
  const [zone, setZone] = useState(null); // 生贄置き場の表示（"me" / "opp"）
  const lastTurnKey = useRef(null);
  const busy = useRef(false);

  const isCpu = !!cpuDeck;
  const oppLabel = isCpu ? "CPU" : "相手";

  // ターン切り替わり時のバナー
  useEffect(() => {
    if (!state || state.phase !== "play") return;
    const key = `${state.turnCount}-${state.turn}`;
    if (lastTurnKey.current === key) return;
    lastTurnKey.current = key;
    setSel(null);
    setPendingPlay(null);
    setPendingAttack(null);
    const mine = state.turn === myId;
    setBanner({ key, mine, text: mine ? "あなたのターンです" : `${oppLabel}のターンです` });
  }, [state?.turnCount, state?.turn, state?.phase, myId, oppLabel]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(t);
  }, [banner]);

  if (!state) return <div className="p-8">読み込み中...</div>;

  if (state.phase === "waiting") {
    return (
      <main className="min-h-screen p-8 max-w-lg mx-auto text-center">
        <h2 className="text-lg mb-4">相手を待っています</h2>
        <div className="text-5xl font-bold tracking-widest my-8 text-amber-400">{room}</div>
        <p className="text-sm text-slate-400">このIDを相手に伝えてください</p>
      </main>
    );
  }

  const oppId = E.otherId(state, myId);
  const me = state.players[myId];
  const opp = state.players[oppId];
  if (!me || !opp) return <div className="p-8">読み込み中...</div>;

  const isMyTurn = state.turn === myId;
  const phase = E.phaseOf(state);
  const mode = pendingPlay ? pendingPlay.kind : pendingAttack ? "goblin" : null;
  const candidates = pendingPlay ? pendingPlay.candidates : pendingAttack ? pendingAttack.candidates : [];
  const canMain = E.isActive(state, myId, "main") && !mode;

  /* ---- 状態を進める（連打での二重実行を防ぐ） ---- */
  async function run(next) {
    if (!next || busy.current) return;
    busy.current = true;
    try {
      await apply(next);
    } finally {
      busy.current = false;
    }
  }

  function cancelMode() {
    setPendingPlay(null);
    setPendingAttack(null);
  }

  /* ---- カード使用 ---- */
  function playCard(handIdx, haste) {
    if (!E.canPlay(state, myId, handIdx, haste)) return;
    const tk = E.playTargetKind(state, myId, handIdx);
    if (tk && tk.candidates.length) {
      setSel(null);
      setPendingPlay({ handIdx, haste, kind: tk.kind, candidates: tk.candidates });
      return;
    }
    run(E.playCard(state, myId, handIdx, { haste }));
  }

  /* ---- 攻撃 ---- */
  function attack(attackerUid, targetUid, toFace) {
    const ex = E.attackExtraCandidates(state, myId, attackerUid);
    if (ex) {
      setPendingAttack({ attackerUid, targetUid, toFace, candidates: ex });
      return;
    }
    run(E.attack(state, myId, attackerUid, { targetUid, toFace }));
  }

  /* ---- 対象選択の確定 ---- */
  function resolveTarget(targetUid) {
    if (!candidates.includes(targetUid)) return;
    if (pendingPlay) {
      const { handIdx, haste } = pendingPlay;
      setPendingPlay(null);
      run(E.playCard(state, myId, handIdx, { haste, target: targetUid }));
      return;
    }
    if (pendingAttack) {
      const { attackerUid, targetUid: t, toFace } = pendingAttack;
      setPendingAttack(null);
      run(E.attack(state, myId, attackerUid, { targetUid: t, toFace, extraTarget: targetUid }));
    }
  }

  /* ---- 攻撃可能判定 ---- */
  const ao = sel && canMain ? E.attackOptions(state, myId, sel) : null;
  const oppTargetable = (u) => {
    if (mode && mode !== "reduce1" && mode !== "reattack") return candidates.includes(u.uid);
    if (!mode && ao) return ao.units.includes(u.uid);
    return false;
  };

  const logText = (l) =>
    typeof l === "string" ? l : `${l.by === myId ? "自分" : oppLabel}｜${l.t}`;

  /* ============ 決着画面 ============ */
  if (state.phase === "end") {
    return (
      <main className="min-h-screen p-8 text-center max-w-lg mx-auto">
        <h1 className="text-4xl font-bold my-10">
          {state.winner === myId ? "勝利！" : "敗北..."}
        </h1>
        {isCpu && (
          <div className="text-sm text-slate-300 mb-4">
            CPUのデッキ: {cpuDeck.name}（Tier{cpuDeck.tier}）
          </div>
        )}
        <div className="text-xs text-slate-400 mb-6">
          {(state.log || []).slice(-5).map((l, i) => <div key={i}>{logText(l)}</div>)}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onRetry} className="w-full py-3 rounded-lg bg-amber-500 text-slate-900 font-bold">
            {isCpu ? "もう一度CPUと対戦" : "もう一度"}
          </button>
          {onMenu && (
            <button onClick={onMenu} className="w-full py-3 rounded-lg bg-slate-700">
              デッキ構築へ戻る
            </button>
          )}
        </div>
      </main>
    );
  }

  const zoneList = zone === "me" ? me.sacrifice : zone === "opp" ? opp.sacrifice : [];
  const canSac = E.canSacrifice(state, myId);

  return (
    <main className="min-h-screen max-w-lg mx-auto pb-28 text-sm">
      {/* 相手情報 + ターン表示 */}
      <div className="sticky top-0 z-10">
        <div className="p-3 bg-slate-800">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">
              {isCpu ? `CPU（${cpuDeck.name}・Tier${cpuDeck.tier}）` : "相手"}
            </span>
            <span className="text-xs">
              手札 {opp.hand.length} / 山 {opp.deck.length} /{" "}
              <button onClick={() => setZone("opp")} className="underline text-sky-400">
                生贄 {opp.sacrifice.length}
              </button>
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-2xl font-bold text-red-400">HP {opp.hp}</span>
            <span className="text-xs">コスト {opp.cost}/{opp.maxCost}</span>
          </div>
        </div>
        <div className={`px-3 py-1 text-center text-xs font-bold ${
          isMyTurn ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-300"
        }`}>
          ターン{state.turnCount}｜{isMyTurn ? "あなた" : oppLabel}の{PHASE_LABEL[phase]}フェーズ
        </div>
      </div>

      {/* 相手の場 */}
      <div className="p-2 min-h-[90px] border-b border-slate-700">
        <div className="text-[10px] text-slate-500 mb-1">{oppLabel}の場</div>
        <div className="flex gap-1 flex-wrap">
          {opp.field.map((u) => (
            <UnitCard
              key={u.uid} u={u} foe
              targetable={oppTargetable(u)}
              onTap={() => {
                if (mode) {
                  if (mode !== "reduce1" && mode !== "reattack") resolveTarget(u.uid);
                  return;
                }
                if (ao && ao.units.includes(u.uid)) {
                  attack(sel, u.uid, false);
                  setSel(null);
                } else {
                  setDetail({ unit: u });
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* 相手プレイヤーへの攻撃 */}
      {ao && (
        ao.face ? (
          <button
            onClick={() => { attack(sel, null, true); setSel(null); }}
            className="w-full py-2 bg-red-600 font-bold text-xs"
          >
            {oppLabel}プレイヤーを攻撃
          </button>
        ) : (
          <div className="w-full py-2 bg-slate-800 text-center text-[11px] text-slate-400">
            {ao.defender
              ? "ディフェンダーがいるため、ディフェンダーしか攻撃できません"
              : "このキャラは出たターン、相手プレイヤーを攻撃できません"}
          </div>
        )
      )}

      {/* ログ */}
      <div className="px-3 py-2 text-[10px] text-slate-400 h-20 overflow-y-auto bg-slate-900/50">
        {(state.log || []).slice(-6).map((l, i) => <div key={i}>{logText(l)}</div>)}
      </div>

      {/* 自分の場 */}
      <div className="p-2 min-h-[90px] border-t border-slate-700">
        <div className="text-[10px] text-slate-500 mb-1">自分の場</div>
        <div className="flex gap-1 flex-wrap">
          {me.field.map((u) => (
            <UnitCard
              key={u.uid} u={u} selected={sel === u.uid}
              targetable={mode === "reattack" && candidates.includes(u.uid)}
              ready={canMain && u.canAttack && !u.attacked}
              onTap={() => {
                if (mode) {
                  if (mode === "reattack") resolveTarget(u.uid);
                  return;
                }
                if (canMain && u.canAttack && !u.attacked) {
                  setSel(sel === u.uid ? null : u.uid);
                } else {
                  setDetail({ unit: u });
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* 自分情報 */}
      <div className="p-3 bg-slate-800">
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold text-emerald-400">HP {me.hp}</span>
          <span className="text-sm">コスト {me.cost}/{me.maxCost}</span>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          山 {me.deck.length} /{" "}
          <button onClick={() => setZone("me")} className="underline text-sky-400">
            生贄 {me.sacrifice.length}
          </button>
        </div>
      </div>

      {/* 手札 */}
      <div className="p-2">
        <div className="text-[10px] text-slate-500 mb-1">手札 ({me.hand.length})</div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {me.hand.map((h, i) => {
            const c = E.handInfo(h);
            if (!c) {
              return (
                <div key={h.uid} className="shrink-0 w-24 p-2 rounded-lg border-2 border-slate-800 bg-slate-900 opacity-50">
                  <div className="text-[9px] text-slate-400">トークン</div>
                  <div className="text-[10px] font-bold leading-tight mt-1">{h.name}</div>
                  <div className="text-[9px] text-slate-500">使用不可</div>
                </div>
              );
            }
            const cost = E.playCost(h);
            const can = !mode && E.canPlay(state, myId, i, false);
            const canHaste = !mode && E.canPlay(state, myId, i, true);
            const isCand = mode === "reduce1" && candidates.includes(h.uid);
            const bright = isCand || can || canSac;
            return (
              <div key={h.uid} className="shrink-0 w-24">
                <button
                  onClick={() => {
                    if (mode) {
                      if (mode === "reduce1") resolveTarget(h.uid);
                      return;
                    }
                    setDetail({ card: c, handIdx: i, cost, can, canHaste });
                  }}
                  className={`w-full p-2 rounded-lg text-left border-2 ${
                    isCand ? "border-sky-400 bg-slate-800"
                    : bright ? "border-slate-500 bg-slate-800" : "border-slate-800 bg-slate-900 opacity-50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[9px] ${factionText(c.faction)}`}>
                      {c.isToken ? "トークン" : FACTION_LABEL[c.faction]}
                    </span>
                    <span className="text-[11px] font-bold bg-slate-700 rounded px-1">{cost}</span>
                  </div>
                  <div className="text-[10px] font-bold leading-tight mt-1">{c.name}</div>
                  {c.stat && <div className="text-[9px] text-slate-400">STAT {c.stat}</div>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 操作 */}
      <div className="px-3 pb-3">
        <PhaseBar phase={phase} mine={isMyTurn} />

        {!isMyTurn && (
          <div className="w-full py-3 rounded-lg bg-slate-800 text-center text-slate-400">
            {isCpu ? "CPUが考えています…" : `相手の${PHASE_LABEL[phase]}フェーズ中です…`}
          </div>
        )}

        {isMyTurn && phase === "draw" && (
          <button
            onClick={() => run(E.drawStep(state, myId))}
            className="w-full py-3 rounded-lg bg-amber-500 text-slate-900 font-bold"
          >
            カードを引く（山札 {me.deck.length}枚）
          </button>
        )}

        {isMyTurn && phase === "main" && (
          <>
            <div className="text-[11px] text-slate-400 mb-2 text-center">
              カードの使用・攻撃ができます
            </div>
            <button
              disabled={!!mode}
              onClick={() => { setSel(null); run(E.toSacrifice(state, myId)); }}
              className="w-full py-3 rounded-lg bg-amber-500 text-slate-900 font-bold disabled:opacity-30"
            >
              メインフェーズ終了 → 生贄フェーズへ
            </button>
          </>
        )}

        {isMyTurn && phase === "sacrifice" && (
          <>
            <div className="text-[11px] text-slate-400 mb-2 text-center">
              {me.sacrificedThisTurn
                ? "このターンは生贄済みです"
                : me.maxCost >= E.MAX_COST
                  ? "コスト上限のため生贄できません"
                  : "手札をタップして生贄にできます（任意・1回まで）"}
            </div>
            <button
              onClick={() => run(E.endTurn(state, myId))}
              className="w-full py-3 rounded-lg bg-indigo-500 font-bold"
            >
              {me.sacrificedThisTurn ? "ターン終了" : "生贄せずにターン終了"}
            </button>
          </>
        )}
      </div>

      {/* 対象選択バー */}
      {mode && (
        <div className="fixed bottom-0 left-0 right-0 bg-sky-600 p-3 z-30">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <div className="flex-1 text-sm font-bold">{MODE_MSG[mode] || "対象を選んでください"}</div>
            <button onClick={cancelMode} className="px-3 py-2 rounded-lg bg-sky-800 text-xs font-bold">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ターン切り替えバナー */}
      {banner && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className={`px-8 py-5 rounded-2xl text-2xl font-bold shadow-2xl ${
            banner.mine ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-white"
          }`}>
            {banner.text}
          </div>
        </div>
      )}

      {/* 生贄置き場の一覧 */}
      {zone && (
        <div onClick={() => setZone(null)} className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-800 rounded-t-2xl p-5 w-full max-w-lg border-t border-slate-600"
          >
            <div className="text-sm font-bold mb-3">
              {zone === "me" ? "自分" : oppLabel}の生贄置き場（{zoneList.length}枚）
            </div>
            <div className="max-h-72 overflow-y-auto">
              {zoneList.length === 0 ? (
                <div className="text-xs text-slate-400">まだありません</div>
              ) : (
                zoneList.map((s, i) => {
                  const c = E.handInfo(s);
                  return (
                    <div key={i} className="flex justify-between py-2 border-b border-slate-700 text-sm">
                      <span className={c ? factionText(c.faction) : ""}>
                        {c ? c.name : s.name || "不明"}
                        {c?.isToken && <span className="text-slate-400 text-xs">（トークン）</span>}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {c ? `${c.type === "magic" ? "マジック" : "キャラ"} / コスト${c.cost}` : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={() => setZone(null)} className="w-full mt-3 py-2 rounded-lg bg-slate-700 text-sm">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 詳細/アクションモーダル */}
      {detail && (
        <ActionModal
          detail={detail}
          phase={phase}
          isMyTurn={isMyTurn}
          onClose={() => setDetail(null)}
          onPlay={(haste) => {
            const idx = detail.handIdx;
            setDetail(null);
            playCard(idx, haste);
          }}
          onSac={() => {
            const idx = detail.handIdx;
            setDetail(null);
            run(E.sacrifice(state, myId, idx));
          }}
          canSac={canSac}
        />
      )}
    </main>
  );
}

/* ============ ユニット表示 ============ */
function UnitCard({ u, foe, selected, targetable, ready, onTap }) {
  return (
    <button
      onClick={onTap}
      className={`w-[68px] p-1 rounded-lg border-2 text-left ${
        selected ? "border-amber-400 bg-amber-950"
        : targetable ? "border-sky-400 bg-slate-800"
        : ready ? "border-emerald-500 bg-slate-800"
        : foe ? "border-red-900 bg-slate-800" : "border-slate-600 bg-slate-800"
      } ${u.attacked ? "opacity-50" : ""}`}
    >
      <div className="text-[9px] leading-tight font-bold h-6 overflow-hidden">{u.name}</div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-sm font-bold">{u.stat}</span>
        <div className="flex gap-0.5">
          {u.keywords?.includes("defender") && <span className="text-[8px] bg-blue-600 px-1 rounded">守</span>}
          {u.keywords?.includes("invincible") && <span className="text-[8px] bg-yellow-600 px-1 rounded">無</span>}
          {u.keywords?.includes("untargetable_by_attack") && <span className="text-[8px] bg-purple-600 px-1 rounded">避</span>}
          {u.noFaceAttack && <span className="text-[8px] bg-red-800 px-1 rounded">突</span>}
        </div>
      </div>
    </button>
  );
}

/* ============ アクションモーダル ============ */
function ActionModal({ detail, phase, isMyTurn, onClose, onPlay, onSac, canSac }) {
  const u = detail.unit;
  const c = detail.card || (u ? E.unitInfo(u) : null);
  const isHand = detail.handIdx !== undefined;

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-800 rounded-t-2xl p-5 w-full max-w-lg border-t border-slate-600"
      >
        {c ? (
          <>
            <div className={`text-xs mb-1 ${factionText(c.faction)}`}>
              {FACTION_LABEL[c.faction]} / コスト {isHand ? detail.cost : c.cost} /{" "}
              {c.isToken ? "トークン" : c.type === "magic" ? "マジック" : "キャラクター"}
            </div>
            <div className="text-lg font-bold mb-1">{c.name}</div>
            {c.stat && (
              <div className="text-sm text-slate-300 mb-2">
                スタッツ {u ? u.stat : c.stat}
                {u && u.stat !== c.stat && <span className="text-slate-500"> (元 {c.stat})</span>}
              </div>
            )}
            <p className="text-sm leading-relaxed text-slate-200 mb-4">{c.text}</p>
          </>
        ) : (
          <>
            <div className="text-xs mb-1 text-slate-400">トークン</div>
            <div className="text-lg font-bold mb-1">{u?.name}</div>
            <div className="text-sm text-slate-300 mb-4">スタッツ {u?.stat}</div>
          </>
        )}

        {isHand && isMyTurn && phase === "main" && (
          <div className="flex flex-col gap-2">
            <button
              disabled={!detail.can}
              onClick={() => onPlay(false)}
              className="w-full py-3 rounded-lg bg-amber-500 text-slate-900 font-bold disabled:opacity-30"
            >
              使用（コスト {detail.cost}）
            </button>
            {detail.canHaste && (
              <button onClick={() => onPlay(true)} className="w-full py-3 rounded-lg bg-red-500 font-bold">
                即時召喚（コスト {detail.cost + E.HASTE_EXTRA}）
              </button>
            )}
          </div>
        )}

        {isHand && isMyTurn && phase === "sacrifice" && (
          <button
            disabled={!canSac}
            onClick={onSac}
            className="w-full py-3 rounded-lg bg-indigo-600 font-bold disabled:opacity-30"
          >
            生贄にする（コスト上限+1・HP+{c?.cost || 0}・1ドロー）
          </button>
        )}

        {isHand && isMyTurn && phase === "draw" && (
          <div className="text-xs text-slate-400 text-center">先にカードを引いてください</div>
        )}

        <button onClick={onClose} className="w-full mt-3 py-2 rounded-lg bg-slate-700 text-sm">
          閉じる
        </button>
      </div>
    </div>
  );
}
