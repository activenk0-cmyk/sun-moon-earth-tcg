"use client";

// 画面の切り替え・ログイン・ロビー（ルームマッチの部屋）・デッキ編集のファイル
// 対戦画面は ./GameScreen.js、その小さい部品は ./GameParts.js、
// オンライン対戦・連勝記録・ID/パスワードの補助は ../lib/online.js にある

import { useState, useEffect, useRef } from "react";
import { db, auth } from "../lib/firebase";
import {
  doc, getDocFromServer, updateDoc, onSnapshot, runTransaction, setDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from "firebase/auth";
import { SLOTS, FACTION_LABEL, cardsBySlot, abilityShort } from "../lib/cards";
import * as E from "../lib/engine";
import { CPU_DECKS, pickCpuDeck } from "../lib/cpu";
import { DECKS, pickDeck } from "../lib/decks";
import NewsButton from "./NewsButton";
import TutorialButton from "./TutorialButton";
import RankBadge from "./RankBadge";
import { loadRank, beginRankedMatch, finishRankedMatch, flushUnsentRank } from "../lib/rankStore";
import MyPageButton from "./MyPageButton";
import StarPick, { finishStarpickBattle, markStarpickBattle } from "./StarPickPage";
import { opponentDeck, battleLabel } from "../lib/starpick";
import { fxClass } from "./GameParts";
import {
  currentUid, setCurrentUid,
  loadStreaks, saveStreaksLocal, pushStreaks, mergeStreaks, isEmptyRank, recordStreak,
  PLAYER_ID_RE, PIN_RE, fetchUsedIds, firstFreeId, claimPlayerId, idToEmail, pinToPassword, authErrorText,
  gameKey, newLobby, lobbyDoc, gameDoc,
  stampLog, pickNewer,
} from "../lib/online";
import { CPU_ID, YOU_ID, CpuGame, DetailModal, GameScreen } from "./GameScreen";

/* ============ 定数 ============ */
const PRESETS = DECKS.length ? DECKS : CPU_DECKS;
const SAVE_KEY = "sme-save-v1"; // ブラウザ保存用のキー
const POLL_MS = 4000; // オンライン対戦で最新状態を取りに行く間隔
const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字（O/0/I/1）を除く
const MAX_MY_DECKS = 20; // 保存できるデッキの数
const SCREENS = ["menu", "roomMenu", "join", "deck", "cpu", "game", "starpick"];

/* ============ 追加の見た目（水星の陣営カラー・アビリティ枠） ============ */
const EXTRA_CSS = `
.fx-mercury { --fx: #4fd8f0; --fx-deep: #136c80; --fx-rgb: 79, 216, 240; }
.fx-saturn { --fx: #d9a35b; --fx-deep: #7a5320; --fx-rgb: 217, 163, 91; }
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

/* ============ ユーティリティ ============ */
const roomId = () =>
  Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
const tierColor = (t) =>
  t === 1 ? "bg-amber-500 text-slate-900"
    : t === 2 ? "bg-sky-600 text-white"
    : t === 3 ? "bg-slate-600 text-white"
    : "bg-slate-800 text-slate-300 border border-slate-500";
const isComplete = (sel) => !!sel && SLOTS.every((s) => sel[s]);

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
// （デッキの戦い方の名前をそのまま使う。知らない名前は lib/cpu.js 側で標準の戦い方になる）
function resolveStyle(wants) {
  const list = Array.isArray(wants) ? wants : [wants];
  return list.find(Boolean) || "balanced";
}

/* ============ メイン ============ */
export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [matchMode, setMatchMode] = useState(null); // "cpu" / "room"
  const [selection, setSelection] = useState({});
  const [myId, setMyId] = useState("");
  const [room, setRoom] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [state, setState] = useState(null);
  const [resultState, setResultState] = useState(null); // 決着画面を見ている間の結果
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [lobbyBusy, setLobbyBusy] = useState(false);
  // アカウント
  const [user, setUser] = useState(null); // { uid, id, nickname }
  const [streaks, setStreaks] = useState({});
  const [authMode, setAuthMode] = useState(null); // null / "login" / "signup"
  const [authId, setAuthId] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authNick, setAuthNick] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [nickEdit, setNickEdit] = useState(false); // ニックネーム変更中
  const [nickInput, setNickInput] = useState("");
  // 保存デッキ（ログイン時のみ・アカウントに保存）
  const [myDecks, setMyDecks] = useState([]);
  const [deckSaveOpen, setDeckSaveOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckMsg, setDeckMsg] = useState("");
  const [deckBusy, setDeckBusy] = useState(false);
  const unsubRef = useRef(null);
  const stateRef = useRef(null);

  // CPU戦
  const [cpuState, setCpuState] = useState(null);
  const [cpuDeck, setCpuDeck] = useState(null);
  // ランク戦（CPU戦）
  const [rankData, setRankData] = useState(null); // { points, streak, ... }（未ログインなら null）
  const [rankBusy, setRankBusy] = useState(false);
  const [rankMsg, setRankMsg] = useState("");
  const [rankView, setRankView] = useState(null); // リザルト表示用 { gameId, win, result, error }
  const settlingRef = useRef(null);

  // 起動時：保存データを復元
  useEffect(() => {
    const sv = loadSave() || {};
    setMyId(sv.myId || E.uid());
    if (sv.selection) setSelection(sv.selection);
    let sc = sv.screen || "menu";
    let mm = sv.matchMode || null;
    if (sc === "cpu") {
      if (sv.cpuState && sv.cpuDeck) {
        setCpuState(sv.cpuState);
        setCpuDeck(sv.cpuDeck);
        mm = "cpu";
      } else {
        sc = "deck";
        mm = "cpu";
      }
    }
    if (sc === "game") {
      if (sv.room) {
        setRoom(sv.room);
        subscribe(sv.room);
        mm = "room";
      } else {
        sc = "menu";
      }
    }
    if (sc === "deck") {
      if (mm === "room") {
        if (sv.room) {
          setRoom(sv.room);
          subscribe(sv.room);
        } else {
          sc = "menu";
        }
      } else if (mm !== "cpu") {
        sc = "menu";
      }
    }
    if (!SCREENS.includes(sc)) sc = "menu";
    setMatchMode(sc === "menu" ? null : mm);
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
          matchMode,
          selection,
          room,
          cpuState: screen === "cpu" ? cpuState : null,
          cpuDeck: screen === "cpu" ? cpuDeck : null,
        })
      );
    } catch {
      // 保存できなくてもゲームは続ける
    }
  }, [loaded, myId, screen, matchMode, selection, room, cpuState, cpuDeck]);

  // ログイン状態の監視
  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setCurrentUid(null);
        setUser(null);
        setMyDecks([]);
        setStreaks(loadStreaks(null));
        setRankData(null);
        return;
      }
      setCurrentUid(u.uid);
      const id = (u.email || "").split("@")[0];
      claimPlayerId(id, u.uid); // 以前からのアカウントも使用済みIDとして登録
      setUser((prev) => ({ uid: u.uid, id, nickname: prev && prev.uid === u.uid ? prev.nickname : "" }));
      setStreaks(loadStreaks(u.uid));
      setRankData(null);
      // ランクの読み込み（送れていなかった決着があれば先に再送）
      flushUnsentRank(u.uid)
        .then((r) => { if (currentUid === u.uid && r) setRankData(r); })
        .catch(() => {
          loadRank(u.uid)
            .then((r) => { if (currentUid === u.uid) setRankData(r); })
            .catch(() => {});
        });
      try {
        const snap = await getDocFromServer(doc(db, "players", u.uid));
        const data = snap.exists() ? snap.data() : {};
        const merged = mergeStreaks(loadStreaks(u.uid), data.streaks || {});
        saveStreaksLocal(merged, u.uid);
        setStreaks(merged);
        setMyDecks(Array.isArray(data.decks) ? data.decks : []);
        setUser((prev) => ({
          uid: u.uid,
          id,
          nickname: data.nickname || (prev && prev.uid === u.uid ? prev.nickname : ""),
        }));
        if (JSON.stringify(merged) !== JSON.stringify(data.streaks || {})) {
          await pushStreaks(u.uid, merged);
        }
      } catch {
        // 通信できなくても端末の記録で続ける
      }
    });
    return () => off();
  }, []);

  // タイトルに戻ったら最新の記録を表示
  const prevScreenRef = useRef(null);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;
    if (screen === "menu") setStreaks(loadStreaks());
    if ((screen === "menu" || screen === "deck") && currentUid) {
      // スターピックから戻った時はランクが変わらないので、読み直さない
      // （試合記録の保存と重なって、一瞬レギュラー表示になるのを防ぐ）
      if (prev === "starpick" && rankData) return;
      const uid = currentUid;
      loadRank(uid)
        .then((r) => {
          if (currentUid !== uid) return;
          // すでにランクを持っているのに「空のランク」が返ってきたら無視する
          setRankData((cur) => (cur && isEmptyRank(r) && !isEmptyRank(cur) ? cur : r));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // CPUランク戦の決着：ポイントを確定してリザルトに表示
  useEffect(() => {
    const st = cpuState;
    if (screen !== "cpu" || !st || st.phase !== "end" || !st.winner) return;
    if (!st.ranked || !st.gameId) return;
    const gid = st.gameId;
    const win = st.winner === YOU_ID;
    if (!user || user.uid !== st.rankUid) {
      setRankView({ gameId: gid, win, result: null, error: "ログイン中のアカウントが違うため、ポイントを反映できませんでした" });
      return;
    }
    if (settlingRef.current === gid) return;
    settlingRef.current = gid;
    setRankView({ gameId: gid, win, result: null, error: null });
    finishRankedMatch(user.uid, gid, win)
      .then(({ data, result }) => {
        if (data) setRankData(data);
        setRankView({
          gameId: gid,
          win,
          result,
          error: result ? null : "この試合のポイントはすでに反映済みか、ランク戦の対象外です",
        });
      })
      .catch(() => {
        settlingRef.current = null;
        setRankView({
          gameId: gid,
          win,
          result: null,
          error: "通信に失敗しました。結果は次にログインしたときに反映されます",
        });
      });
  }, [screen, cpuState, user]);

  // スターピックの決着：進行状況を進める（次の戦へ／終了／完全制覇）
  useEffect(() => {
    const st = cpuState;
    if (screen !== "cpu" || !st || !st.starpick || st.phase !== "end" || !st.winner) return;
    finishStarpickBattle(st.spUid, st.gameId, st.winner === YOU_ID);
  }, [screen, cpuState]);

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthId("");
    setAuthPin("");
    setAuthNick("");
    setAuthMsg("");
    if (mode === "signup") {
      // 空いているいちばん小さいIDを表示
      setAuthId("…");
      fetchUsedIds()
        .then((used) => setAuthId(firstFreeId(used) || ""))
        .catch((e) => {
          setAuthId("");
          setAuthMsg(`IDの確認に失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
        });
    }
  }

  /* ---- 新規登録 ---- */
  async function signup() {
    const nick = authNick.trim();
    if (!PIN_RE.test(authPin)) return setAuthMsg("パスワードは数字3桁で入力してください");
    if (!nick) return setAuthMsg("ニックネームを入力してください");
    if (nick.length > 12) return setAuthMsg("ニックネームは12文字以内にしてください");
    setAuthBusy(true);
    setAuthMsg("");
    try {
      // ログイン前にこの端末で遊んだ記録を引き継ぐ
      const guest = loadStreaks(null);
      // 空いているいちばん小さいIDで登録（同時に誰かが取っていたら次のIDへ）
      const used = await fetchUsedIds();
      let id = null;
      let cred = null;
      for (let tries = 0; tries < 30; tries++) {
        const cand = firstFreeId(used);
        if (!cand) throw new Error("空いているプレイヤーIDがありません");
        try {
          cred = await createUserWithEmailAndPassword(auth, idToEmail(cand), pinToPassword(authPin));
          id = cand;
          break;
        } catch (e) {
          if (e?.code !== "auth/email-already-in-use") throw e;
          used.add(cand);
        }
      }
      if (!cred) throw new Error("プレイヤーIDの割り当てに失敗しました。もう一度お試しください");
      const uid = cred.user.uid;
      await claimPlayerId(id, uid);
      setCurrentUid(uid);
      saveStreaksLocal(guest, uid);
      await setDoc(doc(db, "players", uid), {
        id,
        nickname: nick,
        streaks: guest,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setUser({ uid, id, nickname: nick });
      setStreaks(guest);
      setAuthMode(null);
      setAuthMsg(`登録しました！ あなたのプレイヤーIDは「${id}」です。パスワードと一緒に必ずメモしてください。`);
    } catch (e) {
      setAuthMsg(authErrorText(e));
    } finally {
      setAuthBusy(false);
    }
  }

  /* ---- ログイン ---- */
  async function login() {
    const id = authId.trim().toLowerCase();
    if (!PLAYER_ID_RE.test(id)) return setAuthMsg("プレイヤーIDは a1〜z99 の形で入力してください");
    if (!PIN_RE.test(authPin)) return setAuthMsg("パスワードは数字3桁で入力してください");
    setAuthBusy(true);
    setAuthMsg("");
    try {
      await signInWithEmailAndPassword(auth, idToEmail(id), pinToPassword(authPin));
      setAuthMode(null);
    } catch (e) {
      setAuthMsg(authErrorText(e));
    } finally {
      setAuthBusy(false);
    }
  }

  /* ---- ニックネーム変更 ---- */
  async function saveNickname() {
    if (!user) return;
    const nick = nickInput.trim();
    if (!nick) return setAuthMsg("ニックネームを入力してください");
    if (nick.length > 12) return setAuthMsg("ニックネームは12文字以内にしてください");
    setAuthBusy(true);
    setAuthMsg("");
    try {
      await setDoc(
        doc(db, "players", user.uid),
        { id: user.id, nickname: nick, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setUser((prev) => (prev ? { ...prev, nickname: nick } : prev));
      setNickEdit(false);
      setAuthMsg("ニックネームを変更しました");
    } catch (e) {
      setAuthMsg(`保存に失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
    } finally {
      setAuthBusy(false);
    }
  }

  /* ---- デッキ保存 ---- */
  function openDeckSave() {
    setDeckMsg("");
    if (!user) {
      setDeckMsg("デッキの保存はログイン中のみ使えます（タイトル画面からログインしてください）");
      return;
    }
    if (!SLOTS.every((s) => selection[s])) {
      setDeckMsg("すべての枠を選んでから保存してください");
      return;
    }
    setDeckName("");
    setDeckSaveOpen(true);
  }

  async function writeDecks(next) {
    await setDoc(
      doc(db, "players", user.uid),
      { decks: next, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    setMyDecks(next);
  }

  async function saveDeck() {
    if (!user) return;
    const name = deckName.trim();
    if (!name) return setDeckMsg("デッキ名を入力してください");
    if (name.length > 16) return setDeckMsg("デッキ名は16文字以内にしてください");
    const same = myDecks.find((d) => d.name === name);
    if (!same && myDecks.length >= MAX_MY_DECKS) {
      return setDeckMsg(`保存できるのは${MAX_MY_DECKS}個までです（不要なデッキを削除してください）`);
    }
    const sel = {};
    SLOTS.forEach((s) => { sel[s] = selection[s]; });
    const entry = { id: same ? same.id : `d${Date.now()}`, name, selection: sel, savedAt: new Date().toISOString() };
    const next = same ? myDecks.map((d) => (d.id === same.id ? entry : d)) : [...myDecks, entry];
    setDeckBusy(true);
    setDeckMsg("");
    try {
      await writeDecks(next);
      setDeckSaveOpen(false);
      setDeckMsg(same ? `「${name}」を上書き保存しました` : `「${name}」を保存しました`);
    } catch (e) {
      setDeckMsg(`保存に失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
    } finally {
      setDeckBusy(false);
    }
  }

  async function deleteDeck(d) {
    if (!user || !d) return;
    if (typeof window !== "undefined" && !window.confirm(`「${d.name}」を削除しますか？`)) return;
    setDeckBusy(true);
    setDeckMsg("");
    try {
      await writeDecks(myDecks.filter((x) => x.id !== d.id));
      setDeckMsg(`「${d.name}」を削除しました`);
    } catch (e) {
      setDeckMsg(`削除に失敗しました: ${e?.code || e?.message || "不明なエラー"}`);
    } finally {
      setDeckBusy(false);
    }
  }

  async function logout() {
    setNickEdit(false);
    setAuthMsg("");
    try {
      await signOut(auth);
    } catch {
      // 失敗しても画面はそのまま
    }
  }

  // 最新のオンライン状態を覚えておく（定期取得で使う）
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // オンライン対戦：iPhoneなどで同期が止まったときの保険
  // ・画面に戻ってきたら、つなぎ直して最新を取得
  // ・相手のターン中やデッキ選択中は数秒ごとに最新を取得
  useEffect(() => {
    if (!room || matchMode !== "room") return;
    if (screen !== "game" && screen !== "deck") return;
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
  }, [screen, room, myId, matchMode]);

  // 決着したら結果を控えておく（相手が先に再戦準備に入っても結果画面を見続けられるように）
  useEffect(() => {
    if (screen === "game" && state && state.phase === "end") setResultState(state);
  }, [screen, state]);

  // ルームマッチ：2人とも準備完了で対戦画面へ／部屋がデッキ選択待ちならデッキ選択へ
  useEffect(() => {
    if (matchMode !== "room" || !state) return;
    if (screen === "deck" && state.phase === "play" && state.players && state.players[myId]) {
      setResultState(null);
      setDetail(null);
      setScreen("game");
      return;
    }
    if (screen === "game" && state.phase === "lobby" && !resultState) {
      setScreen("deck");
    }
  }, [screen, state, matchMode, myId, resultState]);

  const deckComplete = SLOTS.every((s) => selection[s]);
  const matchedPreset = PRESETS.find((d) => SLOTS.every((s) => d.selection[s] === selection[s]));
  const matchedMyDeck = myDecks.find((d) => d.selection && SLOTS.every((s) => d.selection[s] === selection[s]));

  /* ---- ルームの様子（デッキ選択画面用） ---- */
  const lobby = matchMode === "room" ? state : null;
  const oppIdL = lobby ? (lobby.host === myId ? lobby.guest : lobby.host) : null;
  const lobbyReady = lobby && lobby.phase === "lobby" && lobby.ready ? lobby.ready : {};
  const myReady = !!lobbyReady[myId];
  const oppReady = !!(oppIdL && lobbyReady[oppIdL]);
  const oppInLobby = !!(oppIdL && lobby && lobby.phase === "lobby" && lobby.lobbyIn && lobby.lobbyIn[oppIdL]);
  const locked = matchMode === "room" && myReady;

  /* ---- 対戦から抜ける（to: 移動先の画面） ---- */
  function leaveGame(to = "menu") {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setState(null);
    setResultState(null);
    setRoom("");
    setCpuState(null);
    setCpuDeck(null);
    setRankView(null);
    setDetail(null);
    setMsg("");
    setMatchMode(null);
    setScreen(to);
  }

  /* ---- 部屋から自分を外す ---- */
  async function leaveRoom(id) {
    if (!id || !myId) return;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "rooms", id);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const d = snap.data();
        const ready = { ...(d.ready || {}) };
        delete ready[myId];
        const lobbyIn = { ...(d.lobbyIn || {}) };
        delete lobbyIn[myId];
        if (d.guest === myId) {
          tx.update(ref, { guest: null, ready, lobbyIn });
        } else if (d.host === myId) {
          if (d.guest) {
            // 相手が残っていれば、相手を部屋主にする
            tx.update(ref, { host: d.guest, guest: null, ready, lobbyIn });
          } else {
            tx.update(ref, { host: null, closed: true, ready, lobbyIn });
          }
        }
      });
    } catch {
      // 通信に失敗しても画面は戻る
    }
  }

  /* ---- 部屋を出てタイトルへ ---- */
  async function leaveOnline() {
    const id = room;
    leaveGame("menu");
    await leaveRoom(id);
  }

  /* ---- リタイア ---- */
  async function retire() {
    // スターピック：リタイアは負けとして終了
    if (screen === "cpu" && cpuState && cpuState.starpick && cpuState.phase === "play" && !cpuState.winner) {
      finishStarpickBattle(cpuState.spUid, cpuState.gameId, false);
      leaveGame("starpick");
      return;
    }
    // リタイアは負けとして連勝記録をリセット
    if (screen === "cpu" && cpuState && cpuState.phase === "play" && !cpuState.winner) {
      // ランク戦以外（ランク導入前の試合）だけ、従来の連勝記録を更新
      if (!cpuState.ranked) recordStreak("cpu", gameKey(cpuState, null), false);
      // ランク戦：開始時に負け分は引いてあるので、負けとして確定するだけ
      if (cpuState.ranked && cpuState.gameId && user && user.uid === cpuState.rankUid) {
        const uid = user.uid;
        finishRankedMatch(uid, cpuState.gameId, false)
          .then(({ data }) => { if (data && currentUid === uid) setRankData(data); })
          .catch(() => {});
      }
    }
    if (screen === "game" && room && state && state.phase === "play" && !state.winner) {
      recordStreak("room", gameKey(state, room), false);
    }
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
    if (screen === "game" && room) {
      await leaveOnline();
      return;
    }
    leaveGame("menu");
  }

  /* ---- 部屋に入った後の共通処理 ---- */
  function enterRoom(id) {
    setState(null);
    setResultState(null);
    setDetail(null);
    setRoom(id);
    setMatchMode("room");
    subscribe(id);
    setScreen("deck");
  }

  /* ---- 部屋を作る ---- */
  async function createRoom() {
    if (lobbyBusy || !myId) return;
    setLobbyBusy(true);
    setMsg("");
    try {
      let id = null;
      for (let i = 0; i < 5 && !id; i++) {
        const cand = roomId();
        const ok = await runTransaction(db, async (tx) => {
          const ref = doc(db, "rooms", cand);
          const snap = await tx.get(ref);
          if (snap.exists()) {
            const d = snap.data();
            if (!d.closed && d.host) return false; // 使用中のIDなら作り直す
          }
          tx.set(ref, newLobby(myId));
          return true;
        });
        if (ok) id = cand;
      }
      if (!id) throw new Error("no id");
      enterRoom(id);
    } catch {
      setMsg("部屋を作れませんでした。もう一度お試しください");
    } finally {
      setLobbyBusy(false);
    }
  }

  /* ---- 部屋に入る ---- */
  async function joinRoom(raw) {
    const id = String(raw || "").trim().toUpperCase();
    if (id.length !== 4) {
      setMsg("4文字のIDを入力してください");
      return;
    }
    if (lobbyBusy || !myId) return;
    setLobbyBusy(true);
    setMsg("");
    try {
      const res = await runTransaction(db, async (tx) => {
        const ref = doc(db, "rooms", id);
        const snap = await tx.get(ref);
        if (!snap.exists()) return "none";
        const d = snap.data();
        if (d.closed || !d.host) return "none";
        if (d.host === myId || d.guest === myId) return "ok"; // 入り直し
        if (d.guest) return "full";
        if (d.phase !== "lobby" && d.phase !== "end") return "none"; // 古い形式の部屋
        tx.update(ref, {
          guest: myId,
          ready: { ...(d.ready || {}), [myId]: false },
          lobbyIn: { ...(d.lobbyIn || {}), [myId]: true },
        });
        return "ok";
      });
      if (res === "none") {
        setMsg("ルームが見つかりません");
      } else if (res === "full") {
        setMsg("すでに満室です");
      } else {
        setJoinInput("");
        enterRoom(id);
      }
    } catch {
      setMsg("通信に失敗しました。もう一度お試しください");
    } finally {
      setLobbyBusy(false);
    }
  }

  /* ---- 準備完了／取り消し ---- */
  async function toggleReady(next) {
    if (!room || !myId || lobbyBusy) return;
    if (next && !deckComplete) return;
    setLobbyBusy(true);
    setMsg("");
    const sel = { ...selection };
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "rooms", room);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("gone");
        const d = snap.data();
        if (d.host !== myId && d.guest !== myId) throw new Error("gone");
        let base;
        if (d.phase === "lobby") base = d;
        else if (d.phase === "end") base = lobbyDoc(d, myId);
        else return; // すでに対戦が始まっている
        const ready = { ...(base.ready || {}), [myId]: next };
        const sels = { ...(base.sels || {}), [myId]: sel };
        const lobbyIn = { ...(base.lobbyIn || {}), [myId]: true };
        const h = base.host;
        const g = base.guest;
        if (next && h && g && ready[h] && ready[g] && isComplete(sels[h]) && isComplete(sels[g])) {
          tx.set(ref, gameDoc(base, sels));
        } else {
          tx.set(ref, { ...base, ready, sels, lobbyIn });
        }
      });
    } catch {
      setMsg("通信に失敗しました。もう一度押してください");
    } finally {
      setLobbyBusy(false);
    }
  }

  /* ---- 再戦（ルームマッチ） ---- */
  async function rematchOnline() {
    const id = room;
    setResultState(null);
    setDetail(null);
    setMsg("");
    setScreen("deck");
    if (!id) return;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "rooms", id);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.phase === "end") {
          tx.set(ref, lobbyDoc(d, myId));
        } else if (d.phase === "lobby") {
          tx.update(ref, { lobbyIn: { ...(d.lobbyIn || {}), [myId]: true } });
        }
      });
    } catch {
      // 失敗しても「準備完了」を押したときに部屋を戻す
    }
  }

  /* ---- 再戦（CPU） ---- */
  function rematchCpu() {
    setCpuState(null);
    setCpuDeck(null);
    setRankView(null);
    setRankMsg("");
    setDetail(null);
    setMsg("");
    setMatchMode("cpu");
    setScreen("deck");
  }

  /* ---- スターピック ---- */
  function openStarpick() {
    setMsg("");
    if (!user) {
      setRankMsg("スターピックはログインが必要です。下の「ログイン」または「新規登録」からどうぞ");
      return;
    }
    setRankMsg("");
    setMatchMode(null);
    setScreen("starpick");
  }

  function startStarpick(run) {
    if (!user || !run || !isComplete(run.selection)) return;
    const d = opponentDeck(run.battle);
    const gameId = `starpick:${user.uid}:${Date.now()}`;
    markStarpickBattle(user.uid, gameId);
    setRankView(null);
    setCpuDeck(d);
    setCpuState({
      ...E.createLocalGame({
        p1: YOU_ID,
        p2: CPU_ID,
        sel1: run.selection,
        sel2: d.selection,
        first: Math.random() < 0.5 ? YOU_ID : CPU_ID,
        log: [`スターピック ${battleLabel(run.battle)}`],
      }),
      gameId,
      ranked: false,
      starpick: run.battle,
      spUid: user.uid,
    });
    setDetail(null);
    setMatchMode("cpu");
    setScreen("cpu");
  }

  function subscribe(id) {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(
      doc(db, "rooms", id),
      (s) => {
        if (s.exists()) {
          const d = s.data();
          if (d.closed) {
            leaveGame("menu");
            return;
          }
          setState(d);
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
  async function startCpu() {
    if (!deckComplete || rankBusy) return;
    if (!user) {
      setRankMsg("CPU戦（ランク戦）はログインが必要です。タイトル画面からログインしてください");
      return;
    }
    const gameId = `cpu:${E.uid()}:${Date.now()}`;
    setRankBusy(true);
    setRankMsg("");
    try {
      // 対戦開始時に、負け分のポイントを先に引いて保存しておく
      const r = await beginRankedMatch(user.uid, gameId);
      setRankData(r);
    } catch (e) {
      setRankMsg(`通信に失敗したため対戦を開始できませんでした（${e?.code || e?.message || "不明なエラー"}）`);
      setRankBusy(false);
      return;
    }
    setRankBusy(false);
    const base = DECKS.length ? pickDeck() : pickCpuDeck();
    const d = { ...base, style: base.styles ? resolveStyle(base.styles) : base.style };
    setRankView(null);
    settlingRef.current = null;
    setCpuDeck(d);
    setCpuState({
      ...E.createLocalGame({
        p1: YOU_ID,
        p2: CPU_ID,
        sel1: selection,
        sel2: d.selection,
        first: Math.random() < 0.5 ? YOU_ID : CPU_ID,
        log: [`CPUのデッキ: ${d.name}（Tier${d.tier}）`],
      }),
      gameId, // 連勝記録・ランク戦用の試合ID
      ranked: true,
      rankUid: user.uid,
    });
    setDetail(null);
    setMatchMode("cpu");
    setScreen("cpu");
  }

  /* ============ 読み込み中 ============ */
  if (!loaded) return <div className="p-8 text-center sme-label">LOADING...</div>;

  /* ============ 画面: メニュー ============ */
  if (screen === "menu") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
                 <NewsButton />
        <div className="sme-emblems mb-8">
          <div className="sme-emblem sun">☀</div>
          <div className="sme-emblem moon">☾</div>
          <div className="sme-emblem earth">◈</div>
        </div>
        <h1 className="sme-title text-3xl sm:text-4xl">PLANETVERSE</h1>
        <div className="sme-title-line" />
        <p className="sme-sub text-[11px] mt-4 mb-12">PLANETARY CARD BATTLE</p>

        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={() => {
              setMsg("");
              if (!user) {
                setRankMsg("CPU戦（ランク戦）はログインが必要です。下の「ログイン」または「新規登録」からどうぞ");
                return;
              }
              setRankMsg("");
              setMatchMode("cpu");
              setScreen("deck");
            }}
            className="sme-btn sme-btn-earth sme-glow text-lg"
          >
            CPU対戦
          </button>
          {user && (
            <RankBadge points={rankData ? rankData.points : null} streak={rankData ? rankData.streak : 0} mini />
          )}
          <button
            onClick={() => { setMsg(""); setScreen("roomMenu"); }}
            className="sme-btn sme-btn-sun sme-glow text-lg"
          >
            ルームマッチ
          </button>
          <button onClick={openStarpick} className="sme-btn sme-btn-moon sme-glow text-lg">
            スターピック
          </button>
                        {user && (
            <MyPageButton
              uid={user.uid}
              nickname={user.nickname}
              playerId={user.id}
              rankData={rankData}
              streaks={streaks}
            />
          )}
        </div>

        <div className="sme-panel mt-10 p-4 text-[11px] text-slate-300 leading-relaxed max-w-xs">
          10のコスト枠から各1種を選び、4枚ずつ計40枚のデッキを作ります。
          友達とのルームマッチと、CPU対戦が遊べます。
        </div>

        <div className="sme-panel mt-4 p-4 text-[11px] text-slate-300 w-full max-w-xs text-left">
          {user ? (
            <div className="flex justify-between items-center mb-3">
              <span>
                <span className="text-amber-300 text-sm font-bold">{user.nickname || "（名前なし）"}</span>
                <span className="text-slate-400 ml-2">ID: {user.id}</span>
              </span>
              <span className="flex gap-1">
                <button
                  onClick={() => { setNickEdit(true); setNickInput(user.nickname || ""); setAuthMsg(""); }}
                  className="sme-btn sme-btn-ghost sme-btn-sm !w-auto"
                >
                  名前変更
                </button>
                <button onClick={logout} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto">
                  ログアウト
                </button>
              </span>
            </div>
          ) : (
            <div className="mb-3 text-slate-400">
              ログインすると連勝記録がアカウントに保存され、別の端末でも引き継げます
              {rankMsg && <div className="text-rose-300 mt-1">{rankMsg}</div>}
            </div>
          )}
          <div className="flex justify-between mb-1">
            <span>CPU戦</span>
            <span>
              {/* CPU戦の連勝はランク戦の記録を使う（最高記録はランク導入前の記録も含める） */}
              現在 {rankData ? rankData.streak : (streaks.cpu && streaks.cpu.cur) || 0}連勝 / 最高{" "}
              {Math.max(rankData ? rankData.best || 0 : 0, (streaks.cpu && streaks.cpu.best) || 0)}連勝
            </span>
          </div>
          <div className="flex justify-between">
            <span>ルームマッチ</span>
            <span>
              現在 {(streaks.room && streaks.room.cur) || 0}連勝 / 最高 {(streaks.room && streaks.room.best) || 0}連勝
            </span>
          </div>

          {user && nickEdit && (
            <div className="flex flex-col gap-2 mt-3">
              <div className="text-slate-200 text-xs font-bold">ニックネーム変更</div>
              <input
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                placeholder="新しいニックネーム（12文字以内）"
                maxLength={12}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
              />
              <div className="flex gap-2">
                <button disabled={authBusy} onClick={saveNickname} className="sme-btn sme-btn-moon sme-btn-sm">
                  {authBusy ? "保存中…" : "保存する"}
                </button>
                <button
                  onClick={() => { setNickEdit(false); setAuthMsg(""); }}
                  className="sme-btn sme-btn-ghost sme-btn-sm"
                >
                  やめる
                </button>
              </div>
            </div>
          )}

          {!user && !authMode && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => openAuth("login")} className="sme-btn sme-btn-moon sme-btn-sm">
                ログイン
              </button>
              <button onClick={() => openAuth("signup")} className="sme-btn sme-btn-ghost sme-btn-sm">
                新規登録
              </button>
            </div>
          )}

          {!user && authMode && (
            <div className="flex flex-col gap-2 mt-3">
              <div className="text-slate-200 text-xs font-bold">
                {authMode === "signup" ? "新規登録" : "ログイン"}
              </div>
              {authMode === "signup" ? (
                <div className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-sm">
                  プレイヤーID：<span className="font-bold text-amber-300">{authId || "―"}</span>
                  <span className="text-[10px] text-slate-400 ml-2">（自動で決まります）</span>
                </div>
              ) : (
                <input
                  value={authId}
                  onChange={(e) => setAuthId(e.target.value)}
                  placeholder="プレイヤーID（a1〜z99）"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
                />
              )}
              <input
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                placeholder="パスワード（数字3桁）"
                type="password"
                inputMode="numeric"
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
              />
              {authMode === "signup" && (
                <>
                  <input
                    value={authNick}
                    onChange={(e) => setAuthNick(e.target.value)}
                    placeholder="ニックネーム（12文字以内）"
                    maxLength={12}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
                  />
                  <div className="text-[10px] text-amber-200">
                    ※ プレイヤーIDとパスワードは忘れないようにメモしてください（再発行できません）
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button
                  disabled={authBusy}
                  onClick={authMode === "signup" ? signup : login}
                  className="sme-btn sme-btn-moon sme-btn-sm"
                >
                  {authBusy ? "確認中…" : authMode === "signup" ? "登録する" : "ログイン"}
                </button>
                <button onClick={() => setAuthMode(null)} className="sme-btn sme-btn-ghost sme-btn-sm">
                  やめる
                </button>
              </div>
            </div>
          )}
          {authMsg && <div className="mt-2 text-amber-200">{authMsg}</div>}
        </div>
            <TutorialButton />
      </main>
    );
  }

  /* ============ 画面: ルームマッチ（作る／入る） ============ */
  if (screen === "roomMenu") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col justify-center">
        <h2 className="sme-heading text-2xl mb-6 text-center">ルームマッチ</h2>
        <div className="sme-panel p-5 flex flex-col gap-3">
          <button disabled={lobbyBusy} onClick={createRoom} className="sme-btn sme-btn-sun sme-glow">
            {lobbyBusy ? "作成中…" : "部屋を作る"}
          </button>
          <button
            disabled={lobbyBusy}
            onClick={() => { setMsg(""); setJoinInput(""); setScreen("join"); }}
            className="sme-btn sme-btn-moon"
          >
            部屋に入る
          </button>
          {msg && <div className="text-red-400 text-sm">{msg}</div>}
          <button
            onClick={() => { setMsg(""); setMatchMode(null); setScreen("menu"); }}
            className="sme-btn sme-btn-ghost"
          >
            戻る
          </button>
        </div>
      </main>
    );
  }

  /* ============ 画面: ルーム参加 ============ */
  if (screen === "join") {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto flex flex-col justify-center">
        <h2 className="sme-heading text-2xl mb-6 text-center">部屋に入る</h2>
        <div className="sme-panel p-5">
          <div className="sme-label mb-2">ROOM ID</div>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="4文字"
            className="w-full p-4 rounded-lg bg-slate-950/70 border border-amber-200/30 text-center text-3xl tracking-[0.3em] mb-3 font-bold text-amber-200 outline-none focus:border-amber-300 uppercase"
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          {msg && <div className="text-red-400 text-sm mb-3">{msg}</div>}
          <button disabled={lobbyBusy} onClick={() => joinRoom(joinInput)} className="sme-btn sme-btn-moon">
            {lobbyBusy ? "確認中…" : "入室する"}
          </button>
          <button onClick={() => { setMsg(""); setScreen("roomMenu"); }} className="sme-btn sme-btn-ghost mt-2">
            戻る
          </button>
        </div>
      </main>
    );
  }

  /* ============ 画面: デッキ選択 ============ */
  if (screen === "deck") {
    const isRoom = matchMode === "room";
    let oppStatus = "未入室（IDを伝えてください）";
    if (oppIdL) {
      if (lobby && lobby.phase === "end") oppStatus = "結果画面を見ています";
      else if (oppReady) oppStatus = "準備完了";
      else if (oppInLobby) oppStatus = "デッキ選択中";
      else oppStatus = "結果画面を見ています";
    }
    let hint = "";
    if (isRoom && myReady) {
      if (!oppIdL) hint = "相手の入室を待っています…";
      else if (!oppReady) hint = "相手の準備完了を待っています…";
      else hint = "対戦を開始します…";
    }

    return (
      <main className={`min-h-screen p-4 max-w-lg mx-auto ${isRoom ? "pb-72" : "pb-48"}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="sme-heading text-2xl">デッキ選択</h2>
          {isRoom ? (
            <button onClick={leaveOnline} className="sme-btn sme-btn-ghost sme-btn-sm !w-auto">
              退室する
            </button>
          ) : (
            <button
              onClick={() => { setMsg(""); setMatchMode(null); setScreen("menu"); }}
              className="sme-btn sme-btn-ghost sme-btn-sm !w-auto"
            >
              タイトルへ
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {isRoom ? "ルームマッチ" : "CPU対戦（ランク戦）"}｜各枠から1種類ずつ選択（「詳細」で効果を確認）
        </p>
        {!isRoom && user && (
          <div className="mb-4">
            <RankBadge points={rankData ? rankData.points : null} streak={rankData ? rankData.streak : 0} compact />
          </div>
        )}
        {locked && (
          <div className="sme-panel p-2 mb-4 text-[11px] text-amber-200 text-center">
            準備完了中はデッキを変更できません（変更するときは「準備を取り消す」）
          </div>
        )}

        {/* おすすめデッキ */}
        <div className="mb-6">
          <div className="sme-label mb-2">RECOMMENDED DECKS</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={openDeckSave}
              disabled={locked}
              title="今のデッキを保存"
              className="sme-btn sme-btn-sm shrink-0 !w-auto text-[13px] font-bold sme-btn-moon px-3"
            >
              ＋
            </button>
            {myDecks.map((d) => {
              const on = matchedMyDeck?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => { if (!locked) setSelection({ ...d.selection }); }}
                  className={`sme-btn sme-btn-sm shrink-0 !w-auto text-[11px] ${on ? "sme-btn-sun" : "sme-btn-ghost"}`}
                >
                  <span className="inline-block text-[9px] font-bold px-1 rounded mr-1 bg-emerald-600 text-white">
                    MY
                  </span>
                  {d.name}
                </button>
              );
            })}
            {PRESETS.map((d) => {
              const on = matchedPreset?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => { if (!locked) setSelection({ ...d.selection }); }}
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
          {deckSaveOpen && (
            <div className="sme-panel mt-2 p-3 flex flex-col gap-2">
              <div className="text-xs font-bold text-slate-200">今のデッキを保存</div>
              <input
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="デッキ名（16文字以内）"
                maxLength={16}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
              />
              <div className="text-[10px] text-slate-400">※ 同じ名前のデッキがあるときは上書きされます</div>
              <div className="flex gap-2">
                <button disabled={deckBusy} onClick={saveDeck} className="sme-btn sme-btn-moon sme-btn-sm">
                  {deckBusy ? "保存中…" : "保存する"}
                </button>
                <button
                  onClick={() => { setDeckSaveOpen(false); setDeckMsg(""); }}
                  className="sme-btn sme-btn-ghost sme-btn-sm"
                >
                  やめる
                </button>
              </div>
            </div>
          )}
          {deckMsg && <div className="mt-2 text-[11px] text-amber-200">{deckMsg}</div>}
          {matchedMyDeck && (
            <div className="sme-panel mt-2 p-3 flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 rounded bg-emerald-600 text-white">MY</span>
              <span className="text-sm font-bold">{matchedMyDeck.name}</span>
              <button
                disabled={deckBusy || locked}
                onClick={() => deleteDeck(matchedMyDeck)}
                className="sme-btn sme-btn-ghost sme-btn-sm !w-auto ml-auto text-[11px]"
              >
                削除
              </button>
            </div>
          )}
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
                {cardsBySlot(slot).some((c) => c.type === "magic") && " ・ MAGIC"}
                {cardsBySlot(slot).some((c) => c.type === "ability") && " ・ ABILITY"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cardsBySlot(slot).map((c) => {
                const on = selection[slot] === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => { if (!locked) setSelection({ ...selection, [slot]: c.id }); }}
                    className={`pick-card ${fxClass(c.faction)} ${on ? "is-on" : ""}`}
                  >
                    <div className="text-[10px] mb-1 fx-text font-bold">
                      {FACTION_LABEL[c.faction]}
                    </div>
                    <div className="text-[11px] font-bold leading-tight">{c.name}</div>
                    {c.stat && <div className="text-[10px] text-slate-400 mt-1">STAT {c.stat}</div>}
                    {c.type === "ability" && (
                      <div className="text-[10px] text-cyan-300 mt-1">ABILITY {abilityShort(c)}</div>
                    )}
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
            {isRoom && (
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="sme-label">ROOM ID</span>
                  <span className="text-2xl font-bold text-amber-200 tracking-[0.25em]">{room}</span>
                </div>
                <span className="text-[10px] text-slate-400">このIDを相手に伝えてください</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <span className="sme-label">DECK</span>
              <span className={`text-xs font-bold ${deckComplete ? "text-emerald-300" : "text-slate-400"}`}>
                {Object.keys(selection).length} / 10 枠選択済み
              </span>
            </div>

            {isRoom ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                  <div className="sme-panel px-2 py-1.5">
                    <span className="text-slate-400">あなた：</span>
                    <span className={myReady ? "text-emerald-300 font-bold" : "text-slate-200"}>
                      {myReady ? "準備完了" : "デッキ選択中"}
                    </span>
                  </div>
                  <div className="sme-panel px-2 py-1.5">
                    <span className="text-slate-400">相手：</span>
                    <span className={oppReady ? "text-emerald-300 font-bold" : "text-slate-200"}>
                      {oppStatus}
                    </span>
                  </div>
                </div>
                {msg && <div className="text-red-400 text-xs mb-2">{msg}</div>}
                {hint && <div className="text-[11px] text-amber-200 mb-2 text-center animate-pulse">{hint}</div>}
                {!state ? (
                  <button disabled className="sme-btn sme-btn-ghost">接続中…</button>
                ) : myReady ? (
                  <button disabled={lobbyBusy} onClick={() => toggleReady(false)} className="sme-btn sme-btn-ghost">
                    準備を取り消す
                  </button>
                ) : (
                  <button
                    disabled={lobbyBusy || !deckComplete}
                    onClick={() => toggleReady(true)}
                    className={`sme-btn sme-btn-sun ${deckComplete ? "sme-glow" : ""}`}
                  >
                    準備完了
                  </button>
                )}
              </>
            ) : (
              <>
                {rankMsg && <div className="text-rose-300 text-xs mb-2">{rankMsg}</div>}
                {!user && (
                  <div className="text-amber-200 text-xs mb-2">
                    CPU戦（ランク戦）はログインが必要です。タイトル画面からログインしてください
                  </div>
                )}
                <button
                  disabled={!deckComplete || rankBusy || !user}
                  onClick={startCpu}
                  className={`sme-btn sme-btn-earth ${deckComplete && user ? "sme-glow" : ""}`}
                >
                  {rankBusy ? "ポイントを確認中…" : "準備完了（対戦開始）"}
                </button>
              </>
            )}
          </div>
        </div>

        {detail && <DetailModal card={detail} onClose={() => setDetail(null)} />}
      </main>
    );
  }

  /* ============ 画面: スターピック ============ */
  if (screen === "starpick") {
    if (!user) {
      return (
        <main className="min-h-screen p-6 max-w-lg mx-auto text-center flex flex-col justify-center gap-4">
          <div className="text-sm text-slate-300">ログイン情報を確認しています…（ログインしていない場合は、タイトル画面からログインしてください）</div>
          <button onClick={() => setScreen("menu")} className="sme-btn sme-btn-ghost">
            タイトルへ戻る
          </button>
        </main>
      );
    }
    return <StarPick uid={user.uid} onStart={startStarpick} onTitle={() => setScreen("menu")} />;
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
        onRematch={cpuDeck && cpuDeck.starpick ? () => leaveGame("starpick") : rematchCpu}
        onTitle={() => leaveGame("menu")}
        onRetire={retire}
        rankView={rankView}
      />
    );
  }

  /* ============ 画面: オンライン対戦 ============ */
  const shown = resultState && (!state || state.phase !== "end") ? resultState : state;
  let rematchNote = null;
  if (resultState && state && state.phase !== "end") {
    const oppR = E.otherId(resultState, myId);
    const present = !!oppR && (state.host === oppR || state.guest === oppR);
    if (!present) {
      rematchNote = "相手は退室しました（再戦を押すと、この部屋で次の相手を待てます）";
    } else if (state.phase === "lobby" && state.lobbyIn && state.lobbyIn[oppR]) {
      rematchNote = "相手は再戦の準備を始めています";
    }
  }

  return (
    <GameScreen
      state={shown}
      myId={myId}
      room={room}
      apply={pushOnline}
      detail={detail}
      setDetail={setDetail}
      onRematch={rematchOnline}
      rematchNote={rematchNote}
      onTitle={leaveOnline}
      onRetire={retire}
      onRefresh={refreshOnline}
    />
  );
}
