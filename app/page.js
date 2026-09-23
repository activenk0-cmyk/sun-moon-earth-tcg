"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
} from "firebase/firestore";
import { SLOTS, FACTION_LABEL, getCard, cardsBySlot, tokenInfo } from "../lib/cards";

/* ============ 定数 ============ */
const MAX_FIELD = 5;
const MAX_HAND = 10;
const INITIAL_HP = 10;
const INITIAL_COST = 1;
const MAX_COST = 10;
const HASTE_EXTRA = 4;

const PHASE_LABEL = { draw: "ドロー", main: "メイン", sacrifice: "生贄" };

// 相手キャラを対象に取るモード
const OPP_TARGET_MODES = ["damage3", "destroy", "destroyDraw", "crest", "bounce", "goblin"];

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
const uid = () => Math.random().toString(36).slice(2, 10);
const roomId = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(selection) {
  const deck = [];
  SLOTS.forEach((slot) => {
    const cardId = selection[slot];
    for (let i = 0; i < 4; i++) {
      deck.push({ uid: uid(), cardId, costMod: 0 });
    }
  });
  return shuffle(deck);
}

function newPlayer(deck, selection) {
  return {
    hp: INITIAL_HP,
    maxCost: INITIAL_COST,
    cost: INITIAL_COST,
    deck,
    hand: [],
    field: [],
    grave: [],
    sacrifice: [],
    sacrificedThisTurn: false,
    pendingCost: 0,
    selection,
  };
}

// トークン情報（tokenInfo の戻り値）から場のユニットを作る
function tokenUnit(info) {
  const kws = [...info.keywords];
  return {
    uid: uid(),
    cardId: null,
    token: true,
    tokenId: info.tokenId || null,
    copyOf: info.copyOf || null,
    name: info.name,
    stat: info.stat,
    cost: info.cost,
    canAttack: kws.includes("speed") || kws.includes("rush"),
    attacked: false,
    noFaceAttack: kws.includes("rush"),
    keywords: kws,
    firstAttackUsed: false,
  };
}

function instFromCard(cardId) {
  const c = getCard(cardId);
  const kws = [...c.keywords];
  return {
    uid: uid(),
    cardId,
    token: false,
    copyOf: null,
    name: c.name,
    stat: c.stat,
    cost: c.cost,
    canAttack: kws.includes("speed") || kws.includes("rush"),
    attacked: false,
    noFaceAttack: kws.includes("rush"),
    keywords: kws,
    firstAttackUsed: false,
  };
}

const hasKw = (u, k) => u.keywords && u.keywords.includes(k);
const isInvincible = (u) => hasKw(u, "invincible");
// 効果判定用ID（コピー・トークンは元カードの能力を持つ）
const effectId = (u) => u.cardId || u.copyOf || null;
// 手札・場・生贄置き場のカード情報（トークンも通常カードと同じ形で扱う）
const handInfo = (h) => (h.cardId ? getCard(h.cardId) : tokenInfo(h));
const unitInfo = (u) => (u.cardId ? getCard(u.cardId) : tokenInfo(u));
const factionText = (f) =>
  f === "sun" ? "text-amber-400" : f === "moon" ? "text-indigo-300" : "text-emerald-300";

/* ============ メイン ============ */
export default function Home() {
  const [screen, setScreen] = useState("menu");
  const [selection, setSelection] = useState({});
  const [myId] = useState(() => uid());
  const [room, setRoom] = useState("");
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [pending, setPending] = useState(null);
  const [msg, setMsg] = useState("");
  const unsubRef = useRef(null);

  useEffect(() => () => unsubRef.current && unsubRef.current(), []);

  const deckComplete = SLOTS.every((s) => selection[s]);

  /* ---- ルーム作成 ---- */
  async function createRoom() {
    const id = roomId();
    const deck = buildDeck(selection);
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
      players: {
        [myId]: newPlayer(deck, selection),
      },
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

    const deck = buildDeck(selection);
    const hostId = d.host;
    const hp = { ...d.players };
    hp[myId] = newPlayer(deck, selection);
    // 初期手札5枚ずつ
    for (const pid of [hostId, myId]) {
      const p = hp[pid];
      p.hand = p.deck.slice(0, 5);
      p.deck = p.deck.slice(5);
    }
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

  async function push(next) {
    await updateDoc(doc(db, "rooms", room), next);
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
        </div>
      </main>
    );
  }

  /* ============ 画面: デッキ構築 ============ */
  if (screen === "deck") {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto pb-32">
        <h2 className="text-xl font-bold mb-1">デッキ構築</h2>
        <p className="text-xs text-slate-400 mb-4">
          各枠から1種類ずつ選択（「詳細」で効果を確認）
        </p>

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
        <button
          onClick={() => joinRoom(room)}
          className="w-full py-3 rounded-lg bg-indigo-500 font-bold"
        >
          参加する
        </button>
        <button
          onClick={() => setScreen("deck")}
          className="w-full py-3 mt-2 rounded-lg bg-slate-700"
        >
          戻る
        </button>
      </main>
    );
  }

  /* ============ 画面: ゲーム ============ */
  return (
    <GameScreen
      state={state} myId={myId} room={room} push={push}
      detail={detail} setDetail={setDetail}
      pending={pending} setPending={setPending}
    />
  );
}

/* ============ カード詳細モーダル（デッキ構築用） ============ */
function DetailModal({ card, onClose }) {
  const c = card;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50"
    >
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

/* ============ ゲーム画面 ============ */
function GameScreen({ state, myId, room, push, detail, setDetail, pending, setPending }) {
  const [sel, setSel] = useState(null); // 選択中の自軍ユニット
  const [mode, setMode] = useState(null); // 対象選択モード
  const [banner, setBanner] = useState(null);
  const [zone, setZone] = useState(null); // 生贄置き場の表示（"me" / "opp"）
  const lastTurnKey = useRef(null);

  // ターン切り替わり時のバナー
  useEffect(() => {
    if (!state || state.phase !== "play") return;
    const key = `${state.turnCount}-${state.turn}`;
    if (lastTurnKey.current === key) return;
    lastTurnKey.current = key;
    setSel(null);
    const mine = state.turn === myId;
    setBanner({ key, mine, text: mine ? "あなたのターンです" : "相手のターンです" });
  }, [state?.turnCount, state?.turn, state?.phase, myId]);

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

  const oppId = state.host === myId ? state.guest : state.host;
  const me = state.players[myId];
  const opp = state.players[oppId];
  const isMyTurn = state.turn === myId;
  const phase = state.turnPhase || "main";
  const canMain = isMyTurn && phase === "main" && !mode;

  if (!me || !opp) return <div className="p-8">読み込み中...</div>;

  /* ---- 勝敗判定（呼ぶのは常に自分のターン中＝自分がターンプレイヤー） ---- */
  function judge(players) {
    const a = players[myId], b = players[oppId];
    if (a.dead) return oppId;
    if (b.dead) return myId;
    const aDead = a.hp <= 0, bDead = b.hp <= 0;
    if (aDead && bDead) return myId; // 相打ちはターンプレイヤーの勝ち
    if (bDead) return myId;
    if (aDead) return oppId;
    return null;
  }

  /* ---- ドロー ---- */
  function drawCards(p, n, costMod) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) { p.dead = true; break; }
      const c = { ...p.deck[0] };
      if (costMod) c.costMod = (c.costMod || 0) + costMod;
      p.deck = p.deck.slice(1);
      if (p.deck.length === 0) p.dead = true;
      if (p.hand.length < MAX_HAND) p.hand = [...p.hand, c];
      else p.grave = [...p.grave, c];
      drawn.push(c);
    }
    return drawn;
  }

  /* ---- コスト有効化 ---- */
  function activateCost(p) {
    if (p.maxCost < MAX_COST) {
      p.maxCost += 1;
      p.cost += 1;
    }
  }

  /* ---- 破壊処理（誘発込み） ---- */
  function destroy(players, ownerId, unitUid, logs) {
    const owner = players[ownerId];
    const foeId = ownerId === myId ? oppId : myId;
    const foe = players[foeId];
    const u = owner.field.find((x) => x.uid === unitUid);
    if (!u) return;
    if (isInvincible(u)) return;

    owner.field = owner.field.filter((x) => x.uid !== unitUid);
    if (!u.token) owner.grave = [...owner.grave, { uid: u.uid, cardId: u.cardId }];
    logs.push(`${u.name} が破壊された`);

    switch (effectId(u)) {
      case "moon_maiden":
        drawCards(owner, 1);
        logs.push("月の少女: 1ドロー");
        break;
      case "earth_maiden":
        activateCost(owner);
        logs.push("地球の少女: コスト1有効化");
        break;
      case "moon_frog":
        owner.hp += 2;
        logs.push("月のカエル: HP+2");
        break;
      case "earth_frog":
        if (foe.maxCost > 0) {
          foe.maxCost -= 1;
          logs.push("地球のカエル: 相手の最大コスト-1");
        }
        break;
      case "moon_priest":
        drawCards(owner, 2);
        logs.push("月の僧侶: 2ドロー");
        break;
      case "moon_kamura": {
        const targets = foe.field.filter((x) => !isInvincible(x));
        if (targets.length) {
          const maxC = Math.max(...targets.map((x) => x.cost));
          const cands = targets.filter((x) => x.cost === maxC);
          const t = cands[Math.floor(Math.random() * cands.length)];
          owner.hp += t.cost;
          logs.push(`月の戦士・カムラ: ${t.name} を破壊しHP+${t.cost}`);
          destroy(players, foeId, t.uid, logs);
        }
        break;
      }
      case "earth_abyss":
        foe.hp -= 6;
        logs.push("地球の底より出でる者: 相手プレイヤーに6ダメージ");
        break;
      default:
        break;
    }
  }

  /* ---- ダメージ ---- */
  function damage(players, ownerId, unitUid, amount, logs) {
    const owner = players[ownerId];
    const u = owner.field.find((x) => x.uid === unitUid);
    if (!u || isInvincible(u)) return;
    u.stat -= amount;
    if (u.stat <= 0) destroy(players, ownerId, unitUid, logs);
  }

  const clone = () => JSON.parse(JSON.stringify(state.players));

  /* ---- 状態の保存（勝敗判定込み） ---- */
  async function commit(players, logs, extra = {}) {
    const skip = players.__skip;
    delete players.__skip;
    const entries = logs.filter(Boolean).map((t) => ({ by: myId, t }));
    const base = [...(state.log || []), ...entries];
    const w = judge(players);
    if (w) {
      await push({
        players, winner: w, phase: "end",
        log: [...base, { by: myId, t: "決着！" }].slice(-30),
      });
      return;
    }
    await push({
      players,
      ...(skip ? { skipNext: skip } : {}),
      ...extra,
      log: base.slice(-30),
    });
  }

  /* ---- 使用条件 ---- */
  function usableNow(cardId, p) {
    if (cardId === "earth_order") return p.field.some((x) => x.attacked && !isInvincible(x));
    return true;
  }

  /* ---- カードプレイ ---- */
  async function playCard(handIdx, haste) {
    if (!canMain) return;
    const players = clone();
    const p = players[myId];
    const o = players[oppId];
    const inst = p.hand[handIdx];
    const card = inst && handInfo(inst);
    if (!card) return;
    const baseCost = Math.max(0, card.cost + (inst.costMod || 0));
    const cost = baseCost + (haste ? HASTE_EXTRA : 0);
    if (p.cost < cost) return;
    if (card.type === "character" && p.field.length >= MAX_FIELD) return;
    if (!usableNow(card.id, p)) return;

    const logs = [];
    p.cost -= cost;
    p.hand = p.hand.filter((_, i) => i !== handIdx);

    if (card.type === "character") {
      const u = card.isToken ? tokenUnit(card) : instFromCard(inst.cardId);
      if (haste) u.canAttack = true;
      p.field = [...p.field, u];
      logs.push(`${card.name}${card.isToken ? "（トークン）" : ""} を召喚${haste ? "（即時）" : ""}`);

      // 召喚時効果（手札から出したコピー・トークンは元カードの召喚時効果を発動する）
      const sid = inst.cardId || card.copyOf || null;
      switch (sid) {
        case "sun_priest": {
          const t = o.field.filter((x) => !isInvincible(x));
          if (t.length) { setPendingTarget({ kind: "damage3", players, logs }); return; }
          break;
        }
        case "earth_priest":
          activateCost(p);
          logs.push("コスト1有効化");
          break;
        case "sun_albert":
          p.field.forEach((x) => { if (x.uid !== u.uid && !isInvincible(x)) x.stat += 3; });
          logs.push("自軍全体 +3");
          break;
        case "moon_albert": {
          const t = o.field.filter((x) => !isInvincible(x));
          if (t.length) { setPendingTarget({ kind: "destroyDraw", players, logs }); return; }
          drawCards(p, 1);
          logs.push("1ドロー");
          break;
        }
        case "earth_albert": {
          // 生贄置き場のコスト7以下のキャラ（トークン含む）のうち、最もコストが高いもののコピーを出す
          // 生贄置き場のカードは減らないので、何度でもコピーできる
          const chars = p.sacrifice
            .map((s) => handInfo(s))
            .filter((c) => c && c.type === "character" && c.cost <= 7);
          if (chars.length && p.field.length < MAX_FIELD) {
            const maxC = Math.max(...chars.map((c) => c.cost));
            const cands = chars.filter((c) => c.cost === maxC);
            const pick = cands[Math.floor(Math.random() * cands.length)];
            const info = pick.isToken ? pick : tokenInfo({ copyOf: pick.id });
            p.field = [...p.field, tokenUnit(info)];
            logs.push(`生贄置き場の ${pick.name}（コスト${pick.cost}）をコピーして場に出した`);
          } else if (!chars.length) {
            logs.push("地球のアルベール: コピーできるキャラがいない");
          }
          break;
        }
        case "sun_hector": {
          const empty = MAX_FIELD - p.field.length;
          for (let i = 0; i < empty; i++) {
            p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "hector_soldier" }))];
          }
          logs.push(`空き枠に兵士を${empty}体展開`);
          break;
        }
        case "earth_emerada": {
          const t = o.field.filter((x) => !isInvincible(x));
          if (t.length) { setPendingTarget({ kind: "destroy", players, logs }); return; }
          break;
        }
        case "moon_witch":
          players.__skip = oppId;
          logs.push("次の相手ターンをスキップ");
          break;
        default:
          break;
      }
    } else {
      // マジック
      p.grave = [...p.grave, { uid: inst.uid, cardId: inst.cardId }];
      logs.push(`${card.name} を使用`);
      switch (inst.cardId) {
        case "sun_crest": {
          const t = o.field.filter((x) => !isInvincible(x));
          if (t.length) { setPendingTarget({ kind: "crest", players, logs }); return; }
          break;
        }
        case "moon_crest": {
          const t = o.field.filter((x) => !isInvincible(x) && x.cost <= 5);
          if (t.length) { setPendingTarget({ kind: "bounce", players, logs }); return; }
          break;
        }
        case "earth_crest":
          p.pendingCost = (p.pendingCost || 0) + 1;
          if (p.hand.length) { setPendingTarget({ kind: "reduce1", players, logs }); return; }
          break;
        case "sun_order":
          for (let i = 0; i < 2 && p.field.length < MAX_FIELD; i++)
            p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "sun_soldier" }))];
          logs.push("太陽の兵士（スタッツ3）を展開");
          break;
        case "moon_order":
          drawCards(p, 2);
          logs.push("2ドロー");
          break;
        case "earth_order":
          setPendingTarget({ kind: "reattack", players, logs });
          return;
        case "sun_judgment":
          [...o.field].forEach((x) => damage(players, oppId, x.uid, 6, logs));
          logs.push("相手全体に6ダメージ");
          break;
        case "moon_judgment":
          drawCards(p, 2, -4);
          logs.push("2ドロー（コスト-4）");
          break;
        case "earth_judgment":
          for (let i = 0; i < 2 && p.field.length < MAX_FIELD; i++)
            p.field = [...p.field, tokenUnit(tokenInfo({ tokenId: "earth_guardian" }))];
          p.field.forEach((x) => {
            if (!isInvincible(x) && !x.keywords.includes("defender")) x.keywords.push("defender");
          });
          logs.push("大地の守人（スタッツ6）を展開・全体ディフェンダー");
          break;
        default:
          break;
      }
    }

    await commit(players, logs);
  }

  function setPendingTarget(pt) {
    setSel(null);
    setPending(pt);
    setMode(pt.kind);
  }

  /* ---- 対象選択の確定 ---- */
  async function resolveTarget(targetUid) {
    if (!pending) return;
    const { kind, players, logs } = pending;
    const p = players[myId], o = players[oppId];

    switch (kind) {
      case "damage3":
        damage(players, oppId, targetUid, 3, logs);
        break;
      case "destroy":
        destroy(players, oppId, targetUid, logs);
        break;
      case "destroyDraw":
        destroy(players, oppId, targetUid, logs);
        drawCards(p, 1);
        logs.push("1ドロー");
        break;
      case "crest": {
        damage(players, oppId, targetUid, 4, logs);
        [...o.field].forEach((x) => {
          if (x.uid !== targetUid) damage(players, oppId, x.uid, 1, logs);
        });
        break;
      }
      case "bounce": {
        const t = o.field.find((x) => x.uid === targetUid);
        if (t) {
          o.field = o.field.filter((x) => x.uid !== targetUid);
          if (o.hand.length >= MAX_HAND) {
            // 手札が満杯：トークンは破壊、カードは墓地へ（どちらも破壊時効果なし）
            if (t.token) {
              logs.push(`${t.name}（トークン）は手札が満杯のため破壊された（破壊時効果なし）`);
            } else {
              o.grave = [...o.grave, { uid: t.uid, cardId: t.cardId, costMod: 0 }];
              logs.push(`${t.name} は手札が満杯のため墓地へ`);
            }
          } else {
            const back = t.token
              ? {
                  uid: uid(), cardId: null, token: true,
                  tokenId: t.tokenId || null, copyOf: t.copyOf || null,
                  name: t.name, costMod: 0,
                }
              : { uid: t.uid, cardId: t.cardId, costMod: 0 };
            o.hand = [...o.hand, back];
            logs.push(`${t.name}${t.token ? "（トークン）" : ""} を手札に戻した`);
          }
        }
        drawCards(p, 1);
        break;
      }
      case "reduce1": {
        const idx = p.hand.findIndex((h) => h.uid === targetUid);
        if (idx >= 0) {
          p.hand[idx].costMod = (p.hand[idx].costMod || 0) - 1;
          logs.push("手札1枚のコスト-1");
        }
        break;
      }
      case "reattack": {
        const t = p.field.find((x) => x.uid === targetUid);
        if (t && t.attacked && !isInvincible(t)) {
          t.attacked = false;
          t.canAttack = true;
          logs.push(`${t.name} が再攻撃可能`);
        }
        break;
      }
      case "goblin": {
        const tg = o.field.find((x) => x.uid === targetUid);
        if (tg && !isInvincible(tg)) {
          tg.stat -= 1;
          logs.push(`月のゴブリン: ${tg.name} -1`);
          if (tg.stat <= 0) destroy(players, oppId, tg.uid, logs);
        }
        setPending(null);
        setMode(null);
        await resolveAttack(players, logs, pending.atk);
        return;
      }
      default: break;
    }

    setPending(null);
    setMode(null);
    await commit(players, logs);
  }

  /* ---- 攻撃宣言 ---- */
  async function attack(attackerUid, targetUid, toFace) {
    if (!canMain) return;
    const players = clone();
    const p = players[myId], o = players[oppId];
    const a = p.field.find((x) => x.uid === attackerUid);
    if (!a || a.attacked || !a.canAttack) return;
    if (toFace && a.noFaceAttack) return;

    const logs = [];
    const eid = effectId(a);

    // 攻撃時誘発
    if (eid === "sun_goblin") {
      p.field.forEach((x) => { if (x.uid !== a.uid && !isInvincible(x)) x.stat += 1; });
      logs.push("太陽のゴブリン: 自軍+1");
    }
    if (eid === "earth_goblin") {
      if (p.maxCost < 6) { activateCost(p); logs.push("地球のゴブリン: コスト有効化"); }
      else { drawCards(p, 1); logs.push("地球のゴブリン: 1ドロー"); }
    }
    if (eid === "earth_abyss" && !a.firstAttackUsed) {
      a.firstAttackUsed = true;
      o.hp -= 6;
      logs.push("地球の底より出でる者: 相手に6ダメージ");
      if (o.hp <= 0) {
        a.attacked = true;
        a.canAttack = false;
        await commit(players, logs);
        return;
      }
    }

    const atk = { attackerUid, targetUid, toFace };

    if (eid === "moon_goblin") {
      const t = o.field.filter((x) => !isInvincible(x));
      if (t.length) {
        setPendingTarget({ kind: "goblin", players, logs, atk });
        return;
      }
    }

    await resolveAttack(players, logs, atk);
  }

  /* ---- 戦闘解決 ---- */
  async function resolveAttack(players, logs, atk) {
    const p = players[myId], o = players[oppId];
    const a = p.field.find((x) => x.uid === atk.attackerUid);
    if (!a) { await commit(players, logs); return; }

    a.attacked = true;
    a.canAttack = false;

    if (atk.toFace) {
      o.hp -= a.stat;
      logs.push(`${a.name} が相手プレイヤーに${a.stat}ダメージ`);
    } else {
      const d = o.field.find((x) => x.uid === atk.targetUid);
      if (!d) {
        logs.push(`${a.name} の攻撃対象がいなくなった`);
      } else {
        const aStat = a.stat, dStat = d.stat;
        logs.push(`${a.name} が ${d.name} を攻撃`);
        if (!isInvincible(d)) {
          d.stat -= aStat;
          if (d.stat <= 0) destroy(players, oppId, d.uid, logs);
        }
        if (!isInvincible(a)) {
          a.stat -= dStat;
          if (a.stat <= 0) destroy(players, myId, a.uid, logs);
        }
      }
    }

    await commit(players, logs);
  }

  /* ---- ドローフェーズ ---- */
  async function drawStep() {
    if (!isMyTurn || phase !== "draw") return;
    const players = clone();
    drawCards(players[myId], 1);
    await commit(players, ["カードを1枚引いた"], { turnPhase: "main" });
  }

  /* ---- 生贄フェーズへ ---- */
  async function toSacrifice() {
    if (!canMain) return;
    setSel(null);
    await push({
      turnPhase: "sacrifice",
      log: [...(state.log || []), { by: myId, t: "生贄フェーズへ" }].slice(-30),
    });
  }

  /* ---- 生贄（トークンも可能） ---- */
  async function sacrificeCard(idx) {
    if (!isMyTurn || phase !== "sacrifice") return;
    if (me.sacrificedThisTurn || me.maxCost >= MAX_COST) return;
    const players = clone();
    const p = players[myId];
    const inst = p.hand[idx];
    const card = inst && handInfo(inst);
    if (!card) return;
    p.hand = p.hand.filter((_, i) => i !== idx);
    const entry = card.isToken
      ? {
          uid: inst.uid, cardId: null, token: true,
          tokenId: card.tokenId || null, copyOf: card.copyOf || null, name: card.name,
        }
      : { uid: inst.uid, cardId: inst.cardId };
    p.sacrifice = [...p.sacrifice, entry];
    p.maxCost += 1;
    p.hp += card.cost;
    p.sacrificedThisTurn = true;
    const logs = [
      `${card.name}${card.isToken ? "（トークン）" : ""} を生贄に（コスト上限+1 / HP+${card.cost} / 1ドロー）`,
    ];
    drawCards(p, 1);
    await commit(players, logs);
  }

  /* ---- ターン終了 ---- */
  async function endTurn() {
    if (!isMyTurn || phase !== "sacrifice" || mode) return;
    const players = clone();
    const p = players[myId], o = players[oppId];
    const logs = ["ターン終了"];

    p.field.forEach((x) => { x.attacked = false; x.canAttack = true; x.noFaceAttack = false; });
    p.sacrificedThisTurn = false;

    let nextTurn = oppId;
    let starter = o;
    if (state.skipNext === oppId) {
      logs.push("相手のターンをスキップ（もう一度自分のターン）");
      nextTurn = myId;
      starter = p;
    }

    // 次のターンプレイヤーのターン開始処理（ドローは手動）
    if (starter.pendingCost) {
      for (let i = 0; i < starter.pendingCost; i++) activateCost(starter);
      starter.pendingCost = 0;
    }
    starter.cost = starter.maxCost;
    starter.field.forEach((x) => { x.canAttack = true; x.attacked = false; });

    const entries = logs.map((t) => ({ by: myId, t }));
    await push({
      players,
      turn: nextTurn,
      turnPhase: "draw",
      skipNext: null,
      turnCount: state.turnCount + 1,
      log: [...(state.log || []), ...entries].slice(-30),
    });
  }

  /* ---- 攻撃可能判定 ---- */
  const oppHasDefender = opp.field.some((x) => hasKw(x, "defender"));
  const attackable = (u) => {
    if (oppHasDefender) return hasKw(u, "defender");
    return !hasKw(u, "untargetable_by_attack");
  };
  const selUnit = me.field.find((x) => x.uid === sel);
  const canFace = selUnit && !oppHasDefender && !selUnit.noFaceAttack;

  const oppTargetable = (u) => {
    if (OPP_TARGET_MODES.includes(mode)) {
      if (isInvincible(u)) return false;
      if (mode === "bounce" && u.cost > 5) return false;
      return true;
    }
    if (!mode && sel && canMain) return attackable(u);
    return false;
  };

  const logText = (l) =>
    typeof l === "string" ? l : `${l.by === myId ? "自分" : "相手"}｜${l.t}`;

  /* ============ 描画 ============ */
  if (state.phase === "end") {
    return (
      <main className="min-h-screen p-8 text-center max-w-lg mx-auto">
        <h1 className="text-4xl font-bold my-10">
          {state.winner === myId ? "勝利！" : "敗北..."}
        </h1>
        <div className="text-xs text-slate-400 mb-6">
          {(state.log || []).slice(-5).map((l, i) => <div key={i}>{logText(l)}</div>)}
        </div>
        <button onClick={() => location.reload()} className="px-6 py-3 rounded-lg bg-slate-700">
          もう一度
        </button>
      </main>
    );
  }

  const zoneList = zone === "me" ? me.sacrifice : zone === "opp" ? opp.sacrifice : [];

  return (
    <main className="min-h-screen max-w-lg mx-auto pb-28 text-sm">
      {/* 相手情報 + ターン表示 */}
      <div className="sticky top-0 z-10">
        <div className="p-3 bg-slate-800">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">相手</span>
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
          ターン{state.turnCount}｜{isMyTurn ? "あなた" : "相手"}の{PHASE_LABEL[phase]}フェーズ
        </div>
      </div>

      {/* 相手の場 */}
      <div className="p-2 min-h-[90px] border-b border-slate-700">
        <div className="text-[10px] text-slate-500 mb-1">相手の場</div>
        <div className="flex gap-1 flex-wrap">
          {opp.field.map((u) => (
            <UnitCard
              key={u.uid} u={u} foe
              targetable={oppTargetable(u)}
              onTap={() => {
                if (OPP_TARGET_MODES.includes(mode)) {
                  if (oppTargetable(u)) resolveTarget(u.uid);
                  return;
                }
                if (mode) return;
                if (sel && canMain && attackable(u)) {
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
      {sel && canMain && (
        canFace ? (
          <button
            onClick={() => { attack(sel, null, true); setSel(null); }}
            className="w-full py-2 bg-red-600 font-bold text-xs"
          >
            相手プレイヤーを攻撃
          </button>
        ) : (
          <div className="w-full py-2 bg-slate-800 text-center text-[11px] text-slate-400">
            {oppHasDefender
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
              targetable={mode === "reattack" && u.attacked && !isInvincible(u)}
              ready={canMain && u.canAttack && !u.attacked}
              onTap={() => {
                if (mode === "reattack") {
                  if (u.attacked && !isInvincible(u)) resolveTarget(u.uid);
                  return;
                }
                if (mode) return;
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
            const c = handInfo(h);
            if (!c) {
              // 旧バージョンで戻されたトークン（情報なし）
              return (
                <div key={h.uid} className="shrink-0 w-24 p-2 rounded-lg border-2 border-slate-800 bg-slate-900 opacity-50">
                  <div className="text-[9px] text-slate-400">トークン</div>
                  <div className="text-[10px] font-bold leading-tight mt-1">{h.name}</div>
                  <div className="text-[9px] text-slate-500">使用不可</div>
                </div>
              );
            }
            const cost = Math.max(0, c.cost + (h.costMod || 0));
            const fieldOk = c.type !== "character" || me.field.length < MAX_FIELD;
            const can = canMain && me.cost >= cost && fieldOk && usableNow(c.id, me);
            const canHaste = canMain && fieldOk && me.cost >= cost + HASTE_EXTRA
              && c.type === "character" && !c.keywords.includes("speed") && !c.keywords.includes("rush");
            const canSacNow = isMyTurn && phase === "sacrifice" && !me.sacrificedThisTurn && me.maxCost < MAX_COST;
            const bright = mode === "reduce1" || can || canSacNow;
            return (
              <div key={h.uid} className="shrink-0 w-24">
                <button
                  onClick={() => {
                    if (mode === "reduce1") { resolveTarget(h.uid); return; }
                    if (mode) return;
                    setDetail({ card: c, handIdx: i, cost, can, canHaste });
                  }}
                  className={`w-full p-2 rounded-lg text-left border-2 ${
                    mode === "reduce1" ? "border-sky-400 bg-slate-800"
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
            相手の{PHASE_LABEL[phase]}フェーズ中です…
          </div>
        )}

        {isMyTurn && phase === "draw" && (
          <button
            onClick={drawStep}
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
              onClick={toSacrifice}
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
                : me.maxCost >= MAX_COST
                  ? "コスト上限のため生贄できません"
                  : "手札をタップして生贄にできます（任意・1回まで）"}
            </div>
            <button
              onClick={endTurn}
              className="w-full py-3 rounded-lg bg-indigo-500 font-bold"
            >
              {me.sacrificedThisTurn ? "ターン終了" : "生贄せずにターン終了"}
            </button>
          </>
        )}
      </div>

      {mode && (
        <div className="fixed bottom-0 left-0 right-0 bg-sky-600 p-3 text-center text-sm font-bold z-30">
          {MODE_MSG[mode] || "対象を選んでください"}
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
              {zone === "me" ? "自分" : "相手"}の生贄置き場（{zoneList.length}枚）
            </div>
            <div className="max-h-72 overflow-y-auto">
              {zoneList.length === 0 ? (
                <div className="text-xs text-slate-400">まだありません</div>
              ) : (
                zoneList.map((s, i) => {
                  const c = handInfo(s);
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
            playCard(detail.handIdx, haste);
            setDetail(null);
          }}
          onSac={() => { sacrificeCard(detail.handIdx); setDetail(null); }}
          canSac={isMyTurn && phase === "sacrifice" && !me.sacrificedThisTurn && me.maxCost < MAX_COST}
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
  const c = detail.card || (u ? unitInfo(u) : null);
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
              <button
                onClick={() => onPlay(true)}
                className="w-full py-3 rounded-lg bg-red-500 font-bold"
              >
                即時召喚（コスト {detail.cost + HASTE_EXTRA}）
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
