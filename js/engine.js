// AURORA DUEL — deterministic-ish duel engine. Host authoritative.
import { CARDS, DECK_LIST } from './cards.js';

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const rand = (n) => Math.floor(Math.random() * n);
export const ZONE_COLS = 4;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardOf(inst) { return inst ? CARDS[inst.cardId] : null; }
export function effAtk(inst) { const c = cardOf(inst); return c ? Math.max(0, c.atk + (inst.atkMod || 0)) : 0; }
export function effDef(inst) { const c = cardOf(inst); return c ? Math.max(0, c.def + (inst.defMod || 0)) : 0; }
export function isMonster(inst) { return cardOf(inst)?.type === 'monster'; }
export function isSpell(inst) { return cardOf(inst)?.type === 'spell'; }
export function isTrap(inst) { return cardOf(inst)?.type === 'trap'; }

function makeDeck(nextUid) {
  const deck = [];
  for (const [id, count] of DECK_LIST) {
    for (let i = 0; i < count; i++) {
      deck.push({ uid: `u${nextUid()}`, cardId: id, atkMod: 0, defMod: 0, position: null, faceDown: false, attacked: false, changed: false, setTurn: 0, summonedTurn: 0 });
    }
  }
  return shuffle(deck);
}

function makePlayer(name, isAI, nextUid) {
  return {
    name, isAI, lp: 8000,
    deck: makeDeck(nextUid),
    hand: [],
    field: { monsters: Array(ZONE_COLS).fill(null), spells: Array(ZONE_COLS).fill(null) },
    grave: [],
    normalSummoned: false,
    turnsTaken: 0,
    stats: { damage: 0, destroyed: 0, summons: 0, spells: 0 }
  };
}

export function createDuel({ names = ['あなた', 'ポーラーAI'], ai = [false, true], roomCode = '' } = {}) {
  let uid = 1;
  const nextUid = () => uid++;
  const state = {
    v: 2,
    roomCode,
    seq: 0,
    turn: 1,
    turnPlayer: 0,
    phase: 'main',
    players: [makePlayer(names[0] || 'あなた', !!ai[0], nextUid), makePlayer(names[1] || 'ポーラーAI', !!ai[1], nextUid)],
    log: [],
    winner: null,
    reason: null,
    startedAt: Date.now(),
    lastAction: null
  };
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 5; i++) state.players[p].hand.push(state.players[p].deck.pop());
    state.players[p].hand.sort((a, b) => handSort(a) - handSort(b));
  }
  pushLog(state, `ROOM ${roomCode || 'LOCAL'} — 北極決闘開始。`, 'system');
  pushLog(state, `${state.players[0].name} の先攻。`, 'turn');
  return state;
}

function handSort(inst) {
  const c = cardOf(inst);
  if (!c) return 9;
  if (c.type === 'monster') return 0;
  if (c.type === 'spell') return 1;
  return 2;
}

export function pushLog(state, text, kind = 'info') {
  state.log.push({ turn: state.turn, text, kind, at: Date.now() });
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
}

function log(state, text, kind = 'info') { pushLog(state, text, kind); }

export function findCard(state, uid) {
  for (let p = 0; p < 2; p++) {
    const pl = state.players[p];
    const hi = pl.hand.findIndex(c => c.uid === uid);
    if (hi >= 0) return { owner: p, where: 'hand', index: hi, card: pl.hand[hi] };
    for (const row of [0, 1]) {
      const arr = row === 0 ? pl.field.monsters : pl.field.spells;
      const zi = arr.findIndex(c => c?.uid === uid);
      if (zi >= 0) return { owner: p, where: row === 0 ? 'monster' : 'spell', row, col: zi, card: arr[zi] };
    }
    const gi = pl.grave.findIndex(c => c.uid === uid);
    if (gi >= 0) return { owner: p, where: 'grave', index: gi, card: pl.grave[gi] };
  }
  return null;
}

export function handCard(state, player, uid) {
  return state.players[player].hand.find(c => c.uid === uid) || null;
}
export function fieldCard(state, player, row, col) {
  return (row === 0 ? state.players[player].field.monsters : state.players[player].field.spells)[col] || null;
}
export function monsterCount(state, player) {
  return state.players[player].field.monsters.filter(Boolean).length;
}
export function canDirectAttack(state, player) {
  return monsterCount(state, 1 - player) === 0;
}

function damage(state, target, amount, events, source = '') {
  const amt = Math.max(0, Math.round(amount));
  if (!amt) return 0;
  state.players[target].lp = Math.max(0, state.players[target].lp - amt);
  state.players[1 - target].stats.damage += amt;
  events.push({ kind: 'damage', player: target, amount: amt, source });
  log(state, `${state.players[target].name} に ${amt} ダメージ。`, 'damage');
  return amt;
}

function heal(state, player, amount, events) {
  const before = state.players[player].lp;
  state.players[player].lp = Math.min(8000, before + Math.max(0, Math.round(amount)));
  const actual = state.players[player].lp - before;
  events.push({ kind: 'heal', player, amount: actual });
  log(state, `${state.players[player].name} のLPが ${actual} 回復。`, 'heal');
  return actual;
}

function sendGrave(state, player, card, events, where = 'field') {
  state.players[player].grave.push(card);
  events.push({ kind: 'grave', player, uid: card.uid, cardId: card.cardId, where });
}

function destroyMonster(state, player, col, events, cause = 'battle') {
  const inst = state.players[player].field.monsters[col];
  if (!inst) return null;
  state.players[player].field.monsters[col] = null;
  const wasFaceDown = inst.faceDown;
  sendGrave(state, player, inst, events, 'monster');
  state.players[1 - player].stats.destroyed++;
  const c = cardOf(inst);
  events.push({ kind: 'destroy', player, row: 0, col, uid: inst.uid, cardId: inst.cardId, cause, faceDown: wasFaceDown });
  log(state, `${c.name} が破壊された。`, 'destroy');
  return inst;
}

function drawCards(state, player, count, events) {
  const pl = state.players[player];
  for (let i = 0; i < count; i++) {
    if (!pl.deck.length) {
      state.winner = 1 - player;
      state.reason = 'deckout';
      events.push({ kind: 'gameover', winner: state.winner, reason: 'deckout' });
      log(state, `${pl.name} はデッキ切れ。`, 'system');
      return;
    }
    const inst = pl.deck.pop();
    pl.hand.push(inst);
    events.push({ kind: 'draw', player, uid: inst.uid, cardId: inst.cardId });
    log(state, `${pl.name} がカードを1枚ドロー。`, 'draw');
  }
  pl.hand.sort((a, b) => handSort(a) - handSort(b));
}

function checkLP(state, events) {
  for (let p = 0; p < 2; p++) {
    if (state.players[p].lp <= 0 && !state.winner) {
      state.winner = 1 - p;
      state.reason = 'lp';
      events.push({ kind: 'gameover', winner: state.winner, reason: 'lp' });
      log(state, `${state.players[p].name} のLPが0になった。`, 'system');
      return true;
    }
  }
  return false;
}

function resetTurn(state, player, events) {
  state.turn++;
  state.turnPlayer = player;
  state.phase = 'main';
  const pl = state.players[player];
  pl.normalSummoned = false;
  pl.turnsTaken++;
  for (const row of [pl.field.monsters, pl.field.spells]) {
    for (const inst of row) {
      if (inst) { inst.attacked = false; inst.changed = false; }
    }
  }
  events.push({ kind: 'turn', player, turn: state.turn });
  log(state, `— TURN ${state.turn} / ${pl.name} —`, 'turn');
  drawCards(state, player, 1, events);
}

function endTurnInternal(state, events) {
  const pl = state.players[state.turnPlayer];
  if (pl.hand.length > 7) {
    const extra = pl.hand.length - 7;
    for (let i = 0; i < extra; i++) {
      const idx = rand(pl.hand.length);
      const [discard] = pl.hand.splice(idx, 1);
      sendGrave(state, state.turnPlayer, discard, events, 'hand');
      log(state, `手札上限により ${cardOf(discard).name} を墓地へ。`, 'system');
    }
  }
  for (const p of state.players) {
    for (const row of [p.field.monsters, p.field.spells]) {
      for (const inst of row) if (inst) { inst.atkMod = 0; inst.defMod = 0; }
    }
  }
  const next = 1 - state.turnPlayer;
  resetTurn(state, next, events);
  checkLP(state, events);
}

function resolveSpell(state, player, card, events, fromSet = false) {
  const c = cardOf(card);
  const foe = 1 - player;
  state.players[player].stats.spells++;
  events.push({ kind: 'activate', player, cardId: card.cardId, name: c.name, effect: c.effect, fromSet });
  log(state, `${state.players[player].name} が ${c.name} を発動。`, 'spell');
  switch (c.effect) {
    case 'burn':
      damage(state, foe, 800, events, c.name);
      break;
    case 'heal':
      heal(state, player, 1200, events);
      break;
    case 'draw2':
      drawCards(state, player, 2, events);
      break;
    case 'buff': {
      let n = 0;
      for (const inst of state.players[player].field.monsters) {
        if (inst && !inst.faceDown) { inst.atkMod += 500; inst.defMod += 500; n++; }
      }
      events.push({ kind: 'buff', player, amount: 500, targets: n });
      log(state, n ? `自分のモンスター ${n} 体を強化。` : '強化できるモンスターがいなかった。', 'spell');
      break;
    }
    case 'destroy': {
      const targets = state.players[foe].field.monsters.map((v, i) => v ? i : -1).filter(i => i >= 0);
      if (targets.length) {
        const col = targets[rand(targets.length)];
        destroyMonster(state, foe, col, events, 'effect');
      } else {
        log(state, '破壊できるモンスターがいなかった。', 'spell');
      }
      break;
    }
    case 'search': {
      const idx = state.players[player].deck.findIndex(i => cardOf(i).type === 'monster');
      if (idx >= 0) {
        const [found] = state.players[player].deck.splice(idx, 1);
        state.players[player].hand.push(found);
        state.players[player].hand.sort((a, b) => handSort(a) - handSort(b));
        events.push({ kind: 'search', player, uid: found.uid, cardId: found.cardId });
        log(state, `${cardOf(found).name} を手札に加えた。`, 'spell');
      } else {
        log(state, 'デッキにモンスターがなかった。', 'spell');
      }
      break;
    }
  }
  checkLP(state, events);
}

function triggerTrap(state, defender, attackerCol, events) {
  const pl = state.players[defender];
  const idx = pl.field.spells.findIndex(inst => inst && inst.faceDown && isTrap(inst) && inst.setTurn < state.turn);
  if (idx < 0) return { negated: false, attackerDestroyed: false };
  const trap = pl.field.spells[idx];
  const c = cardOf(trap);
  pl.field.spells[idx] = null;
  trap.faceDown = false;
  events.push({ kind: 'trapReveal', player: defender, row: 1, col: idx, uid: trap.uid, cardId: trap.cardId, name: c.name });
  sendGrave(state, defender, trap, events, 'spell');
  events.push({ kind: 'trap', player: defender, cardId: trap.cardId, name: c.name, effect: c.effect });
  log(state, `${pl.name} の罠 ${c.name} が発動！`, 'trap');
  const attackerOwner = 1 - defender;
  const attacker = state.players[attackerOwner].field.monsters[attackerCol];
  switch (c.effect) {
    case 'negate500':
      damage(state, attackerOwner, 500, events, c.name);
      return { negated: true, attackerDestroyed: false };
    case 'negate':
      return { negated: true, attackerDestroyed: false };
    case 'destroyAttacker':
      destroyMonster(state, attackerOwner, attackerCol, events, 'trap');
      return { negated: true, attackerDestroyed: true };
    case 'destroy300':
      destroyMonster(state, attackerOwner, attackerCol, events, 'trap');
      damage(state, attackerOwner, 300, events, c.name);
      return { negated: true, attackerDestroyed: true };
    case 'weaken':
      if (attacker) {
        attacker.atkMod -= 800;
        events.push({ kind: 'weaken', player: attackerOwner, uid: attacker.uid, amount: 800 });
        log(state, `攻撃モンスターのATKが800ダウン。`, 'trap');
      }
      return { negated: false, attackerDestroyed: false };
  }
  return { negated: false, attackerDestroyed: false };
}

function attackInternal(state, player, action, events) {
  const foe = 1 - player;
  const from = action.from || {};
  const attacker = state.players[player].field.monsters[from.col];
  const c = cardOf(attacker);
  attacker.attacked = true;
  const direct = !!action.direct || !state.players[foe].field.monsters[action.to?.col];
  const to = direct ? null : action.to;
  const target = direct ? null : state.players[foe].field.monsters[to.col];
  const targetCard = cardOf(target);

  const ev = {
    kind: 'attack', player, from: { row: 0, col: from.col },
    to: direct ? null : { row: 0, col: to.col }, direct,
    attackerUid: attacker.uid, attackerId: attacker.cardId, attackerName: c.name,
    targetUid: target?.uid || null, targetId: target?.cardId || null, targetName: targetCard?.name || null,
    damage: 0, damageTo: null, attackerDestroyed: false, targetDestroyed: false,
    negated: false, trap: null, mode: 'atk'
  };

  // set traps trigger before battle
  const trapResult = triggerTrap(state, foe, from.col, events);
  if (trapResult.negated || trapResult.attackerDestroyed) {
    ev.negated = trapResult.negated;
    ev.attackerDestroyed = trapResult.attackerDestroyed;
    ev.trap = events.find(e => e.kind === 'trap') || null;
    events.push(ev);
    checkLP(state, events);
    return;
  }

  if (direct) {
    const dmg = damage(state, foe, effAtk(attacker), events, c.name);
    ev.damage = dmg;
    ev.damageTo = foe;
    log(state, `${c.name} の直接攻撃！`, 'attack');
    events.push(ev);
    checkLP(state, events);
    return;
  }

  if (target.faceDown) {
    target.faceDown = false;
    target.position = 'def';
    ev.flipped = true;
    events.push({ kind: 'flip', player: foe, row: 0, col: to.col, uid: target.uid, cardId: target.cardId });
    log(state, `${targetCard.name} をリバース。`, 'flip');
  }

  const atk = effAtk(attacker);
  const tAtk = effAtk(target);
  const tDef = effDef(target);
  const targetPos = target.position || 'def';
  ev.mode = targetPos;

  if (targetPos === 'atk') {
    if (atk > tAtk) {
      const dmg = damage(state, foe, atk - tAtk, events, c.name);
      ev.damage = dmg; ev.damageTo = foe;
      destroyMonster(state, foe, to.col, events, 'battle');
      ev.targetDestroyed = true;
      log(state, `${c.name} が ${targetCard.name} を撃破！`, 'attack');
    } else if (atk < tAtk) {
      const dmg = damage(state, player, tAtk - atk, events, targetCard.name);
      ev.damage = dmg; ev.damageTo = player;
      destroyMonster(state, player, from.col, events, 'battle');
      ev.attackerDestroyed = true;
      log(state, `${c.name} が返り討ちに。`, 'attack');
    } else {
      destroyMonster(state, foe, to.col, events, 'battle');
      destroyMonster(state, player, from.col, events, 'battle');
      ev.targetDestroyed = true; ev.attackerDestroyed = true;
      log(state, '相打ち。両者破壊。', 'attack');
    }
  } else {
    if (atk > tDef) {
      destroyMonster(state, foe, to.col, events, 'battle');
      ev.targetDestroyed = true;
      log(state, `${c.name} が守備モンスターを破壊。`, 'attack');
    } else if (atk < tDef) {
      const dmg = damage(state, player, tDef - atk, events, targetCard.name);
      ev.damage = dmg; ev.damageTo = player;
      log(state, `${c.name} の攻撃を防がれ、反動を受けた。`, 'attack');
    } else {
      log(state, '攻撃は防がれた。', 'attack');
    }
  }
  events.push(ev);
  checkLP(state, events);
}

function validate(state, player, action) {
  if (!action || !action.type) return '不正な操作です。';
  if (state.winner !== null) return '決着がついています。';
  if (action.type === 'surrender') return null;
  if (state.turnPlayer !== player) return '相手のターンです。';
  const pl = state.players[player];
  const phase = state.phase;

  switch (action.type) {
    case 'nextPhase':
      if (phase !== 'main') return 'すでにバトルフェイズです。';
      return null;
    case 'endTurn':
      return null;
    case 'summon':
    case 'setMonster': {
      if (phase !== 'main') return '召喚はメインフェイズのみ。';
      if (pl.normalSummoned) return '召喚・セットは1ターンに1回まで。';
      const inst = handCard(state, player, action.uid);
      if (!inst || !isMonster(inst)) return 'モンスターを選択してください。';
      const col = action.zone?.col;
      if (!Number.isInteger(col) || col < 0 || col >= ZONE_COLS || pl.field.monsters[col]) return 'モンスターゾーンが埋まっています。';
      return null;
    }
    case 'setSpell': {
      if (phase !== 'main') return 'セットはメインフェイズのみ。';
      const inst = handCard(state, player, action.uid);
      if (!inst || !(isSpell(inst) || isTrap(inst))) return '魔法・罠カードを選択してください。';
      const col = action.zone?.col;
      if (!Number.isInteger(col) || col < 0 || col >= ZONE_COLS || pl.field.spells[col]) return '魔法・罠ゾーンが埋まっています。';
      return null;
    }
    case 'activateSpell': {
      if (phase !== 'main') return '魔法の発動はメインフェイズのみ。';
      const inst = handCard(state, player, action.uid);
      if (!inst || !isSpell(inst)) return '魔法カードを選択してください。';
      return null;
    }
    case 'activateSet': {
      if (phase !== 'main') return 'セットカードの発動はメインフェイズのみ。';
      const inst = fieldCard(state, player, 1, action.zone?.col);
      if (!inst || !inst.faceDown) return '伏せカードがありません。';
      if (!isSpell(inst)) return '伏せた罠は攻撃時に自動発動します。';
      if (inst.setTurn >= state.turn) return 'セットしたターンには発動できません。';
      return null;
    }
    case 'changePosition': {
      if (phase !== 'main') return '表示形式の変更はメインフェイズのみ。';
      const inst = fieldCard(state, player, 0, action.zone?.col);
      if (!inst) return 'モンスターがいません。';
      if (inst.faceDown) return '伏せモンスターは表示変更できません。';
      if (inst.changed) return 'このモンスターはすでに表示変更しました。';
      return null;
    }
    case 'attack': {
      if (phase !== 'battle') return 'バトルフェイズではありません。';
      const from = action.from || {};
      const inst = fieldCard(state, player, 0, from.col);
      if (!inst) return '攻撃するモンスターを選択してください。';
      if (inst.faceDown || inst.position !== 'atk') return '攻撃表示のモンスターのみ攻撃できます。';
      if (inst.attacked) return 'このモンスターはすでに攻撃しました。';
      if (inst.changed) return '表示変更したモンスターは攻撃できません。';
      const foeMonsters = state.players[1 - player].field.monsters;
      if (action.direct) {
        if (foeMonsters.some(Boolean)) return '相手モンスターがいるため直接攻撃できません。';
        return null;
      }
      const col = action.to?.col;
      if (!Number.isInteger(col) || !foeMonsters[col]) return '攻撃対象を選択してください。';
      return null;
    }
  }
  return '不明な操作です。';
}

export function applyAction(original, player, action) {
  const err = validate(original, player, action);
  if (err) return { state: original, events: [], error: err };
  const state = clone(original);
  const events = [];
  const pl = state.players[player];
  const phase = state.phase;

  switch (action.type) {
    case 'summon': {
      const idx = pl.hand.findIndex(c => c.uid === action.uid);
      const [inst] = pl.hand.splice(idx, 1);
      inst.position = 'atk';
      inst.faceDown = false;
      inst.summonedTurn = state.turn;
      inst.attacked = false;
      inst.changed = false;
      pl.field.monsters[action.zone.col] = inst;
      pl.normalSummoned = true;
      pl.stats.summons++;
      events.push({ kind: 'summon', player, row: 0, col: action.zone.col, uid: inst.uid, cardId: inst.cardId, position: 'atk' });
      log(state, `${pl.name} が ${cardOf(inst).name} を攻撃表示で召喚。`, 'summon');
      break;
    }
    case 'setMonster': {
      const idx = pl.hand.findIndex(c => c.uid === action.uid);
      const [inst] = pl.hand.splice(idx, 1);
      inst.position = 'def';
      inst.faceDown = true;
      inst.summonedTurn = state.turn;
      inst.attacked = false;
      inst.changed = false;
      pl.field.monsters[action.zone.col] = inst;
      pl.normalSummoned = true;
      pl.stats.summons++;
      events.push({ kind: 'setMonster', player, row: 0, col: action.zone.col, uid: inst.uid, cardId: inst.cardId, position: 'def' });
      log(state, `${pl.name} がモンスターを守備表示でセット。`, 'summon');
      break;
    }
    case 'setSpell': {
      const idx = pl.hand.findIndex(c => c.uid === action.uid);
      const [inst] = pl.hand.splice(idx, 1);
      inst.faceDown = true;
      inst.position = null;
      inst.setTurn = state.turn;
      pl.field.spells[action.zone.col] = inst;
      events.push({ kind: 'setSpell', player, row: 1, col: action.zone.col, uid: inst.uid, cardId: inst.cardId });
      log(state, `${pl.name} がカードを1枚セット。`, 'set');
      break;
    }
    case 'activateSpell': {
      const idx = pl.hand.findIndex(c => c.uid === action.uid);
      const [inst] = pl.hand.splice(idx, 1);
      resolveSpell(state, player, inst, events, false);
      sendGrave(state, player, inst, events, 'hand');
      break;
    }
    case 'activateSet': {
      const inst = pl.field.spells[action.zone.col];
      pl.field.spells[action.zone.col] = null;
      inst.faceDown = false;
      resolveSpell(state, player, inst, events, true);
      sendGrave(state, player, inst, events, 'spell');
      break;
    }
    case 'changePosition': {
      const inst = pl.field.monsters[action.zone.col];
      inst.position = inst.position === 'atk' ? 'def' : 'atk';
      inst.changed = true;
      if (inst.position === 'atk') inst.attacked = true;
      events.push({ kind: 'position', player, row: 0, col: action.zone.col, uid: inst.uid, position: inst.position });
      log(state, `${cardOf(inst).name} を${inst.position === 'atk' ? '攻撃' : '守備'}表示に変更。`, 'position');
      break;
    }
    case 'attack':
      attackInternal(state, player, action, events);
      break;
    case 'nextPhase': {
      state.phase = 'battle';
      events.push({ kind: 'phase', phase: 'battle', player });
      log(state, `${pl.name} がバトルフェイズへ。`, 'phase');
      break;
    }
    case 'endTurn': {
      events.push({ kind: 'endTurn', player });
      endTurnInternal(state, events);
      break;
    }
    case 'surrender': {
      state.winner = 1 - player;
      state.reason = 'surrender';
      events.push({ kind: 'gameover', winner: state.winner, reason: 'surrender' });
      log(state, `${pl.name} が降参した。`, 'system');
      break;
    }
  }

  state.seq++;
  state.lastAction = { player, type: action.type, at: Date.now() };
  if (!state.winner && state.players.some(p => p.lp <= 0)) checkLP(state, events);
  return { state, events, error: null };
}

export function effectiveCard(inst) {
  const c = cardOf(inst);
  if (!c) return null;
  return { ...c, atk: c.type === 'monster' ? effAtk(inst) : undefined, def: c.type === 'monster' ? effDef(inst) : undefined };
}

export function summarize(state) {
  return {
    turn: state.turn,
    phase: state.phase,
    lp: state.players.map(p => p.lp),
    hand: state.players.map(p => p.hand.length),
    deck: state.players.map(p => p.deck.length),
    field: state.players.map(p => p.field.monsters.filter(Boolean).length)
  };
}
