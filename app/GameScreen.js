"use client";

// 対戦画面まるごとをまとめたファイル
// ・GameScreen（対戦画面本体：オンライン・CPU共通）
// ・CpuGame（CPU戦：CPUの手番を自動で進める）
// ・ActionModal（カードをタップしたときの操作画面）／DetailModal（カード詳細：デッキ構築でも使う）
// ・ReplayOverlay（相手の行動の再生パネル）／RetireConfirm（リタイア確認）
// ・墓地・生贄置き場の一覧は GameScreen の中にある
// ・CPU_ID / YOU_ID（CPU戦でのプレイヤーの名前）は page.js でも使うので export している
// ※ app/page.js から中身をそのまま移したもの

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { addDoc, collection } from "firebase/firestore";
import { FACTION_LABEL, getCard, typeLabel, abilityShort } from "../lib/cards";
import * as E from "../lib/engine";
import { cpuStep } from "../lib/cpu";
import RankResult from "./RankResult";
import { recordMatchStats } from "../lib/statsStore";
import {
  PHASE_LABEL, fxClass, cardStatus, StatusLines, AbilityRow, PhaseBar, ManaBar, EmptySlots, UnitCard,
} from "./GameParts";
import {
  TRIVIAL_LOG, currentUid, recordStreak, gameKey,
  newEntries, stampLog, maxSeq, replayMs, lastOppActions, diffBoards,
} from "../lib/online";

/* ============ 定数 ============ */
export const CPU_ID = "cpu";
export const YOU_ID = "you";
const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7); // 今動いているバージョン
const REPORT_HISTORY = 10; // 不具合報告に含める「直前の状態」の数
// スマホのブラウザで、背景ぼかし（backdrop-filter）の上の数字が描き直されないことがあるため、
// HP・コストを表示する帯ではぼかしを切る
const NO_BLUR = { backdropFilter: "none", WebkitBackdropFilter: "none" };

const MODE_MSG = {
  damage3: "4ダメージを与える相手キャラを選んでください",
  destroy: "破壊する相手キャラを選んでください",
  destroyDraw: "破壊する相手キャラを選んでください",
  crest: "4ダメージを与える相手キャラを選んでください",
  bounce: "手札に戻す相手キャラ（コスト5以下）を選んでください",
  goblin: "スタッツ-1する相手キャラを選んでください",
  reduce1: "コストを-1する手札を選んでください",
  reattack: "再攻撃させる攻撃済みの自軍キャラを選んでください",
  damage6: "6ダメージを与える相手キャラを選んでください",
  ownUnit: "手札に戻す自分のキャラ（元のコスト4以下）を選んでください",
  ownHand: "場に出す手札のキャラ（元のコスト5以下）を選んでください",
};

// 対象が「自分の場」のモード / 「自分の手札」のモード
const OWN_UNIT_MODES = ["reattack", "ownUnit"];
const OWN_HAND_MODES = ["reduce1", "ownHand"];
const isOwnMode = (m) => OWN_UNIT_MODES.includes(m) || OWN_HAND_MODES.includes(m);

/* ============ CPU戦（CPUの手番を自動で進める） ============ */
export function CpuGame({ state, setState, cpuDeck, detail, setDetail, onRematch, onTitle, onRetire, rankView }) {
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (!state || state.phase !== "play" || state.turn !== CPU_ID) return;
    if (replaying) return; // 行動の表示が終わるまで待つ
    // ドロー（ターン開始）は長めに待ってバナーを見せる
    const delay = E.phaseOf(state) === "draw" ? 1400 : 850;
    const t = setTimeout(() => {
      const next = cpuStep(state, CPU_ID, cpuDeck?.style);
      if (next) setState(stampLog(next, state));
    }, delay);
    return () => clearTimeout(t);
  }, [state, cpuDeck, setState, replaying]);

  return (
    <GameScreen
      state={state}
      myId={YOU_ID}
      room={null}
      apply={(next) => setState(next)}
      detail={detail}
      setDetail={setDetail}
      cpuDeck={cpuDeck}
      onRematch={onRematch}
      onTitle={onTitle}
      onRetire={onRetire}
      onReplayingChange={setReplaying}
      rankView={rankView}
    />
  );
}

/* ============ カード詳細モーダル（デッキ構築用） ============ */
export function DetailModal({ card, onClose }) {
  const c = card;
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/75 flex items-center justify-center p-6 z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sme-modal ${fxClass(c.faction)} rounded-2xl p-5 max-w-sm w-full`}
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

/* ============ リタイア確認 ============ */
function RetireConfirm({ isCpu, onYes, onNo }) {
  return (
    <div onClick={onNo} className="fixed inset-0 bg-black/75 flex items-center justify-center p-6 z-[60]">
      <div onClick={(e) => e.stopPropagation()} className="sme-modal rounded-2xl p-5 max-w-xs w-full text-center">
        <div className="sme-heading text-lg mb-2">リタイアしますか？</div>
        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          {isCpu
            ? "この対戦は終了し、タイトル画面に戻ります。"
            : "相手の勝利となり、部屋を出てタイトル画面に戻ります。"}
        </p>
        <button onClick={onYes} className="sme-btn sme-btn-danger mb-2">
          リタイアする
        </button>
        <button onClick={onNo} className="sme-btn sme-btn-ghost sme-btn-sm">
          対戦を続ける
        </button>
      </div>
    </div>
  );
}

/* ============ ゲーム画面（オンライン・CPU共通） ============ */
export function GameScreen({
  state, myId, room, apply, detail, setDetail, cpuDeck,
  onRematch, rematchNote, onTitle, onRetire, onReplayingChange, onRefresh, rankView,
}) {
  const [sel, setSel] = useState(null); // 選択中の自軍ユニット
  const [pendingPlay, setPendingPlay] = useState(null); // 対象選択待ちのカード使用
  const [pendingAttack, setPendingAttack] = useState(null); // 月のゴブリンの追加対象待ち
  const [banner, setBanner] = useState(null);
  const [zone, setZone] = useState(null); // 置き場の表示（"me" / "opp" = 生贄置き場、"meGrave" / "oppGrave" = 墓地）
  const [graveSort, setGraveSort] = useState("new"); // 墓地の並び順（"new" = 新しい順 / "cost" = コストの大きい順）
  const [queue, setQueue] = useState([]); // 相手の行動の再生待ち
  const [showLog, setShowLog] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastTurnKey = useRef(null);
  const busy = useRef(false);
  const prevRef = useRef(null);
  const logRef = useRef(null);
  const historyRef = useRef([]); // 不具合報告用：直前の状態の記録
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState("");

  const isCpu = !!cpuDeck;

  // 決着したら連勝記録を更新（CPU戦とルームマッチは別々）
  const [streak, setStreak] = useState(null);
  const endKey = state && state.phase === "end" ? gameKey(state, isCpu ? null : room) : null;
  useEffect(() => {
    if (!endKey || !state || !state.winner) return;
        // マイページ用の記録（ランク戦・ルームマッチとも記録する）
    const mySel = state.players && state.players[myId] ? state.players[myId].selection : null;
    if (state.starpick) return; // スターピックの記録は StarPickPage.js でする（連勝記録も別）
    recordMatchStats(currentUid, endKey, isCpu ? "cpu" : "room", mySel, state.winner === myId);
    if (isCpu && state.ranked) return; // ランク戦の連勝はランクのデータで管理する
    setStreak(recordStreak(isCpu ? "cpu" : "room", endKey, state.winner === myId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey]);

  // 状態が変わるたびに記録（新しい順ではなく古い順。最大 REPORT_HISTORY 件）
  useEffect(() => {
    if (!state) return;
    try {
      const json = JSON.stringify(state);
      const h = historyRef.current;
      if (h[h.length - 1] !== json) {
        historyRef.current = [...h, json].slice(-REPORT_HISTORY);
      }
    } catch {
      // 記録できなくてもゲームは続ける
    }
  }, [state]);

  // 不具合報告を Firebase（reports コレクション）に保存
  async function sendReport() {
    if (reportBusy) return;
    setReportBusy(true);
    setReportMsg("");
    try {
      const ref = await addDoc(collection(db, "reports"), {
        createdAt: new Date().toISOString(),
        version: APP_VERSION,
        mode: isCpu ? "cpu" : "room",
        room: room || null,
        myId: myId || null,
        cpuDeck: cpuDeck ? cpuDeck.name || null : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        note: reportNote || "",
        state: JSON.stringify(state),
        history: historyRef.current,
      });
      setReportMsg(`送信しました（報告ID: ${ref.id}）`);
      setReportNote("");
    } catch (e) {
      setReportMsg(`送信に失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
    } finally {
      setReportBusy(false);
    }
  }
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
    setBanner({ key, mine, text: mine ? "あなたのターン" : `${oppLabel}のターン` });
  }, [state?.turnCount, state?.turn, state?.phase, myId, oppLabel]);

  // バナーは相手の行動の再生がすべて終わってから表示
  useEffect(() => {
    if (!banner || queue.length) return;
    const t = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(t);
  }, [banner, queue.length]);

  // 相手の新しい行動を検出して再生待ちに追加
  useEffect(() => {
    if (!state || !state.players) return;
    const prev = prevRef.current;
    const curLog = state.log || [];
    const curSeq = maxSeq(curLog);
    prevRef.current = { log: curLog, players: state.players, seq: curSeq };
    if (!prev || state.phase === "waiting" || state.phase === "lobby") return;
    const oppId = E.otherId(state, myId);
    if (!oppId) return;
    // 通し番号があれば番号で、無ければ（古いルーム）従来の突き合わせで判定
    const fresh =
      curSeq > 0
        ? curLog.filter((l) => l && typeof l === "object" && (l.n || 0) > prev.seq)
        : newEntries(prev.log, curLog);
    const lines = fresh
      .filter((l) => typeof l !== "string" && l.by !== myId)
      .map((l) => l.t)
      .filter((t) => !TRIVIAL_LOG.test(t));
    if (!lines.length) return;
    const changes = diffBoards(prev.players, state.players, myId, oppId, lines);
    setQueue((q) => [...q, { id: E.uid(), lines, changes }]);
  }, [state, myId]);

  const current = queue[0] || null;

  // 再生中の行動を自動で次へ
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), replayMs(current));
    return () => clearTimeout(t);
  }, [current?.id]);

  // CPU戦：再生中はCPUを止める
  useEffect(() => {
    if (onReplayingChange) onReplayingChange(queue.length > 0);
  }, [queue.length, onReplayingChange]);

  // ログを常に最新までスクロール
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state?.log]);

  if (!state) {
    return (
      <div className="p-8 text-center">
        <div className="sme-label mb-4">LOADING...</div>
        <button onClick={onTitle} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto mx-auto">
          タイトルへ戻る
        </button>
      </div>
    );
  }

  if (state.phase === "waiting") {
    return (
      <main className="min-h-screen p-8 max-w-lg mx-auto text-center flex flex-col justify-center">
        <h2 className="sme-heading text-lg mb-6">対戦相手を待っています</h2>
        <div className="sme-panel p-6">
          <div className="sme-label mb-2">ROOM ID</div>
          <div className="sme-title text-5xl tracking-[0.3em] my-4">{room}</div>
          <p className="text-xs text-slate-400">このIDを相手に伝えてください</p>
        </div>
        <button onClick={onTitle} className="sme-btn sme-btn-ghost mt-6">
          キャンセルしてタイトルへ
        </button>
      </main>
    );
  }

  const oppId = E.otherId(state, myId);
  const me = state.players ? state.players[myId] : null;
  const opp = state.players && oppId ? state.players[oppId] : null;

  /* ---- ログ表示 ---- */
  const renderLog = (l, i) => {
    if (typeof l === "string") return <div key={i} className="text-slate-500">{l}</div>;
    const mine = l.by === myId;
    return (
      <div key={i} className={mine ? "text-emerald-300" : "text-rose-300"}>
        <span className={`inline-block text-[9px] px-1 mr-1 rounded ${mine ? "bg-emerald-900" : "bg-rose-900"}`}>
          {mine ? "自分" : oppLabel}
        </span>
        {l.t}
      </div>
    );
  };

  /* ============ 決着画面 ============ */
  if (state.phase === "end") {
    const win = state.winner === myId;
    return (
      <main
        className={`min-h-screen text-center max-w-lg mx-auto flex flex-col ${
          isCpu && state.ranked ? "px-8 pt-10 pb-8 justify-start" : "p-8 justify-center"
        }`}
      >
        {isCpu && state.ranked ? (
          <RankResult
            win={win}
            result={rankView && rankView.gameId === state.gameId ? rankView.result : null}
            error={rankView && rankView.gameId === state.gameId ? rankView.error : null}
          />
        ) : (
          <>
            <h1 className={`result-title ${win ? "win" : "lose"} my-6`}>
              {win ? "VICTORY" : "DEFEAT"}
            </h1>
            <div className="sme-heading text-lg mb-6">{win ? "勝利！" : "敗北..."}</div>
          </>
        )}
        {win && streak && streak.cur > 0 && (
          <div className="sme-panel mb-6 p-3">
            <div className="text-xs text-slate-400 mb-1">{isCpu ? "CPU戦" : "ルームマッチ"}</div>
            <div className="text-2xl font-bold text-amber-300">🔥 {streak.cur}連勝中！</div>
            <div className="text-xs text-slate-300 mt-1">
              {streak.isNewBest ? "最高記録更新！" : `最高記録: ${streak.best}連勝`}
            </div>
          </div>
        )}
        {isCpu && !cpuDeck.starpick && (
          <div className="text-sm text-slate-300 mb-4">
            CPUのデッキ: {cpuDeck.name}（Tier{cpuDeck.tier}）
          </div>
        )}
        {isCpu && cpuDeck.starpick && (
          <div className="text-sm text-slate-300 mb-4">スターピック {cpuDeck.name}</div>
        )}
        <div className="sme-panel text-xs mb-6 text-left p-3 space-y-0.5">
          {(state.log || []).slice(-8).map(renderLog)}
        </div>
        {rematchNote && (
          <div className="sme-panel text-xs mb-4 p-3 text-amber-200">{rematchNote}</div>
        )}
        <div className="flex flex-col gap-2">
          {onRematch && (
            <button onClick={onRematch} className="sme-btn sme-btn-sun sme-glow">
              {isCpu && cpuDeck.starpick ? "次へ" : "再戦する"}
            </button>
          )}
          {onTitle && (
            <button onClick={onTitle} className="sme-btn sme-btn-ghost">
              {isCpu ? "タイトルへ戻る" : "退室してタイトルへ"}
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!me || !opp) {
    return (
      <div className="p-8 text-center">
        <div className="sme-label mb-4">LOADING...</div>
        <button onClick={onTitle} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto mx-auto">
          タイトルへ戻る
        </button>
      </div>
    );
  }

  const isMyTurn = state.turn === myId;
  const phase = E.phaseOf(state);
  const mode = pendingPlay ? pendingPlay.kind : pendingAttack ? "goblin" : null;
  const candidates = pendingPlay ? pendingPlay.candidates : pendingAttack ? pendingAttack.candidates : [];
  const canMain = E.isActive(state, myId, "main") && !mode;
  const lastOpp = lastOppActions(state.log, myId);

  /* ---- 状態を進める（連打での二重実行を防ぐ） ---- */
  async function run(next) {
    if (!next || busy.current) return;
    busy.current = true;
    try {
      await apply(stampLog(next, state));
    } finally {
      busy.current = false;
    }
  }

  /* ---- 手動で最新の状態を取得 ---- */
  async function manualRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
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
    if (mode && !isOwnMode(mode)) return candidates.includes(u.uid);
    if (!mode && ao) return ao.units.includes(u.uid);
    return false;
  };

  // 再生中の行動で光らせるユニット
  const flashIds = current
    ? current.changes.filter((c) => c.kind === "unit" || c.kind === "new").map((c) => c.uid)
    : [];

  // 置き場の一覧（生贄置き場 or 墓地）
  const isGraveZone = zone === "meGrave" || zone === "oppGrave";
  const zoneOwnerIsMe = zone === "me" || zone === "meGrave";
  const zoneTitle = `${zoneOwnerIsMe ? "自分" : oppLabel}の${isGraveZone ? "墓地" : "生贄置き場"}`;
  const zoneList = (() => {
    if (!zone) return [];
    if (!isGraveZone) return (zoneOwnerIsMe ? me : opp).sacrifice || [];
    const list = E.graveCardsOf(zoneOwnerIsMe ? me : opp); // 古い順
    if (graveSort === "cost") return [...list].sort((a, b) => (b.info?.cost ?? -1) - (a.info?.cost ?? -1));
    return [...list].reverse();
  })();
  const canSac = E.canSacrifice(state, myId);

  return (
    <main className={`min-h-screen max-w-lg mx-auto text-sm ${mode ? "pb-20" : "pb-4"}`}>
      {/* 相手情報 + ターン表示 */}
      <div className="sticky top-0 z-10">
        <div className="sme-panel sme-panel-opp !rounded-none !border-x-0 !border-t-0 px-3 py-2" style={NO_BLUR}>
          <div className="flex items-center gap-3">
            <div key={`opp-hp-${opp.hp}`} className={`hp-orb opp ${opp.hp <= 3 ? "is-danger" : ""}`}>{opp.hp}</div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-rose-200 truncate">
                  {isCpu ? (cpuDeck.starpick ? `CPU（${cpuDeck.name}）` : `CPU（${cpuDeck.name}・T${cpuDeck.tier}）`) : "相手"}
                </span>
                <span className="text-[11px] font-bold text-indigo-200 shrink-0 ml-2">
                  コスト {opp.cost}/{opp.maxCost}
                </span>
              </div>
              <div className="mt-0.5"><ManaBar cost={opp.cost} max={opp.maxCost} /></div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                手札 {opp.hand.length} ・ 山 {opp.deck.length} ・{" "}
                <button onClick={() => setZone("opp")} className="underline text-sky-300">
                  生贄 {opp.sacrifice.length}
                </button>{" "}
                ・{" "}
                <button onClick={() => setZone("oppGrave")} className="underline text-sky-300">
                  墓地 {(opp.grave || []).length}
                </button>
              </div>
              <AbilityRow player={opp} onTap={(a) => setDetail({ ability: a, mine: false })} />
            </div>
          </div>
        </div>
        <div className={`turn-strip relative ${isMyTurn ? "mine" : "theirs"}`}>
          TURN {state.turnCount}｜{isMyTurn ? "あなた" : oppLabel}の{PHASE_LABEL[phase]}フェーズ
          <button
            onClick={() => setConfirmRetire(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded bg-black/50 border border-white/30 text-white"
          >
            リタイア
          </button>
        </div>
      </div>

      {/* 相手の場 */}
      <div className="px-2 py-1">
        <div className="sme-label mb-0.5">{oppLabel}の場（右上の i で能力確認）</div>
        <div className="flex gap-1 flex-wrap justify-center">
          {opp.field.map((u) => (
            <UnitCard
              key={u.uid} u={u} foe
              flash={flashIds.includes(u.uid)}
              targetable={oppTargetable(u)}
              sick={!u.attacked && !u.canAttack}
              onInfo={() => setDetail({ unit: u })}
              onTap={() => {
                if (mode) {
                  if (!isOwnMode(mode)) resolveTarget(u.uid);
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
          <EmptySlots count={E.MAX_FIELD - opp.field.length} />
        </div>
      </div>

      {/* 相手プレイヤーへの攻撃 */}
      {ao && (
        <div className="px-2 pb-1">
          {ao.face ? (
            <button
              onClick={() => { attack(sel, null, true); setSel(null); }}
              className="sme-btn sme-btn-danger sme-btn-sm sme-glow"
            >
              ⚔ {oppLabel}プレイヤーにダイレクト
            </button>
          ) : (
            <div className="sme-panel py-1.5 text-center text-[11px] text-slate-400">
                 {ao.defender
                   ? "ディフェンダーがいるため、ディフェンダーしか攻撃できません"
                   : E.hasKw(me.field.find((x) => x.uid === sel), "no_attack_player")
                   ? "このキャラはダイレクト不可です"
                   : "このキャラは出たターン、ダイレクトできません（ファストファイト）"}
            </div>
          )}
        </div>
      )}

      {/* ログ */}
      <div className="relative sme-log">
        <div ref={logRef} className="px-3 py-1 text-[10px] h-16 overflow-y-auto space-y-0.5">
          {(state.log || []).slice(-10).map(renderLog)}
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="absolute top-1 right-2 text-[10px] px-2 py-0.5 rounded bg-indigo-900/80 border border-indigo-400/40 text-indigo-100"
        >
          全ログ
        </button>
      </div>

      {/* 自分の場 */}
      <div className="px-2 pt-1 pb-6">
        <div className="sme-label mb-0.5">自分の場</div>
        <div className="flex gap-1 flex-wrap justify-center">
          {me.field.map((u) => (
            <UnitCard
              key={u.uid} u={u} selected={sel === u.uid}
              flash={flashIds.includes(u.uid)}
              targetable={OWN_UNIT_MODES.includes(mode) && candidates.includes(u.uid)}
              ready={canMain && u.canAttack && !u.attacked}
              sick={!u.attacked && !u.canAttack}
              onInfo={() => setDetail({ unit: u })}
              onTap={() => {
                if (mode) {
                  if (OWN_UNIT_MODES.includes(mode)) resolveTarget(u.uid);
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
          <EmptySlots count={E.MAX_FIELD - me.field.length} />
        </div>
      </div>

      {/* 自分情報 */}
      <div className="sme-panel sme-panel-me !rounded-none !border-x-0 px-3 py-2" style={NO_BLUR}>
        <div className="flex items-center gap-3">
          <div key={`me-hp-${me.hp}`} className={`hp-orb me ${me.hp <= 3 ? "is-danger" : ""}`}>{me.hp}</div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-200">あなた</span>
              <span className="text-[11px] font-bold text-indigo-200">
                コスト {me.cost}/{me.maxCost}
              </span>
            </div>
            <div className="mt-0.5"><ManaBar cost={me.cost} max={me.maxCost} /></div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              山 {me.deck.length} ・{" "}
              <button onClick={() => setZone("me")} className="underline text-sky-300">
                生贄 {me.sacrifice.length}
              </button>{" "}
              ・{" "}
              <button onClick={() => setZone("meGrave")} className="underline text-sky-300">
                墓地 {(me.grave || []).length}
              </button>
            </div>
            <AbilityRow player={me} onTap={(a) => setDetail({ ability: a, mine: true })} />
          </div>
        </div>
      </div>

      {/* 手札 */}
      <div className="px-2 pt-1">
        <div className="sme-label">手札 ({me.hand.length})</div>
        <div className="flex gap-2 overflow-x-auto pt-2 pb-2 px-1">
          {me.hand.map((h, i) => {
            const c = E.handInfo(h);
            if (!c) {
              return (
                <div key={h.uid} className="hand-card fx-none is-dim shrink-0">
                  <div className="text-[9px] text-slate-400">トークン</div>
                  <div className="text-[10px] font-bold leading-tight mt-1">{h.name}</div>
                  <div className="text-[9px] text-slate-500">使用不可</div>
                </div>
              );
            }
            const cost = E.playCost(h);
            const can = !mode && E.canPlay(state, myId, i, false);
            const canHaste = !mode && E.canPlay(state, myId, i, true);
            const isCand = OWN_HAND_MODES.includes(mode) && candidates.includes(h.uid);
            const bright = isCand || can || canSac;
            const look = isCand ? "is-target" : bright ? "is-playable" : "is-dim";
            return (
              <button
                key={h.uid}
                onClick={() => {
                  if (mode) {
                    if (OWN_HAND_MODES.includes(mode)) resolveTarget(h.uid);
                    return;
                  }
                  setDetail({ card: c, handIdx: i, cost, can, canHaste });
                }}
                className={`hand-card ${fxClass(c.faction)} ${look} shrink-0`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-bold fx-text">
                    {c.isToken ? "トークン" : FACTION_LABEL[c.faction]}
                  </span>
                  <span className={`cost-gem ${cost < c.cost ? "is-down" : ""}`}>
                    <span>{cost}</span>
                  </span>
                </div>
                <div className="text-[11px] font-bold leading-tight mt-1 text-white">{c.name}</div>
                <div className="mt-1">
                  {c.type === "magic" ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-900/80 border border-sky-400/40 text-sky-100">
                      MAGIC
                    </span>
                  ) : c.type === "ability" ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/80 border border-cyan-400/40 text-cyan-100">
                      ABILITY {abilityShort(c)}
                    </span>
                  ) : (
                    c.stat && <span className="unit-stat">{c.stat}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 操作 */}
      <div className="px-3 pb-2">
        <PhaseBar phase={phase} mine={isMyTurn} />

        {!isMyTurn && (
          <div className="sme-panel py-2 px-3 text-xs flex items-center gap-2">
            <span className="flex-1 text-center text-slate-300 animate-pulse">
              {isCpu ? "CPUが考えています…" : `相手の${PHASE_LABEL[phase]}フェーズ中です…`}
            </span>
            {onRefresh && (
              <button
                onClick={manualRefresh}
                className="shrink-0 text-[10px] px-2 py-1 rounded bg-indigo-900/80 border border-indigo-400/40 text-indigo-100"
              >
                {refreshing ? "取得中…" : "↻ 最新にする"}
              </button>
            )}
          </div>
        )}

        {isMyTurn && phase === "draw" && (
          <button onClick={() => run(E.drawStep(state, myId))} className="sme-btn sme-btn-sun sme-glow !py-2.5">
            カードを引く（山札 {me.deck.length}枚）
          </button>
        )}

        {isMyTurn && phase === "main" && (
          <button
            disabled={!!mode}
            onClick={() => { setSel(null); run(E.toSacrifice(state, myId)); }}
            className="sme-btn sme-btn-sun !py-2.5"
          >
            メインフェーズ終了 → 生贄フェーズへ
          </button>
        )}

        {isMyTurn && phase === "sacrifice" && (
          <>
            <div className="text-[11px] text-slate-400 mb-1 text-center">
              {me.sacrificedThisTurn
                ? "このターンは生贄済みです"
                : me.maxCost >= E.MAX_COST
                  ? "コスト上限のため生贄できません"
                  : "手札をタップして生贄にできます（任意・1回まで）"}
            </div>
            <button onClick={() => run(E.endTurn(state, myId))} className="sme-btn sme-btn-moon !py-2.5">
              {me.sacrificedThisTurn ? "ターン終了" : "生贄せずにターン終了"}
            </button>
          </>
        )}
      </div>

      {/* 対象選択バー */}
      {mode && (
        <div
          className="fixed bottom-0 left-0 right-0 p-3 z-30 border-t border-sky-300/50"
          style={{ background: "linear-gradient(160deg, #1f5a99, #0a2340)", boxShadow: "0 -6px 24px rgba(45,110,180,0.5)" }}
        >
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <div className="flex-1 text-sm font-bold text-sky-50">{MODE_MSG[mode] || "対象を選んでください"}</div>
            <button onClick={cancelMode} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 相手の行動の再生 */}
      {current && (
        <ReplayOverlay
          item={current}
          rest={queue.length - 1}
          oppLabel={oppLabel}
          onNext={() => setQueue((q) => q.slice(1))}
          onSkipAll={() => setQueue([])}
        />
      )}

      {/* ターン切り替えバナー（相手の行動の再生が終わってから） */}
      {banner && !current && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div key={banner.key} className={`turn-banner ${banner.mine ? "mine" : "theirs"}`}>
            {banner.text}
          </div>
        </div>
      )}

      {/* 全ログ */}
      {showLog && (
        <div onClick={() => setShowLog(false)} className="fixed inset-0 bg-black/75 flex items-end justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="sme-sheet rounded-t-2xl p-5 w-full max-w-lg">
            <div className="sme-heading text-sm mb-3">対戦ログ（新しいものが下）</div>
            <div className="max-h-96 overflow-y-auto text-xs space-y-1">
              {(state.log || []).map(renderLog)}
            </div>

            {/* 不具合報告 */}
            {!reportOpen ? (
              <button
                onClick={() => { setReportOpen(true); setReportMsg(""); }}
                className="sme-btn sme-btn-ghost sme-btn-sm mt-3"
              >
                不具合を報告
              </button>
            ) : (
              <div className="mt-3 border border-white/15 rounded-lg p-3">
                <div className="text-xs text-slate-300 mb-2">
                  今の盤面・ログと、直前{REPORT_HISTORY}回分の状態を送ります。何が起きたか書いてください（任意）。
                </div>
                <textarea
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  rows={3}
                  placeholder="例：カミラのHP+ログは出たのにアステールが残っている"
                  className="w-full text-sm text-slate-900 rounded p-2"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={sendReport}
                    disabled={reportBusy}
                    className="sme-btn sme-btn-sm"
                  >
                    {reportBusy ? "送信中..." : "送信する"}
                  </button>
                  <button
                    onClick={() => { setReportOpen(false); setReportMsg(""); }}
                    className="sme-btn sme-btn-ghost sme-btn-sm"
                  >
                    やめる
                  </button>
                </div>
              </div>
            )}
            {reportMsg && <div className="text-xs text-amber-300 mt-2 break-all">{reportMsg}</div>}

            <div className="text-[10px] text-slate-500 mt-3">ver: {APP_VERSION}</div>
            <button onClick={() => setShowLog(false)} className="sme-btn sme-btn-ghost sme-btn-sm mt-2">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 生贄置き場・墓地の一覧 */}
      {zone && (
        <div onClick={() => setZone(null)} className="fixed inset-0 bg-black/75 flex items-end justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="sme-sheet rounded-t-2xl p-5 w-full max-w-lg">
            <div className="flex justify-between items-center mb-2">
              <div className="sme-heading text-sm">
                {zoneTitle}（{zoneList.length}枚）
              </div>
              {/* 自分⇔相手 の切り替え */}
              <button
                onClick={() =>
                  setZone(isGraveZone ? (zoneOwnerIsMe ? "oppGrave" : "meGrave") : (zoneOwnerIsMe ? "opp" : "me"))
                }
                className="text-[11px] underline text-sky-300"
              >
                {zoneOwnerIsMe ? oppLabel : "自分"}の{isGraveZone ? "墓地" : "生贄置き場"}を見る
              </button>
            </div>
            {/* 生贄置き場⇔墓地 の切り替え・墓地の並び順 */}
            <div className="flex gap-1 mb-3 text-[11px]">
              <button
                onClick={() => setZone(zoneOwnerIsMe ? "me" : "opp")}
                className={`px-2 py-0.5 rounded border ${!isGraveZone ? "bg-sky-600 border-sky-400 text-white" : "border-white/30 text-slate-300"}`}
              >
                生贄置き場
              </button>
              <button
                onClick={() => setZone(zoneOwnerIsMe ? "meGrave" : "oppGrave")}
                className={`px-2 py-0.5 rounded border ${isGraveZone ? "bg-sky-600 border-sky-400 text-white" : "border-white/30 text-slate-300"}`}
              >
                墓地
              </button>
              {isGraveZone && (
                <>
                  <span className="flex-1" />
                  <button
                    onClick={() => setGraveSort("new")}
                    className={`px-2 py-0.5 rounded border ${graveSort === "new" ? "bg-slate-600 border-slate-400 text-white" : "border-white/30 text-slate-300"}`}
                  >
                    新しい順
                  </button>
                  <button
                    onClick={() => setGraveSort("cost")}
                    className={`px-2 py-0.5 rounded border ${graveSort === "cost" ? "bg-slate-600 border-slate-400 text-white" : "border-white/30 text-slate-300"}`}
                  >
                    コスト順
                  </button>
                </>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {zoneList.length === 0 ? (
                <div className="text-xs text-slate-400">まだありません</div>
              ) : (
                zoneList.map((s, i) => {
                  const c = isGraveZone ? s.info : E.handInfo(s);
                  return (
                    <button
                      key={s.uid || i}
                      onClick={() => c && setDetail({ card: c })}
                      className={`w-full text-left flex justify-between py-2 border-b border-white/10 text-sm ${fxClass(c?.faction)}`}
                    >
                      <span className="fx-text font-bold">
                        {c ? c.name : s.name || "不明"}
                        {c?.isToken && <span className="text-slate-400 text-xs font-normal">（トークン）</span>}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {c ? `${c.type === "magic" ? "マジック" : c.type === "ability" ? "アビリティ" : "キャラ"} / コスト${c.cost}` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-2">カードをタップすると効果を確認できます</div>
            <button onClick={() => setZone(null)} className="sme-btn sme-btn-ghost sme-btn-sm mt-3">
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
          me={me}
          opp={opp}
          onRemove={(abilityUid) => {
            setDetail(null);
            run(E.removeAbility(state, myId, abilityUid));
          }}
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

      {/* リタイア確認 */}
      {confirmRetire && (
        <RetireConfirm
          isCpu={isCpu}
          onNo={() => setConfirmRetire(false)}
          onYes={() => { setConfirmRetire(false); onRetire && onRetire(); }}
        />
      )}
    </main>
  );
}

/* ============ 相手の行動の再生パネル ============ */
function ReplayOverlay({ item, rest, oppLabel, onNext, onSkipAll }) {
  const lines = item.lines;
  const main =
    lines.find((t) => /を攻撃|プレイヤーに\d+ダメージ|を召喚|を使用|を付けた|を外した|を生贄/.test(t)) || lines[0];
  const sub = lines.filter((t) => t !== main);

  let kind = "行動", color = "bg-slate-600";
  if (/を攻撃|プレイヤーに\d+ダメージ/.test(main)) { kind = "攻撃"; color = "bg-red-600"; }
  else if (/を召喚/.test(main)) { kind = "召喚"; color = "bg-amber-500 text-slate-900"; }
  else if (/を使用/.test(main)) { kind = "マジック"; color = "bg-sky-600"; }
  else if (/を付けた|を外した/.test(main)) { kind = "アビリティ"; color = "bg-cyan-600"; }
  else if (/を生贄/.test(main)) { kind = "生贄"; color = "bg-indigo-600"; }

  const duration = replayMs(item);
  const sideName = (s) => (s === "me" ? "あなた" : oppLabel);

  return (
    <div onClick={onNext} className="fixed inset-0 z-[45] bg-black/50 flex items-center justify-center p-4">
      <style>{`@keyframes smeShrink { from { width: 100%; } to { width: 0%; } }`}</style>
      <div
        className="w-full max-w-sm sme-modal rounded-2xl overflow-hidden"
        style={{ borderColor: "rgba(255,92,116,0.6)", boxShadow: "0 0 40px rgba(255,92,116,0.35)" }}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="sme-label !text-rose-300">{oppLabel}の行動</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${color}`}>{kind}</span>
        </div>

        <div className="p-4">
          <div className="sme-heading text-base text-center leading-snug">{main}</div>

          {item.changes.length > 0 && (
            <div className="mt-3 space-y-1">
              {item.changes.map((c, i) => {
                const mine = c.side === "me";
                const box = `flex items-center justify-between rounded-lg px-2 py-1.5 text-xs border ${
                  mine ? "border-emerald-700 bg-emerald-950/40" : "border-rose-800 bg-rose-950/40"
                }`;
                if (c.kind === "hp") {
                  return (
                    <div key={i} className={box}>
                      <span className="font-bold">{sideName(c.side)}のHP</span>
                      <span className="font-bold">
                        <span className="text-slate-400">{c.before}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className={c.after < c.before ? "text-red-400" : "text-emerald-300"}>{c.after}</span>
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={i} className={box}>
                    <span className="truncate mr-2">
                      <span className="text-slate-400">{sideName(c.side)}の </span>
                      <span className="font-bold">{c.name}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {c.kind === "unit" && c.acted && (
                        <span className="text-[9px] bg-red-700 px-1 rounded">攻撃</span>
                      )}
                      {c.kind === "unit" && (
                        c.before !== c.after ? (
                          <span className="font-bold">
                            <span className="text-slate-400">{c.before}</span>
                            <span className="text-slate-500 mx-1">→</span>
                            <span className={c.after < c.before ? "text-red-400" : "text-emerald-300"}>{c.after}</span>
                          </span>
                        ) : (
                          <span className="font-bold">{c.after}</span>
                        )
                      )}
                      {c.kind === "new" && (
                        <>
                          <span className="font-bold">{c.after}</span>
                          <span className="text-[9px] bg-amber-600 px-1 rounded">登場</span>
                        </>
                      )}
                      {c.kind === "gone" && (
                        <>
                          <span className="text-slate-400 line-through">{c.before}</span>
                          <span className={`text-[9px] px-1 rounded ${c.destroyed ? "bg-red-600" : "bg-slate-600"}`}>
                            {c.destroyed ? "破壊" : "退場"}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {sub.length > 0 && (
            <div className="mt-3 bg-slate-950/70 rounded-lg p-2 text-[11px] text-slate-300 space-y-0.5">
              {sub.map((l, i) => <div key={i}>・{l}</div>)}
            </div>
          )}
        </div>

        <div className="h-1 bg-slate-700">
          <div
            key={item.id}
            className="h-1 bg-rose-500"
            style={{ animation: `smeShrink ${duration}ms linear forwards` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-slate-400">
          <span>タップで次へ{rest > 0 ? `（残り${rest}件）` : ""}</span>
          {rest > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onSkipAll(); }}
              className="px-2 py-1 rounded bg-slate-700 text-slate-200"
            >
              すべてスキップ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ アクションモーダル ============ */
function ActionModal({ detail, phase, isMyTurn, me, opp, onClose, onPlay, onSac, onRemove, canSac }) {
  const u = detail.unit;
  const ab = detail.ability;
  const c = ab ? getCard(ab.cardId) : detail.card || (u ? E.unitInfo(u) : null);
  const isHand = detail.handIdx !== undefined;
  // そのカードの持ち主
  const owner = ab
    ? (detail.mine ? me : opp)
    : u
      ? (opp && opp.field.some((x) => x.uid === u.uid) ? opp : me)
      : me;
  const status = c ? cardStatus(c, owner, { unit: u, ability: ab, cost: isHand ? detail.cost : null }) : [];
  const haste = me ? E.hasteExtraOf(me) : E.HASTE_EXTRA;
  const isAbilityCard = c && c.type === "ability";
  const abilityFull = isAbilityCard && isHand && me && E.abilitiesOf(me).length >= E.MAX_ABILITIES;
  const abilitySame = isAbilityCard && isHand && me && E.hasAbility(me, c.id);

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/75 flex items-end justify-center z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sme-sheet ${fxClass(c?.faction)} rounded-t-2xl p-5 w-full max-w-lg`}
      >
        {c ? (
          <>
            <div className="text-xs mb-1 fx-text font-bold">
              {FACTION_LABEL[c.faction]} / コスト {isHand ? detail.cost : c.cost} /{" "}
              {c.isToken ? "トークン" : typeLabel(c)}
              {ab && "（付いている）"}
            </div>
            <div className="sme-heading text-xl mb-2">{c.name}</div>
            {c.stat && (
              <div className="flex items-center gap-2 mb-3">
                <span className="unit-stat">{u ? u.stat : c.stat}</span>
                {u && u.stat !== c.stat && <span className="text-xs text-slate-400">(元 {c.stat})</span>}
              </div>
            )}
            <p className="text-sm leading-relaxed text-slate-200 mb-3">{c.text}</p>
            <StatusLines lines={status} />
          </>
        ) : (
          <>
            <div className="text-xs mb-1 text-slate-400">トークン</div>
            <div className="sme-heading text-xl mb-2">{u?.name}</div>
            <div className="mb-4"><span className="unit-stat">{u?.stat}</span></div>
          </>
        )}

        {isHand && isMyTurn && phase === "main" && (
          <div className="flex flex-col gap-2">
            <button disabled={!detail.can} onClick={() => onPlay(false)} className="sme-btn sme-btn-sun">
              {isAbilityCard ? "付ける" : "使用"}（コスト {detail.cost}）
            </button>
            {abilityFull && (
              <div className="text-[11px] text-amber-200 text-center">
                アビリティは2枚まで。付いているアビリティをタップして外すと付けられます
              </div>
            )}
            {!abilityFull && abilitySame && (
              <div className="text-[11px] text-amber-200 text-center">同じ名前のアビリティは同時に1枚までです</div>
            )}
            {detail.canHaste && (
              <button onClick={() => onPlay(true)} className="sme-btn sme-btn-danger">
                即時召喚（コスト {detail.cost + haste}）
              </button>
            )}
          </div>
        )}

        {ab && detail.mine && isMyTurn && phase === "main" && (
          <div className="flex flex-col gap-1">
            <button onClick={() => onRemove(ab.uid)} className="sme-btn sme-btn-danger">
              外す（コスト不要）
            </button>
            <div className="text-[11px] text-slate-400 text-center">
              外したアビリティは墓地へ送られます（破壊トリガーは発動しません）
            </div>
          </div>
        )}

        {isHand && isMyTurn && phase === "sacrifice" && (
          <button disabled={!canSac} onClick={onSac} className="sme-btn sme-btn-moon">
            生贄にする（コスト上限+1・HP+{c?.cost || 0}・1ドロー）
          </button>
        )}

        {isHand && isMyTurn && phase === "draw" && (
          <div className="text-xs text-slate-400 text-center">先にカードを引いてください</div>
        )}

        <button onClick={onClose} className="sme-btn sme-btn-ghost sme-btn-sm mt-3">
          閉じる
        </button>
      </div>
    </div>
  );
}
