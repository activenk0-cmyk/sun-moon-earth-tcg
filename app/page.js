"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc, getDocFromServer, updateDoc, onSnapshot } from "firebase/firestore";
import { SLOTS, FACTION_LABEL, cardsBySlot } from "../lib/cards";
import * as E from "../lib/engine";
import { CPU_DECKS, pickCpuDeck, cpuStep } from "../lib/cpu";
import { DECKS, pickDeck } from "../lib/decks";

/* ============ 定数 ============ */
const PHASE_LABEL = { draw: "ドロー", main: "メイン", sacrifice: "生贄" };
const CPU_ID = "cpu";
const YOU_ID = "you";
const PRESETS = DECKS.length ? DECKS : CPU_DECKS;
const SAVE_KEY = "sme-save-v1"; // ブラウザ保存用のキー
const POLL_MS = 4000; // オンライン対戦で最新状態を取りに行く間隔

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

// 再生パネルに出さない細かいログ
const TRIVIAL_LOG = /^(カードを1枚引いた|生贄フェーズへ|ターン終了)$/;

/* ============ ユーティリティ ============ */
const roomId = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const fxClass = (f) => (f === "sun" || f === "moon" || f === "earth" ? `fx-${f}` : "fx-none");
const tierColor = (t) =>
  t === 1 ? "bg-amber-500 text-slate-900" : t === 2 ? "bg-sky-600 text-white" : "bg-slate-600 text-white";

// ブラウザに保存したデータを読む
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// CPUの戦い方を、lib/cpu.js に存在するものから選ぶ
function resolveStyle(wants) {
  const list = Array.isArray(wants) ? wants : [wants];
  const styles = CPU_DECKS.map((d) => d.style).filter(Boolean);
  if (!styles.length) return list[0];
  for (const w of list) {
    const hit = styles.find((s) => s === w) || styles.find((s) => String(s).includes(w));
    if (hit) return hit;
  }
  return styles[0];
}

// 前回のログと今回のログを比べて、新しく増えた分だけを返す（古いルーム用）
function newEntries(prev, cur) {
  const ps = prev.map((x) => JSON.stringify(x));
  const cs = cur.map((x) => JSON.stringify(x));
  for (let k = Math.min(ps.length, cs.length); k > 0; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (ps[ps.length - k + i] !== cs[i]) { ok = false; break; }
    }
    if (ok) return cur.slice(k);
  }
  return [];
}

// ログに通し番号を付ける（新しい行動を確実に見分けるため）
function stampLog(next, prev) {
  if (!next || !Array.isArray(next.log)) return next;
  let seq = next.logSeq || (prev && prev.logSeq) || 0;
  const log = next.log.map((l) => {
    if (!l || typeof l !== "object" || l.n) return l;
    seq += 1;
    return { ...l, n: seq };
  });
  return { ...next, log, logSeq: seq };
}

// ログの中で一番大きい通し番号
function maxSeq(log) {
  return (log || []).reduce((m, l) => (l && typeof l === "object" && l.n > m ? l.n : m), 0);
}

// 定期取得した状態が、今の状態より新しいときだけ採用する
function pickNewer(prev, next) {
  if (!prev) return next;
  const a = prev.logSeq || 0;
  const b = next.logSeq || 0;
  if (b < a) return prev;
  if (b === a && prev.phase === next.phase && prev.guest === next.guest && prev.winner === next.winner) {
    return prev;
  }
  return next;
}

// 再生パネルの表示時間（攻撃は長め）
function replayMs(item) {
  const atk = item.lines.some((t) => /を攻撃|プレイヤーに\d+ダメージ/.test(t));
  const base = atk ? 3600 : 2600;
  return Math.min(atk ? 5500 : 4200, base + item.changes.length * 300);
}

// 相手の直前ターンの行動（行った順）
function lastOppActions(log, myId) {
  const arr = log || [];
  const out = [];
  let i = arr.length - 1;
  while (i >= 0 && !(arr[i] && typeof arr[i] === "object" && arr[i].by !== myId)) i--;
  for (; i >= 0; i--) {
    const l = arr[i];
    if (!l || typeof l !== "object" || l.by === myId) break;
    if (!TRIVIAL_LOG.test(l.t)) out.unshift(l.t);
  }
  return out;
}

// 盤面の変化（HP・スタッツ・登場・退場・攻撃）を調べる
function diffBoards(prevP, curP, myId, oppId, lines) {
  const out = [];
  for (const [pid, side] of [[oppId, "opp"], [myId, "me"]]) {
    const a = prevP?.[pid], b = curP?.[pid];
    if (!a || !b) continue;
    if (a.hp !== b.hp) out.push({ side, kind: "hp", before: a.hp, after: b.hp });
    const af = a.field || [], bf = b.field || [];
    af.forEach((u) => {
      const n = bf.find((x) => x.uid === u.uid);
      if (!n) {
        out.push({
          side, kind: "gone", uid: u.uid, name: u.name, before: u.stat,
          destroyed: lines.some((t) => t.includes(`${u.name} が破壊`)),
        });
      } else {
        const acted = !u.attacked && n.attacked;
        if (n.stat !== u.stat || acted) {
          out.push({ side, kind: "unit", uid: u.uid, name: u.name, before: u.stat, after: n.stat, acted });
        }
      }
    });
    bf.forEach((n) => {
      if (!af.some((x) => x.uid === n.uid)) {
        out.push({ side, kind: "new", uid: n.uid, name: n.name, after: n.stat });
      }
    });
  }
  return out;
}

/* ============ メイン ============ */
export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [selection, setSelection] = useState({});
  const [myId, setMyId] = useState("");
  const [room, setRoom] = useState("");
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const unsubRef = useRef(null);
  const stateRef = useRef(null);

  // CPU戦
  const [cpuState, setCpuState] = useState(null);
  const [cpuDeck, setCpuDeck] = useState(null);

  // 起動時：保存データを復元
  useEffect(() => {
    const sv = loadSave() || {};
    setMyId(sv.myId || E.uid());
    if (sv.selection) setSelection(sv.selection);
    let sc = sv.screen || "menu";
    if (sc === "cpu") {
      if (sv.cpuState && sv.cpuDeck) {
        setCpuState(sv.cpuState);
        setCpuDeck(sv.cpuDeck);
      } else {
        sc = "deck";
      }
    }
    if (sc === "game") {
      if (sv.room) {
        setRoom(sv.room);
        subscribe(sv.room);
      } else {
        sc = "menu";
      }
    }
    setScreen(sc);
    setLoaded(true);
    return () => unsubRef.current && unsubRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状態が変わるたびに保存
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          myId,
          screen,
          selection,
          room,
          cpuState: screen === "cpu" ? cpuState : null,
          cpuDeck: screen === "cpu" ? cpuDeck : null,
        })
      );
    } catch {
      // 保存できなくてもゲームは続ける
    }
  }, [loaded, myId, screen, selection, room, cpuState, cpuDeck]);

  // 最新のオンライン状態を覚えておく（定期取得で使う）
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // オンライン対戦：iPhoneなどで同期が止まったときの保険
  // ・画面に戻ってきたら、つなぎ直して最新を取得
  // ・相手のターン中は数秒ごとに最新を取得
  useEffect(() => {
    if (screen !== "game" || !room) return;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      subscribe(room);
      refreshOnline();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const s = stateRef.current;
      if (s && s.phase === "play" && s.turn === myId) return; // 自分のターン中は不要
      refreshOnline();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, room, myId]);

  const deckComplete = SLOTS.every((s) => selection[s]);
  const matchedPreset = PRESETS.find((d) => SLOTS.every((s) => d.selection[s] === selection[s]));

  /* ---- 対戦から抜ける（to: 移動先の画面） ---- */
  function leaveGame(to = "menu") {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setState(null);
    setRoom("");
    setCpuState(null);
    setCpuDeck(null);
    setDetail(null);
    setScreen(to);
  }

  /* ---- リタイア ---- */
  async function retire() {
    // オンライン対戦中なら相手の勝ちにする
    if (screen === "game" && room && state && state.phase === "play" && !state.winner) {
      const oppId = E.otherId(state, myId);
      if (oppId) {
        try {
          const stamped = stampLog(
            { ...state, log: [...(state.log || []), { by: myId, t: "リタイアしました" }].slice(-30) },
            state
          );
          await updateDoc(doc(db, "rooms", room), {
            winner: oppId,
            phase: "end",
            log: stamped.log,
            logSeq: stamped.logSeq,
          });
        } catch {
          // 通信に失敗してもタイトルへは戻る
        }
      }
    }
    leaveGame("menu");
  }

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
      logSeq: 0,
      log: ["ルームを作成しました"],
      players: { [myId]: E.newPlayer(deck, selection) },
    };
    await setDoc(doc(db, "rooms", id), init);
    setState(null);
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
    setMsg("");
    setState(null);
    setRoom(id);
    subscribe(id);
    setScreen("game");
  }

  function subscribe(id) {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(
      doc(db, "rooms", id),
      (s) => {
        if (s.exists()) {
          setState(s.data());
        } else {
          // ルームが無くなっていたらタイトルへ
          leaveGame("menu");
        }
      },
      () => {
        // 通信エラー時はタイトルに戻さず、少し待ってつなぎ直す
        setTimeout(() => {
          if (unsubRef.current) subscribe(id);
        }, 2000);
      }
    );
  }

  // サーバーから最新の状態を直接取りに行く
  async function refreshOnline() {
    if (!room) return;
    try {
      const s = await getDocFromServer(doc(db, "rooms", room));
      if (s.exists()) setState((prev) => pickNewer(prev, s.data()));
    } catch {
      // 取れなければ次の機会に
    }
  }

  async function pushOnline(next) {
    await updateDoc(doc(db, "rooms", room), next);
  }

  /* ---- CPU戦開始 ---- */
  function startCpu() {
    const base = DECKS.length ? pickDeck() : pickCpuDeck();
    const d = { ...base, style: base.styles ? resolveStyle(base.styles) : base.style };
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

  /* ============ 読み込み中 ============ */
  if (!loaded) return <div className="p-8 text-center sme-label">LOADING...</div>;

  /* ============ 画面: メニュー ============ */
  if (screen === "menu") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
        <div className="sme-emblems mb-8">
          <div className="sme-emblem sun">☀</div>
          <div className="sme-emblem moon">☾</div>
          <div className="sme-emblem earth">◈</div>
        </div>
        <h1 className="sme-title text-3xl sm:text-4xl">SUN · MOON · EARTH</h1>
        <div className="sme-title-line" />
        <p className="sme-sub text-[11px] mt-4 mb-12">THREE FACTIONS CARD BATTLE</p>

        <div className="w-full max-w-xs">
          <button onClick={() => setScreen("deck")} className="sme-btn sme-btn-sun sme-glow text-lg">
            デッキを作って対戦
          </button>
        </div>

        <div className="sme-panel mt-10 p-4 text-[11px] text-slate-300 leading-relaxed max-w-xs">
          10のコスト枠から各1種を選び、4枚ずつ計40枚のデッキを作ります。
          友達とのルーム対戦と、CPU対戦が遊べます。
        </div>
      </main>
    );
  }

  /* ============ 画面: デッキ構築 ============ */
  if (screen === "deck") {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto pb-48">
        <div className="flex items-center justify-between mb-1">
          <h2 className="sme-heading text-2xl">デッキ構築</h2>
          <button
            onClick={() => setScreen("menu")}
            className="sme-btn sme-btn-ghost sme-btn-sm !w-auto"
          >
            タイトルへ
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          各枠から1種類ずつ選択（「詳細」で効果を確認）
        </p>

        {/* おすすめデッキ */}
        <div className="mb-6">
          <div className="sme-label mb-2">RECOMMENDED DECKS</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {PRESETS.map((d) => {
              const on = matchedPreset?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelection({ ...d.selection })}
                  className={`sme-btn sme-btn-sm shrink-0 !w-auto text-[11px] ${on ? "sme-btn-sun" : "sme-btn-ghost"}`}
                >
                  <span className={`inline-block text-[9px] font-bold px-1 rounded mr-1 ${tierColor(d.tier)}`}>
                    T{d.tier}
                  </span>
                  {d.name}
                </button>
              );
            })}
          </div>
          {matchedPreset && (
            <div className="sme-panel mt-2 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 rounded ${tierColor(matchedPreset.tier)}`}>
                  Tier{matchedPreset.tier}
                </span>
                <span className="text-sm font-bold">{matchedPreset.name}</span>
                {matchedPreset.share && (
                  <span className="text-[10px] text-slate-400 ml-auto">想定使用率 {matchedPreset.share}%</span>
                )}
              </div>
              {matchedPreset.desc && (
                <p className="text-[11px] text-slate-300 leading-relaxed">{matchedPreset.desc}</p>
              )}
            </div>
          )}
        </div>

        {SLOTS.map((slot) => (
          <div key={slot} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="cost-gem"><span>{slot.replace(/[ab]/, "")}</span></span>
              <span className="sme-label">
                COST {slot}
                {(slot === "2b" || slot === "3b" || slot === "6") && " ・ MAGIC"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cardsBySlot(slot).map((c) => {
                const on = selection[slot] === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelection({ ...selection, [slot]: c.id })}
                    className={`pick-card ${fxClass(c.faction)} ${on ? "is-on" : ""}`}
                  >
                    <div className="text-[10px] mb-1 fx-text font-bold">
                      {FACTION_LABEL[c.faction]}
                    </div>
                    <div className="text-[11px] font-bold leading-tight">{c.name}</div>
                    {c.stat && <div className="text-[10px] text-slate-400 mt-1">STAT {c.stat}</div>}
                    <div
                      onClick={(e) => { e.stopPropagation(); setDetail(c); }}
                      className="text-[10px] text-sky-300 mt-1 underline"
                    >
                      詳細
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 sme-panel !rounded-none !border-x-0 !border-b-0">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="sme-label">DECK</span>
              <span className={`text-xs font-bold ${deckComplete ? "text-emerald-300" : "text-slate-400"}`}>
                {Object.keys(selection).length} / 10 枠選択済み
              </span>
            </div>
            <button
              disabled={!deckComplete}
              onClick={startCpu}
              className={`sme-btn sme-btn-earth mb-2 ${deckComplete ? "sme-glow" : ""}`}
            >
              CPUと対戦
            </button>
            <div className="flex gap-2">
              <button disabled={!deckComplete} onClick={createRoom} className="sme-btn sme-btn-sun flex-1">
                ルーム作成
              </button>
              <button disabled={!deckComplete} onClick={() => setScreen("join")} className="sme-btn sme-btn-moon flex-1">
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
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col justify-center">
        <h2 className="sme-heading text-2xl mb-6 text-center">ルームに参加</h2>
        <div className="sme-panel p-5">
          <div className="sme-label mb-2">ROOM ID</div>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="4文字"
            className="w-full p-4 rounded-lg bg-slate-950/70 border border-amber-200/30 text-center text-3xl tracking-[0.3em] mb-3 font-bold text-amber-200 outline-none focus:border-amber-300 uppercase"
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          {msg && <div className="text-red-400 text-sm mb-3">{msg}</div>}
          <button
            onClick={() => joinRoom(room.trim().toUpperCase())}
            className="sme-btn sme-btn-moon"
          >
            参加する
          </button>
          <button onClick={() => { setMsg(""); setScreen("deck"); }} className="sme-btn sme-btn-ghost mt-2">
            戻る
          </button>
        </div>
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
        onDeck={() => leaveGame("deck")}
        onTitle={() => leaveGame("menu")}
        onRetire={retire}
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
      onDeck={() => leaveGame("deck")}
      onTitle={() => leaveGame("menu")}
      onRetire={retire}
      onRefresh={refreshOnline}
    />
  );
}

/* ============ CPU戦（CPUの手番を自動で進める） ============ */
function CpuGame({ state, setState, cpuDeck, detail, setDetail, onRetry, onDeck, onTitle, onRetire }) {
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
      onRetry={onRetry}
      onDeck={onDeck}
      onTitle={onTitle}
      onRetire={onRetire}
      onReplayingChange={setReplaying}
    />
  );
}

/* ============ カード詳細モーダル（デッキ構築用） ============ */
function DetailModal({ card, onClose }) {
  const c = card;
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/75 flex items-center justify-center p-6 z-50">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sme-modal ${fxClass(c.faction)} rounded-2xl p-5 max-w-sm w-full`}
      >
        <div className="text-xs mb-1 fx-text font-bold">
          {FACTION_LABEL[c.faction]} / コスト {c.cost} / {c.type === "magic" ? "マジック" : "キャラクター"}
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

/* ============ フェーズ表示 ============ */
function PhaseBar({ phase, mine }) {
  const steps = ["draw", "main", "sacrifice"];
  return (
    <div className="flex gap-1 mb-2">
      {steps.map((s, i) => (
        <div key={s} className={`phase-step ${phase === s ? `on ${mine ? "" : "theirs"}` : ""}`}>
          {i + 1}. {PHASE_LABEL[s]}
        </div>
      ))}
    </div>
  );
}

/* ============ マナクリスタル ============ */
function ManaBar({ cost, max }) {
  const n = Math.max(max, cost);
  return (
    <div className="mana-row">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`mana-dot ${i < cost ? "on" : "used"}`} />
      ))}
    </div>
  );
}

/* ============ 空き枠 ============ */
function EmptySlots({ count }) {
  return Array.from({ length: Math.max(0, count) }).map((_, i) => (
    <div key={`empty-${i}`} className="unit-slot" />
  ));
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
            : "相手の勝利となり、タイトル画面に戻ります。"}
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
function GameScreen({
  state, myId, room, apply, detail, setDetail, cpuDeck,
  onRetry, onDeck, onTitle, onRetire, onReplayingChange, onRefresh,
}) {
  const [sel, setSel] = useState(null); // 選択中の自軍ユニット
  const [pendingPlay, setPendingPlay] = useState(null); // 対象選択待ちのカード使用
  const [pendingAttack, setPendingAttack] = useState(null); // 月のゴブリンの追加対象待ち
  const [banner, setBanner] = useState(null);
  const [zone, setZone] = useState(null); // 生贄置き場の表示（"me" / "opp"）
  const [queue, setQueue] = useState([]); // 相手の行動の再生待ち
  const [showLog, setShowLog] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastTurnKey = useRef(null);
  const busy = useRef(false);
  const prevRef = useRef(null);
  const logRef = useRef(null);

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
    if (!prev || state.phase === "waiting") return;
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
  const me = state.players[myId];
  const opp = state.players[oppId];
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
    if (mode && mode !== "reduce1" && mode !== "reattack") return candidates.includes(u.uid);
    if (!mode && ao) return ao.units.includes(u.uid);
    return false;
  };

  // 再生中の行動で光らせるユニット
  const flashIds = current
    ? current.changes.filter((c) => c.kind === "unit" || c.kind === "new").map((c) => c.uid)
    : [];

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
      <main className="min-h-screen p-8 text-center max-w-lg mx-auto flex flex-col justify-center">
        <h1 className={`result-title ${win ? "win" : "lose"} my-6`}>
          {win ? "VICTORY" : "DEFEAT"}
        </h1>
        <div className="sme-heading text-lg mb-6">{win ? "勝利！" : "敗北..."}</div>
        {isCpu && (
          <div className="text-sm text-slate-300 mb-4">
            CPUのデッキ: {cpuDeck.name}（Tier{cpuDeck.tier}）
          </div>
        )}
        <div className="sme-panel text-xs mb-6 text-left p-3 space-y-0.5">
          {(state.log || []).slice(-8).map(renderLog)}
        </div>
        <div className="flex flex-col gap-2">
          {onRetry && (
            <button onClick={onRetry} className="sme-btn sme-btn-sun sme-glow">
              もう一度CPUと対戦
            </button>
          )}
          {onDeck && (
            <button onClick={onDeck} className={`sme-btn ${onRetry ? "sme-btn-ghost" : "sme-btn-sun sme-glow"}`}>
              デッキ構築へ戻る
            </button>
          )}
          {onTitle && (
            <button onClick={onTitle} className="sme-btn sme-btn-ghost">
              タイトルへ戻る
            </button>
          )}
        </div>
      </main>
    );
  }

  const zoneList = zone === "me" ? me.sacrifice : zone === "opp" ? opp.sacrifice : [];
  const canSac = E.canSacrifice(state, myId);

  return (
    <main className={`min-h-screen max-w-lg mx-auto text-sm ${mode ? "pb-20" : "pb-4"}`}>
      {/* 相手情報 + ターン表示 */}
      <div className="sticky top-0 z-10">
        <div className="sme-panel sme-panel-opp !rounded-none !border-x-0 !border-t-0 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className={`hp-orb opp ${opp.hp <= 3 ? "is-danger" : ""}`}>{opp.hp}</div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-rose-200 truncate">
                  {isCpu ? `CPU（${cpuDeck.name}・T${cpuDeck.tier}）` : "相手"}
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
                </button>
              </div>
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
              ⚔ {oppLabel}プレイヤーを攻撃
            </button>
          ) : (
            <div className="sme-panel py-1.5 text-center text-[11px] text-slate-400">
              {ao.defender
                ? "ディフェンダーがいるため、ディフェンダーしか攻撃できません"
                : "このキャラは出たターン、相手プレイヤーを攻撃できません"}
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
              targetable={mode === "reattack" && candidates.includes(u.uid)}
              ready={canMain && u.canAttack && !u.attacked}
              sick={!u.attacked && !u.canAttack}
              onInfo={() => setDetail({ unit: u })}
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
          <EmptySlots count={E.MAX_FIELD - me.field.length} />
        </div>
      </div>

      {/* 自分情報 */}
      <div className="sme-panel sme-panel-me !rounded-none !border-x-0 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className={`hp-orb me ${me.hp <= 3 ? "is-danger" : ""}`}>{me.hp}</div>
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
              </button>
            </div>
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
            const isCand = mode === "reduce1" && candidates.includes(h.uid);
            const bright = isCand || can || canSac;
            const look = isCand ? "is-target" : bright ? "is-playable" : "is-dim";
            return (
              <button
                key={h.uid}
                onClick={() => {
                  if (mode) {
                    if (mode === "reduce1") resolveTarget(h.uid);
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
            <button onClick={() => setShowLog(false)} className="sme-btn sme-btn-ghost sme-btn-sm mt-3">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 生贄置き場の一覧 */}
      {zone && (
        <div onClick={() => setZone(null)} className="fixed inset-0 bg-black/75 flex items-end justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="sme-sheet rounded-t-2xl p-5 w-full max-w-lg">
            <div className="sme-heading text-sm mb-3">
              {zone === "me" ? "自分" : oppLabel}の生贄置き場（{zoneList.length}枚）
            </div>
            <div className="max-h-72 overflow-y-auto">
              {zoneList.length === 0 ? (
                <div className="text-xs text-slate-400">まだありません</div>
              ) : (
                zoneList.map((s, i) => {
                  const c = E.handInfo(s);
                  return (
                    <div key={i} className={`flex justify-between py-2 border-b border-white/10 text-sm ${fxClass(c?.faction)}`}>
                      <span className="fx-text font-bold">
                        {c ? c.name : s.name || "不明"}
                        {c?.isToken && <span className="text-slate-400 text-xs font-normal">（トークン）</span>}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {c ? `${c.type === "magic" ? "マジック" : "キャラ"} / コスト${c.cost}` : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
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
    lines.find((t) => /を攻撃|プレイヤーに\d+ダメージ|を召喚|を使用|を生贄/.test(t)) || lines[0];
  const sub = lines.filter((t) => t !== main);

  let kind = "行動", color = "bg-slate-600";
  if (/を攻撃|プレイヤーに\d+ダメージ/.test(main)) { kind = "攻撃"; color = "bg-red-600"; }
  else if (/を召喚/.test(main)) { kind = "召喚"; color = "bg-amber-500 text-slate-900"; }
  else if (/を使用/.test(main)) { kind = "マジック"; color = "bg-sky-600"; }
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

/* ============ ユニット表示 ============ */
function UnitCard({ u, foe, selected, targetable, ready, sick, flash, onTap, onInfo }) {
  const info = E.unitInfo(u);
  const base = info?.stat;
  const statCls = base == null ? "" : u.stat > base ? "is-up" : u.stat < base ? "is-down" : "";

  let look = "";
  if (selected) look = "is-selected";
  else if (targetable) look = "is-target";
  else if (flash) look = "is-flash";
  else if (ready) look = "is-ready";

  const cls = [
    "unit",
    fxClass(info?.faction),
    foe ? "is-foe" : "",
    look,
    u.attacked ? "is-attacked" : "",
    sick ? "opacity-60 grayscale" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="unit-enter">
      <button onClick={onTap} className={cls}>
        {/* 召喚酔い中：頭上で★がクルクル回る */}
        {sick && (
          <span className="dizzy" aria-hidden="true" title="召喚酔い">
            <span>★</span>
            <span>★</span>
            <span>★</span>
          </span>
        )}
        {/* 能力確認ボタン（タップしても選択・攻撃はしない） */}
        {onInfo && (
          <span
            role="button"
            aria-label="能力を見る"
            onClick={(e) => { e.stopPropagation(); onInfo(); }}
            className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-sky-600 border border-white/70 text-[10px] font-bold text-white flex items-center justify-center shadow-lg"
          >
            i
          </span>
        )}
        <div className="unit-name">{u.name}</div>
        <div className="flex justify-between items-end mt-1">
          <span className={`unit-stat ${statCls}`}>{u.stat}</span>
          <div className="flex flex-col gap-0.5 items-end">
            {u.keywords?.includes("defender") && <span className="unit-kw def">守</span>}
            {u.keywords?.includes("invincible") && <span className="unit-kw inv">無</span>}
            {u.keywords?.includes("untargetable_by_attack") && <span className="unit-kw evd">避</span>}
            {u.noFaceAttack && <span className="unit-kw rsh">突</span>}
          </div>
        </div>
      </button>
    </div>
  );
}

/* ============ アクションモーダル ============ */
function ActionModal({ detail, phase, isMyTurn, onClose, onPlay, onSac, canSac }) {
  const u = detail.unit;
  const c = detail.card || (u ? E.unitInfo(u) : null);
  const isHand = detail.handIdx !== undefined;

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
              {c.isToken ? "トークン" : c.type === "magic" ? "マジック" : "キャラクター"}
            </div>
            <div className="sme-heading text-xl mb-2">{c.name}</div>
            {c.stat && (
              <div className="flex items-center gap-2 mb-3">
                <span className="unit-stat">{u ? u.stat : c.stat}</span>
                {u && u.stat !== c.stat && <span className="text-xs text-slate-400">(元 {c.stat})</span>}
              </div>
            )}
            <p className="text-sm leading-relaxed text-slate-200 mb-4">{c.text}</p>
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
              使用（コスト {detail.cost}）
            </button>
            {detail.canHaste && (
              <button onClick={() => onPlay(true)} className="sme-btn sme-btn-danger">
                即時召喚（コスト {detail.cost + E.HASTE_EXTRA}）
              </button>
            )}
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
