"use client";

// 対戦中の演出（案B）の再生と表示をまとめたファイル
// ・useFxPlayer：新しいログの「出来事」を見つけて順番に再生する（GameScreen で使う）
//   演出の間は、ひとつ前の盤面から出来事に合わせて少しずつ進めた盤面（disp）を表示し、
//   終わったら本当の盤面に切り替える（破壊されたカードが演出の前に消えないようにするため）
// ・FxLayer：帯（画面上部の一言）・カットイン・数字のポップ・札・光る枠・タップで飛ばす
// 出来事→演出の対応表は lib/fx.js、アニメーションは app/globals.css（fxa- / fxo- / fx-）

import { useState, useEffect, useRef, useCallback } from "react";
import * as F from "../lib/fx";
import * as E from "../lib/engine";
import { newEntries, maxSeq, diffBoards } from "../lib/online";
import { FACTION_LABEL, typeLabel } from "../lib/cards";
import { fxClass } from "./GameParts";

const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// 画面の描き直しを待つ（場に出たキャラの位置を測るため）
const frame = () =>
  new Promise((r) => {
    if (typeof requestAnimationFrame === "undefined") return r();
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
  });

// data-fx の要素の画面上の位置
function rectOf(key) {
  if (!key || typeof document === "undefined") return null;
  const el = document.querySelector(`[data-fx="${key}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const OVERLAY_LIFE = 1200; // ポップ・札などを残しておく時間

/* ============ 再生 ============ */
// state：今の状態 / myId：自分のID / speed："normal" | "fast" | "none"
export function useFxPlayer(state, myId, speed) {
  const [queue, setQueue] = useState([]); // 再生待ち（1回の状態の変化ごと）
  const [disp, setDisp] = useState(null); // 演出中に表示するプレイヤーのデータ（null なら本当の盤面）
  const [marks, setMarks] = useState({}); // カードに付けるクラス
  const [banner, setBanner] = useState(null);
  const [cutin, setCutin] = useState(null);
  const [overlays, setOverlays] = useState([]);
  const prevRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // 新しいログを見つけて再生待ちに追加
  useEffect(() => {
    if (!state || !state.players) return;
    const prev = prevRef.current;
    const curLog = state.log || [];
    const curSeq = maxSeq(curLog);
    prevRef.current = { log: curLog, players: state.players, seq: curSeq, gameNo: state.gameNo || 0, gameId: state.gameId || null };
    if (!prev || state.phase === "waiting" || state.phase === "lobby") return;
    if (speedRef.current === "none") return;
    if (prev.gameNo !== (state.gameNo || 0) || prev.gameId !== (state.gameId || null)) return; // 別の試合
    if (!prev.players || !Object.keys(prev.players).length) return;
    const oppId = E.otherId(state, myId);
    if (!oppId) return;
    const fresh =
      curSeq > 0
        ? curLog.filter((l) => l && typeof l === "object" && (l.n || 0) > prev.seq)
        : newEntries(prev.log, curLog);
    const groups = F.buildGroups(fresh, myId);
    if (!groups.length) return;
    // 出来事の記録が無いログ（古い版で行った操作）は、盤面の差分から演出を作る
    if (groups.every((g) => g.legacy)) {
      const lines = groups.flatMap((g) => g.lines);
      const changes = diffBoards(prev.players, state.players, myId, oppId, lines);
      const target = groups.find((g) => !g.mine) || groups[0];
      target.events = F.diffToEvents(changes, myId, oppId, state.players);
    }
    setQueue((q) => [...q, { id: E.uid(), prev: prev.players, final: state.players, groups }]);
  }, [state, myId]);

  const current = queue[0] || null;

  // 1件ずつ再生
  useEffect(() => {
    if (!current) return;
    let dead = false;
    (async () => {
      const mul = Math.max(0.05, F.speedMul(speedRef.current) || 0.05);
      const work = F.clonePlayers(current.prev);
      const show = () => setDisp(F.clonePlayers(work));
      show();
      for (const g of current.groups) {
        if (dead) return;
        const shown = new Set();
        if (g.lines.length) {
          const hb = rectOf("header");
          // 帯は、画面上部のパネル（場と同じ中央の列）の真下に、同じ幅で出す
          setBanner({
            key: E.uid(), text: F.mainLine(g), tag: F.groupTag(g), mine: g.mine,
            top: hb ? hb.y + hb.h : 0, left: hb ? hb.x : 0, width: hb ? hb.w : null,
          });
          await wait(F.BANNER_LEAD * mul);
        } else {
          setBanner(null);
        }
        for (const step of F.buildSteps(g.events)) {
          if (dead) return;
          // 場に姿がないカード（マジック・アビリティ・破壊されたキャラの効果など）はカットイン
          const cuts = F.cutinsOf(step, work, myId, shown);
          for (const c of cuts) {
            setCutin({ ...c, key: E.uid(), ms: Math.round(F.CUTIN_MS * mul) });
            await wait(F.CUTIN_MS * mul);
            if (dead) return;
            setCutin(null);
            await wait(50 * mul);
          }
          // 盤面の演出
          step.forEach((ev) => F.applyPre(work, ev, current.final));
          show();
          setMarks(F.marksOf(step, myId));
          await frame();
          if (dead) return;
          const now = Date.now();
          const fresh = F.overlaysOf(step, myId)
            .map((o) => ({ ...o, key: E.uid(), at: now, rect: rectOf(o.target), fromRect: o.from ? rectOf(o.from) : null }))
            .filter((o) => o.rect);
          setOverlays((list) => [...list.filter((x) => now - x.at < OVERLAY_LIFE), ...fresh]);
          await wait(F.stepDuration(step, mul));
          if (dead) return;
          step.forEach((ev) => F.applyPost(work, ev));
          show();
          setMarks({});
          await wait(40);
        }
        await wait(F.GROUP_GAP * mul);
      }
      if (dead) return;
      setBanner(null);
      setDisp(F.clonePlayers(current.final));
      setQueue((q) => q.slice(1));
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // すべて終わったら本当の盤面に戻す
  useEffect(() => {
    if (queue.length) return;
    setDisp(null);
    setMarks({});
    setBanner(null);
    setCutin(null);
    const t = setTimeout(() => setOverlays([]), OVERLAY_LIFE);
    return () => clearTimeout(t);
  }, [queue.length]);

  // 演出を「なし」にしたら、残りは飛ばす
  useEffect(() => {
    if (speed === "none") setQueue([]);
  }, [speed]);

  const skipAll = useCallback(() => {
    setQueue([]);
    setOverlays([]);
  }, []);

  return { disp, marks, banner, cutin, overlays, playing: !!current, skipAll };
}

/* ============ 表示 ============ */
export default function FxLayer({ fx, oppLabel }) {
  const { banner, cutin, overlays, playing, skipAll } = fx;
  return (
    <>
      {/* 演出中：画面タップで残りを飛ばす */}
      {playing && (
        <div onClick={skipAll} className="fixed inset-0 z-[44]" aria-label="演出をスキップ">
          <div className="fx-skip-hint">タップでスキップ</div>
        </div>
      )}

      {/* 帯（画面上部の一言） */}
      {banner && (
        <div
          className="fixed z-[46] pointer-events-none"
          style={banner.width ? { top: banner.top, left: banner.left, width: banner.width } : { top: banner.top, left: 0, right: 0 }}
        >
          <div key={banner.key} className={`fx-banner ${banner.mine ? "me" : ""}`}>
            <span className={`fx-banner-tag ${banner.tag.cls}`}>{banner.tag.text}</span>
            <span className="truncate">
              {banner.mine ? "あなた" : oppLabel}：{banner.text}
            </span>
          </div>
        </div>
      )}

      {/* カットイン（場に姿がないカード） */}
      {cutin && (
        <div className="fixed inset-0 z-[47] flex items-center justify-center pointer-events-none p-8">
          <div
            key={cutin.key}
            className={`fx-cutin ${fxClass(cutin.card?.faction)} ${cutin.mine ? "me" : "opp"}`}
            style={{ animationDuration: `${cutin.ms}ms` }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="fx-cutin-lb">{cutin.lb}</span>
              <span className={`text-[10px] font-bold ${cutin.mine ? "text-emerald-300" : "text-rose-300"}`}>
                {cutin.mine ? "あなた" : oppLabel}
              </span>
            </div>
            <div className="sme-heading text-lg leading-tight text-white">{cutin.name}</div>
            {cutin.card && (
              <div className="text-[10px] fx-text font-bold mt-0.5">
                {FACTION_LABEL[cutin.card.faction] || ""} / コスト {cutin.card.cost} / {typeLabel(cutin.card)}
              </div>
            )}
            {cutin.card?.text && <div className="fx-cutin-text">{cutin.card.text}</div>}
          </div>
        </div>
      )}

      {/* 数字のポップ・札・光る枠・スライド */}
      {overlays.map((o) => {
        const r = o.rect;
        const cx = r.x + r.w / 2;
        if (o.type === "pop") {
          return (
            <div key={o.key} className={`fxo-pop ${o.tone || "bad"}`} style={{ left: cx, top: r.y + r.h * 0.35 }}>
              {o.text}
            </div>
          );
        }
        if (o.type === "chip") {
          return (
            <div key={o.key} className={`fxo-chip ${o.tone || ""}`} style={{ left: cx, top: r.y - 2 }}>
              {o.text}
            </div>
          );
        }
        if (o.type === "ring") {
          return (
            <div
              key={o.key}
              className={`fxo-ring ${o.tone || "bad"}`}
              style={{ left: r.x - 3, top: r.y - 3, width: r.w + 6, height: r.h + 6 }}
            />
          );
        }
        if (o.type === "draw") {
          // 山札の方から手札へ、裏向きのカードがスライドして入る
          const from = o.fromRect;
          const x = Math.min(r.x + r.w - 40, r.x + Math.max(0, r.w - 40));
          const y = r.y + Math.max(0, (r.h - 46) / 2);
          const dx = from ? from.x + from.w / 2 - (x + 17) : 60;
          const dy = from ? from.y + from.h / 2 - (y + 23) : 0;
          return Array.from({ length: o.n || 1 }).map((_, i) => (
            <div
              key={`${o.key}-${i}`}
              className="fxo-draw"
              style={{ left: x - i * 10, top: y, "--dx": `${dx}px`, "--dy": `${dy}px`, animationDelay: `${i * 90}ms` }}
            />
          ));
        }
        if (o.type === "sac") {
          // 手札から生贄置き場へ吸い込まれる
          const from = o.fromRect || r;
          const sx = from.x + from.w / 2 - 17;
          const sy = from.y + from.h / 2 - 23;
          return (
            <div
              key={o.key}
              className="fxo-sac"
              style={{ left: sx, top: sy, "--dx": `${cx - (sx + 17)}px`, "--dy": `${r.y + r.h / 2 - (sy + 23)}px` }}
            />
          );
        }
        return null;
      })}
    </>
  );
}
