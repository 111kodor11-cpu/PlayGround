// AURORA DUEL — UI, animation, online room glue.
import { CARDS, ATTR, GLYPH } from './cards.js';
import {
  createDuel, applyAction, findCard, handCard, fieldCard,
  effAtk, effDef, cardOf, isMonster, isSpell, isTrap,
  canDirectAttack, ZONE_COLS
} from './engine.js';
import { chooseAIAction } from './ai.js';
import { Net, randomCode, roomLink } from './net.js';
import { Sound } from './audio.js';
import { ArcticSky } from './background.js';

const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sky = new ArcticSky($('arctic'));
const sound = new Sound();

let state = null;
let myIndex = 0;
let isHost = true;
let guestConnected = false;
let guestName = '';
let roomCode = '';
let playerName = readStore('aurora-name', 'あなた');
let net = null;
let netStatus = 'connecting';
let selectedUid = null;
let inspectUid = null;
let waiting = false;
let aiTimer = null;
let gameOverShown = false;
let fallbackPending = false;
let cardRects = new Map();
let surrenderAt = 0;
let surrenderTimer = null;
let introTimer = null;

function readStore(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
}

function normalizeCode(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function hideIntro() {
  const el = $('intro');
  if (el) el.classList.add('gone');
}

function boot() {
  const params = new URLSearchParams(location.search);
  const urlRoom = normalizeCode(params.get('room'));
  const stored = normalizeCode(readSession('aurora-room'));
  roomCode = urlRoom || stored || randomCode();
  bindUI();
  updateSoundButton();
  $('nameInput').value = playerName;
  if (urlRoom) {
    startGuestMode(urlRoom);
  } else {
    startHostMode(roomCode);
  }
  window.addEventListener('beforeunload', () => { try { net?.destroy(); } catch {} });
}

/* =========================================================
   room / online lifecycle
   ========================================================= */
function cleanupNet() {
  clearTimeout(aiTimer);
  aiTimer = null;
  if (net) {
    try { net.destroy(); } catch {}
    net = null;
  }
}

function disarmSurrender() {
  surrenderAt = 0;
  clearTimeout(surrenderTimer);
  surrenderTimer = null;
  const btn = $('surrenderBtn');
  if (btn) {
    btn.classList.remove('armed');
    btn.textContent = '降参';
  }
}

function startHostMode(code) {
  cleanupNet();
  disarmSurrender();
  isHost = true;
  myIndex = 0;
  guestConnected = false;
  guestName = '';
  waiting = false;
  gameOverShown = false;
  roomCode = normalizeCode(code) || randomCode();
  writeSession('aurora-room', roomCode);
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('room')) { u.searchParams.delete('room'); history.replaceState(null, '', u); }
  } catch {}
  state = createDuel({ names: [playerName, 'ポーラーAI'], ai: [false, true], roomCode });
  selectedUid = null;
  inspectUid = null;
  $('overModal').hidden = true;
  $('roomModal').hidden = true;
  $('introRoom').textContent = roomCode;
  $('introRoomText').textContent = 'に参加しました';
  $('intro').classList.remove('gone');
  render([], { initial: true });
  updateRoomUI();
  createHostNet(roomCode);
  if (!introTimer) {
    introTimer = setTimeout(hideIntro, 520);
  } else {
    setTimeout(hideIntro, 520);
  }
  // Room membership is shown persistently in the top chip and the ROOM LINK panel.
}

function createHostNet(code) {
  net = new Net({
    onStatus: updateNetStatus,
    onRoomCode: (next) => {
      roomCode = next;
      writeSession('aurora-room', next);
      if (state) state.roomCode = next;
      updateRoomUI();
      toast(`ルームIDを再生成しました: ${next}`, 'warn');
    },
    onGuestJoined: handleGuestJoined,
    onGuestLeft: handleHostGuestLeft,
    onAction: handleGuestAction,
    onRematch: () => resetDuelHost(true),
    onNotice: (msg) => toast(msg, 'warn')
  });
  net.startHost(code);
}

function startGuestMode(code) {
  cleanupNet();
  disarmSurrender();
  isHost = false;
  myIndex = 1;
  guestConnected = false;
  waiting = false;
  gameOverShown = false;
  roomCode = normalizeCode(code);
  writeSession('aurora-room', roomCode);
  state = null;
  selectedUid = null;
  inspectUid = null;
  $('overModal').hidden = true;
  $('roomModal').hidden = true;
  $('intro').classList.remove('gone');
  $('introRoom').textContent = roomCode;
  $('introRoomText').textContent = 'に接続中…';
  updateRoomUI();
  net = new Net({
    onStatus: updateNetStatus,
    onWelcome: handleWelcome,
    onState: handleGuestState,
    onGuestLeft: () => fallbackToAI('ホストとの接続が切れました。AI対戦に切り替えます。'),
    onGuestFailed: (msg) => {
      toast(msg, 'bad');
      if (!state) setTimeout(() => { if (!state) fallbackToAI('ルームに参加できませんでした。'); }, 900);
    },
    onNotice: (msg) => {
      waiting = false;
      toast(msg, 'warn');
      if (state) render();
    }
  });
  net.startGuest(roomCode, playerName === 'あなた' ? '挑戦者' : playerName);
  setTimeout(() => {
    if (!state) fallbackToAI('ルームへの接続がタイムアウトしました。');
  }, 14000);
}

function handleWelcome(s, you, hostName) {
  disarmSurrender();
  state = s;
  myIndex = you === 0 ? 0 : 1;
  isHost = false;
  guestConnected = true;
  waiting = false;
  gameOverShown = false;
  selectedUid = null;
  inspectUid = null;
  $('overModal').hidden = true;
  $('roomModal').hidden = true;
  $('intro').classList.add('gone');
  render([], { initial: true });
  updateRoomUI();
  showBanner('DUEL START', `${hostName} のルーム`);
  toast(`${hostName} のルームに参加しました。`);
  sound.turn();
}

function handleGuestState(s, events) {
  state = s;
  waiting = false;
  selectedUid = null;
  render(events || []);
  if (state.winner !== null) setTimeout(showGameOver, 850);
}

function handleGuestJoined(name) {
  clearTimeout(aiTimer);
  aiTimer = null;
  disarmSurrender();
  guestConnected = true;
  guestName = name;
  waiting = false;
  gameOverShown = false;
  selectedUid = null;
  inspectUid = null;
  state = createDuel({ names: [playerName, name], ai: [false, false], roomCode });
  $('overModal').hidden = true;
  $('roomModal').hidden = true;
  render([], { initial: true });
  updateRoomUI();
  net?.sendState(state, [], true);
  showBanner('CHALLENGER', name);
  toast(`${name} がルームに参加しました。デュエル開始！`);
  sound.turn();
}

function handleGuestAction(action) {
  if (!guestConnected || !state || state.winner !== null) return;
  if (state.turnPlayer !== 1) { net?.sendNotice('ホストのターンです。'); return; }
  const res = applyAction(state, 1, action);
  if (res.error) { net?.sendNotice(res.error); return; }
  state = res.state;
  selectedUid = null;
  waiting = false;
  afterState(res.events);
}

function handleHostGuestLeft() {
  if (!state) return;
  guestConnected = false;
  const old = guestName || 'ゲスト';
  guestName = '';
  state.players[1].isAI = true;
  state.players[1].name = `${old} AI`;
  updateRoomUI();
  render([]);
  toast(`${old} が退出しました。AIが引き継ぎます。`, 'warn');
  if (state.turnPlayer === 1 && state.winner === null) scheduleAI();
}

function fallbackToAI(reason) {
  if (fallbackPending) return;
  fallbackPending = true;
  setTimeout(() => {
    fallbackPending = false;
    if (reason) toast(reason, 'warn');
    const next = randomCode();
    startHostMode(next);
  }, 850);
}

function updateNetStatus(status, detail = '') {
  netStatus = status;
  const online = ['online', 'guest-connected', 'guest'].includes(status);
  $('netDot').classList.toggle('offline', !online);
  const labels = {
    connecting: 'CONNECTING', online: 'ONLINE', 'guest-connected': 'GUEST JOINED',
    joining: 'JOINING', guest: 'ONLINE', offline: 'OFFLINE / AI',
    notfound: 'NOT FOUND', 'guest-left': 'DISCONNECTED', reconnecting: 'RECONNECTING'
  };
  $('netState').textContent = labels[status] || status.toUpperCase();
  const jp = {
    connecting: '接続中…', online: 'オンライン', 'guest-connected': 'ゲスト参加中',
    joining: '参加中…', guest: 'オンライン', offline: 'オフライン（AI対戦）',
    notfound: '接続失敗', 'guest-left': '切断', reconnecting: '再接続中…'
  };
  $('modalNet').textContent = jp[status] || status;
  updateRoomUI();
  if (status === 'offline' && detail) toast(`オンライン: ${detail}`, 'warn');
}

function updateRoomUI() {
  const me = state?.players[myIndex];
  const foe = state?.players[1 - myIndex];
  $('roomCode').textContent = roomCode || '······';
  $('codeDisplay').textContent = roomCode || '······';
  $('bigCode').textContent = roomCode || '······';
  $('introRoom').textContent = roomCode || '······';
  $('roomRole').textContent = isHost ? 'HOST' : 'GUEST';
  $('modalYou').textContent = me?.name || playerName;
  $('modalFoe').textContent = foe?.name || (isHost ? 'ポーラーAI' : 'ホスト');
  $('miniYou').textContent = me?.name || playerName;
  $('miniFoe').textContent = foe?.name || (isHost ? 'ポーラーAI' : 'ホスト');
  $('modalAi').textContent = isHost ? 'AIと対戦' : 'AI対戦に切り替え';
  $('roomNote').textContent = guestConnected
    ? '対戦相手が接続中です。このルームのURLを共有すれば同じ対戦に参加できます。'
    : isHost
      ? 'ルームは自動生成されています。招待が届くまでAIが相手です。'
      : 'ホストのルームに参加しています。';
  document.title = `AURORA DUEL — ROOM ${roomCode}`;
}

/* =========================================================
   render
   ========================================================= */
function render(events = [], opts = {}) {
  if (!state) return;
  const me = state.players[myIndex];
  const foe = state.players[1 - myIndex];
  if (!me || !foe) return;

  if (selectedUid) {
    const f = findCard(state, selectedUid);
    if (!f || f.owner !== myIndex) selectedUid = null;
  }
  if (state.turnPlayer !== myIndex) selectedUid = null;
  if (inspectUid) {
    const f = findCard(state, inspectUid);
    if (!f) inspectUid = null;
  }

  const oldRects = new Map(cardRects);
  if (opts.initial) cardRects.clear();

  renderHUD(me, foe);
  renderField($('oppField'), 1 - myIndex, true);
  renderField($('playerField'), myIndex, false);
  renderHand(me);
  renderActions(me, foe);
  renderInspect();
  renderLog();
  updateRoomUI();
  collectCardRects();

  requestAnimationFrame(() => {
    animateMoves(oldRects);
    playEvents(events, oldRects);
  });
}

function renderHUD(me, foe) {
  const ctx = getSelection();
  $('youName').textContent = me.name;
  $('oppName').textContent = foe.name;
  $('youLp').textContent = me.lp;
  $('oppLp').textContent = foe.lp;
  $('youLpBar').style.width = `${clamp(me.lp / 8000 * 100, 0, 100)}%`;
  $('oppLpBar').style.width = `${clamp(foe.lp / 8000 * 100, 0, 100)}%`;
  $('youLpBar').parentElement.classList.toggle('low', me.lp <= 2000);
  $('oppLpBar').parentElement.classList.toggle('low', foe.lp <= 2000);
  $('youDeck').textContent = me.deck.length;
  $('oppDeck').textContent = foe.deck.length;
  $('youGrave').textContent = me.grave.length;
  $('oppGrave').textContent = foe.grave.length;
  $('oppHand').textContent = foe.hand.length;
  $('deckCount').textContent = me.deck.length;
  $('graveCount').textContent = me.grave.length;
  $('handCount').textContent = me.hand.length;
  $('lpMini').textContent = me.lp;
  $('oppTag').textContent = foe.isAI ? 'AI' : 'ONLINE';
  $('youTag').textContent = isHost ? 'YOU' : 'GUEST';
  $('oppTurnPip').classList.toggle('active', state.turnPlayer !== myIndex);
  $('youTurnPip').classList.toggle('active', state.turnPlayer === myIndex);
  $('turnText').textContent = state.turnPlayer === myIndex ? 'YOUR TURN' : 'OPPONENT TURN';
  $('turnNum').textContent = `TURN ${state.turn}`;
  $('turnBanner').classList.toggle('enemy', state.turnPlayer !== myIndex);
  $('phaseText').textContent = state.winner !== null ? '終了' : state.phase === 'battle' ? 'バトル' : 'メイン';
  const last = state.log[state.log.length - 1]?.text || '';
  $('logTicker').textContent = last;
  $('hudOpp').classList.toggle('direct-target', ctx.canDirect);
  $('phaseBtn').innerHTML = state.phase === 'battle'
    ? '<span>バトル中</span><small>BATTLE PHASE</small>'
    : '<span>バトルへ</span><small>BATTLE PHASE</small>';
  const lock = state.winner !== null || state.turnPlayer !== myIndex || waiting;
  $('phaseBtn').disabled = lock || state.phase !== 'main';
  $('endBtn').disabled = lock;
  $('surrenderBtn').disabled = state.winner !== null || state.turnPlayer !== myIndex;
}

function renderField(container, owner, isOpp) {
  container.innerHTML = '';
  const pl = state.players[owner];
  const ctx = getSelection();
  const handSel = ctx.handSel;
  const canPlaceMonster = owner === myIndex && ctx.canPlaceMonster;
  const canPlaceSpell = owner === myIndex && ctx.canPlaceSpell;
  const canTarget = owner !== myIndex && ctx.canAttack;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < ZONE_COLS; col++) {
      const inst = row === 0 ? pl.field.monsters[col] : pl.field.spells[col];
      const zone = document.createElement('div');
      zone.className = 'zone';
      zone.dataset.row = row;
      zone.dataset.col = col;
      zone.dataset.owner = owner;
      zone.style.gridRow = isOpp ? (row === 0 ? 2 : 1) : (row === 0 ? 1 : 2);
      zone.style.gridColumn = col + 1;
      zone.innerHTML = `<span class="zone-tag">${row === 0 ? 'M' : 'S'}${col + 1}</span>`;

      if (!inst) {
        const legal = (row === 0 && canPlaceMonster) || (row === 1 && canPlaceSpell);
        if (legal) zone.classList.add('legal');
      } else {
        const faceDown = !!inst.faceDown;
        const cardEl = makeCardEl(inst, {
          owner, row, col,
          where: row === 0 ? 'monster' : 'spell',
          faceDown,
          selected: selectedUid === inst.uid
        });
        zone.append(cardEl);
        if (canTarget && row === 0) zone.classList.add('target');
      }
      container.append(zone);
    }
  }
}

function renderHand(me) {
  const hand = $('hand');
  hand.innerHTML = '';
  if (!me.hand.length) {
    const empty = document.createElement('div');
    empty.className = 'hand-empty';
    empty.textContent = 'HAND EMPTY';
    hand.append(empty);
    return;
  }
  const n = me.hand.length;
  me.hand.forEach((inst, i) => {
    const el = makeCardEl(inst, { owner: myIndex, where: 'hand', faceDown: false, selected: selectedUid === inst.uid });
    el.style.setProperty('--rot', `${(i - (n - 1) / 2) * 2.1}deg`);
    el.dataset.handIndex = i;
    hand.append(el);
  });
}

function makeCardEl(inst, opts = {}) {
  const card = cardOf(inst);
  if (!card) return document.createElement('div');
  const attr = ATTR[card.attr] || ATTR.ice;
  const faceDown = !!opts.faceDown;
  const where = opts.where || 'hand';
  const position = inst.position || 'atk';
  const isDef = where === 'monster' && position === 'def';
  const div = document.createElement('div');
  div.className = [
    'card', card.type,
    faceDown ? 'face-down' : '',
    isDef ? 'defense' : '',
    opts.selected ? 'selected' : '',
    inst.attacked ? 'tapped' : ''
  ].filter(Boolean).join(' ');
  div.dataset.uid = inst.uid;
  div.dataset.owner = opts.owner ?? '';
  div.dataset.row = opts.row ?? '';
  div.dataset.col = opts.col ?? '';
  div.dataset.where = where;
  div.style.setProperty('--hue', attr.hue);
  div.style.setProperty('--hue2', attr.hue2);
  div.setAttribute('aria-label', card.name);

  if (faceDown) {
    div.innerHTML = `<div class="card-back">${GLYPH.ice}<span>AURORA</span></div><span class="card-glow"></span>`;
    return div;
  }

  const glyph = GLYPH[card.attr] || GLYPH.spell;
  const typeLabel = card.type === 'monster' ? 'MONSTER' : card.type === 'spell' ? 'SPELL' : 'TRAP';
  const level = card.type === 'monster'
    ? `<span class="level">${'<i></i>'.repeat(card.level)}</span>`
    : `<span class="rarity">${esc(card.rarity)}</span>`;
  const stats = card.type === 'monster'
    ? `<span class="atk"><small>ATK</small><b>${effAtk(inst)}</b></span><span class="def"><small>DEF</small><b>${effDef(inst)}</b></span>`
    : `<span><small>${card.type === 'spell' ? 'MAGIC' : 'TRAP'}</small></span><span><small>${esc(card.rarity)}</small><b>✦</b></span>`;

  div.innerHTML = `
    <span class="card-glow"></span>
    <div class="card-inner">
      <div class="card-top">
        <span class="attr-orb">${esc(attr.label[0])}</span>
        <span class="card-name">${esc(card.name)}</span>
        ${level}
      </div>
      <div class="card-art">
        ${glyph}
        <span class="card-type">${typeLabel}</span>
      </div>
      <div class="card-stats">${stats}</div>
    </div>`;
  return div;
}

function getSelection() {
  const sel = selectedUid ? findCard(state, selectedUid) : null;
  const me = state.players[myIndex];
  const handSel = sel && sel.owner === myIndex && sel.where === 'hand' ? sel : null;
  const fieldSel = sel && sel.owner === myIndex && (sel.where === 'monster' || sel.where === 'spell') ? sel : null;
  const myTurn = state.turnPlayer === myIndex && state.winner === null;
  const c = sel?.card;
  const canPlaceMonster = !!(handSel && c && isMonster(c) && state.phase === 'main' && myTurn && !me.normalSummoned);
  const canPlaceSpell = !!(handSel && c && (isSpell(c) || isTrap(c)) && state.phase === 'main' && myTurn);
  const canChange = !!(fieldSel && fieldSel.where === 'monster' && !fieldSel.card.faceDown && state.phase === 'main' && myTurn && !fieldSel.card.changed);
  const canAttack = !!(fieldSel && fieldSel.where === 'monster' && !fieldSel.card.faceDown && fieldSel.card.position === 'atk' && !fieldSel.card.attacked && !fieldSel.card.changed && state.phase === 'battle' && myTurn);
  const canDirect = canAttack && canDirectAttack(state, myIndex);
  const canActivateSet = !!(fieldSel && fieldSel.where === 'spell' && fieldSel.card.faceDown && isSpell(fieldSel.card) && fieldSel.card.setTurn < state.turn && state.phase === 'main' && myTurn);
  return { sel, handSel, fieldSel, canPlaceMonster, canPlaceSpell, canChange, canAttack, canDirect, canActivateSet };
}

function firstEmpty(arr) {
  return arr.findIndex(v => !v);
}

function renderActions(me, foe) {
  const info = $('selectionInfo');
  const buttons = $('actionButtons');
  const ctx = getSelection();
  buttons.innerHTML = '';
  $('selKicker').textContent = 'SELECT';
  const setInfo = (name, hint) => {
    $('selName').textContent = name;
    $('selHint').textContent = hint;
  };
  const add = (label, cls, fn, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `act-btn ${cls}`.trim();
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener('click', (e) => { e.stopPropagation(); sound.click(); fn(); });
    buttons.append(b);
    return b;
  };

  if (state.winner !== null) {
    setInfo('デュエル終了', '再戦するか、ルームを確認してください。');
    add('再戦する', 'primary', () => rematch());
    return;
  }
  if (waiting) {
    setInfo('通信中…', 'ホストの応答を待っています。');
    return;
  }
  if (state.turnPlayer !== myIndex) {
    setInfo('相手のターン', `${foe.name} が行動中です。`);
    return;
  }
  if (!ctx.sel) {
    setInfo('カードを選択', '手札から1枚選んでください。光るマスへ置けます。');
    return;
  }

  const c = ctx.sel.card;
  const card = cardOf(c);
  $('selKicker').textContent = ctx.sel.where === 'hand' ? 'HAND' : ctx.sel.where === 'monster' ? 'MONSTER' : 'SPELL / TRAP';
  setInfo(card.name, card.en ?? '');

  if (ctx.handSel) {
    if (card.type === 'monster') {
      if (state.phase === 'main' && !me.normalSummoned) {
        const col = firstEmpty(me.field.monsters);
        setInfo(card.name, col < 0 ? 'モンスターゾーンが埋まっています。' : '召喚するか、守備表示でセット。');
        add('攻撃表示で召喚', 'primary', () => doAction({ type: 'summon', uid: c.uid, zone: { col } }), col < 0);
        add('守備表示でセット', '', () => doAction({ type: 'setMonster', uid: c.uid, zone: { col } }), col < 0);
      } else if (me.normalSummoned) {
        setInfo(card.name, 'このターンの召喚・セットは済んでいます。');
      } else {
        setInfo(card.name, '召喚はメインフェイズのみ。');
      }
    } else if (card.type === 'spell') {
      if (state.phase === 'main') {
        const col = firstEmpty(me.field.spells);
        setInfo(card.name, '発動するか、伏せて次のターンに使う。');
        add('発動する', 'primary', () => doAction({ type: 'activateSpell', uid: c.uid }));
        add('セット', '', () => doAction({ type: 'setSpell', uid: c.uid, zone: { col } }), col < 0);
      } else {
        setInfo(card.name, '魔法の発動はメインフェイズのみ。');
      }
    } else if (card.type === 'trap') {
      if (state.phase === 'main') {
        const col = firstEmpty(me.field.spells);
        setInfo(card.name, '伏せると相手の攻撃時に自動発動。');
        add('セット', 'primary', () => doAction({ type: 'setSpell', uid: c.uid, zone: { col } }), col < 0);
      } else {
        setInfo(card.name, '罠のセットはメインフェイズのみ。');
      }
    }
    add('キャンセル', '', clearSelection);
    return;
  }

  if (ctx.fieldSel) {
    const zone = { col: ctx.fieldSel.col };
    if (ctx.fieldSel.where === 'monster') {
      if (c.faceDown) {
        setInfo(card.name, '伏せモンスター。攻撃されるまで正体は不明です。');
      } else if (state.phase === 'main' && !c.changed) {
        setInfo(card.name, `ATK ${effAtk(c)} / DEF ${effDef(c)}。表示形式を変更できます。`);
        add('表示形式を変更', 'primary', () => doAction({ type: 'changePosition', zone }));
      } else if (state.phase === 'battle' && ctx.canAttack) {
        if (ctx.canDirect) {
          setInfo(card.name, '相手モンスターはいません。直接攻撃が可能。');
          add('直接攻撃', 'primary', () => doAction({ type: 'attack', from: zone, direct: true }));
        } else {
          setInfo(card.name, '相手モンスターをクリックして攻撃。');
        }
      } else if (c.attacked) {
        setInfo(card.name, 'このモンスターはこのターン攻撃済みです。');
      } else if (c.changed) {
        setInfo(card.name, '表示変更したモンスターは攻撃できません。');
      } else {
        setInfo(card.name, 'バトルフェイズに攻撃できます。');
      }
    } else {
      if (c.faceDown && isSpell(c) && state.phase === 'main' && ctx.canActivateSet) {
        setInfo(card.name, '伏せた魔法を発動できます。');
        add('発動する', 'primary', () => doAction({ type: 'activateSet', zone }));
      } else if (c.faceDown && isTrap(c)) {
        setInfo(card.name, '罠は相手の攻撃時に自動で発動します。');
      } else if (c.faceDown) {
        setInfo(card.name, 'セットしたターンには発動できません。');
      }
    }
    add('キャンセル', '', clearSelection);
  }
}

function renderInspect() {
  const uid = inspectUid || selectedUid;
  const found = uid ? findCard(state, uid) : null;
  const body = $('inspectBody');
  const empty = $('inspectEmpty');
  if (!found) {
    body.hidden = true;
    empty.hidden = false;
    $('inspectType').textContent = '—';
    return;
  }
  const inst = found.card;
  const c = cardOf(inst);
  const hidden = inst.faceDown && found.owner !== myIndex;
  body.hidden = false;
  empty.hidden = true;
  $('inspectType').textContent = hidden ? 'SET' : c.type === 'monster' ? 'MONSTER' : c.type === 'spell' ? 'SPELL' : 'TRAP';
  $('inspectName').textContent = hidden ? '伏せカード' : c.name;
  $('inspectSub').textContent = hidden ? 'UNKNOWN / SET' : `${c.en} · ${ATTR[c.attr]?.label || ''}${c.type === 'monster' ? ` · LV${c.level}` : ''} · ${c.rarity}`;
  $('inspectArt').innerHTML = hidden
    ? `${GLYPH.ice}<span class="big-glyph">?</span>`
    : `${GLYPH[c.attr] || GLYPH.spell}<span class="big-glyph">${esc((ATTR[c.attr]?.label || c.type).slice(0, 2))}</span>`;
  $('inspectText').textContent = hidden
    ? '相手の伏せカード。攻撃して正体を暴くか、罠を警戒してターンを返そう。'
    : c.text;
  if (hidden) {
    $('inspectStats').innerHTML = '<span>ATK / DEF<b>???</b></span><span>STATUS<b>SET</b></span>';
  } else if (c.type === 'monster') {
    $('inspectStats').innerHTML = `<span>ATK<b>${effAtk(inst)}</b></span><span>DEF<b>${effDef(inst)}</b></span><span>LEVEL<b>${c.level}</b></span>`;
  } else {
    $('inspectStats').innerHTML = `<span>TYPE<b>${c.type === 'spell' ? 'MAGIC' : 'TRAP'}</b></span><span>RARITY<b>${esc(c.rarity)}</b></span><span>ZONE<b>${found.where === 'hand' ? 'HAND' : 'SET'}</b></span>`;
  }
}

function renderLog() {
  const log = $('duelLog');
  log.innerHTML = '';
  const items = state.log.slice(-7).reverse();
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item.text;
    log.append(li);
  }
}

/* =========================================================
   interaction
   ========================================================= */
function clearSelection() {
  selectedUid = null;
  render();
}

function selectCard(found) {
  if (!found || found.owner !== myIndex) return;
  selectedUid = selectedUid === found.card.uid ? null : found.card.uid;
  inspectUid = found.card.uid;
  render();
}

function handleFieldCardClick(owner, row, col, inst) {
  const ctx = getSelection();
  if (owner !== myIndex) {
    if (ctx.canAttack && row === 0 && ctx.fieldSel) {
      doAction({ type: 'attack', from: { col: ctx.fieldSel.col }, to: { col } });
      return;
    }
    inspectUid = inst.uid;
    renderInspect();
    sound.click();
    return;
  }
  selectCard({ owner, where: row === 0 ? 'monster' : 'spell', row, col, card: inst });
}

function handleZoneClick(owner, row, col) {
  const ctx = getSelection();
  const me = state.players[myIndex];
  if (owner === myIndex) {
    if (!ctx.handSel) return;
    const c = ctx.handSel.card;
    if (row === 0 && isMonster(c) && !me.field.monsters[col] && ctx.canPlaceMonster) {
      doAction({ type: 'summon', uid: c.uid, zone: { col } });
      return;
    }
    if (row === 1 && (isSpell(c) || isTrap(c)) && !me.field.spells[col] && ctx.canPlaceSpell) {
      doAction({ type: 'setSpell', uid: c.uid, zone: { col } });
      return;
    }
    return;
  }
  if (ctx.canAttack && row === 0 && ctx.fieldSel) {
    const target = fieldCard(state, owner, 0, col);
    if (target) doAction({ type: 'attack', from: { col: ctx.fieldSel.col }, to: { col } });
  }
}

function doAction(action) {
  if (!state || state.winner !== null) return;
  if (state.turnPlayer !== myIndex) { toast('相手のターンです。', 'warn'); return; }
  if (waiting) { toast('ホストの応答を待っています。', 'warn'); return; }
  if (!isHost) {
    if (!net?.connected) { toast('オンライン接続がありません。', 'bad'); return; }
    if (!net.sendAction(action)) { toast('送信に失敗しました。', 'bad'); return; }
    waiting = true;
    selectedUid = null;
    render();
    updateRoomUI();
    return;
  }
  const res = applyAction(state, myIndex, action);
  if (res.error) {
    toast(res.error, 'warn');
    sound.tone(140, .12, 'sawtooth', .06, -40);
    return;
  }
  state = res.state;
  if (['summon', 'setMonster', 'setSpell', 'activateSpell', 'activateSet', 'attack', 'nextPhase', 'endTurn'].includes(action.type)) {
    selectedUid = null;
  }
  waiting = false;
  afterState(res.events);
}

function afterState(events) {
  render(events || []);
  if (!state) return;
  if (isHost && guestConnected) net?.sendState(state, events || []);
  if (state.winner !== null) {
    setTimeout(showGameOver, 900);
    return;
  }
  if (isHost && !guestConnected) scheduleAI();
}

function scheduleAI() {
  clearTimeout(aiTimer);
  aiTimer = null;
  if (!isHost || guestConnected || !state || state.winner !== null || state.turnPlayer !== 1) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (!isHost || guestConnected || !state || state.winner !== null || state.turnPlayer !== 1) return;
    const action = chooseAIAction(state, 1) || { type: 'endTurn' };
    const res = applyAction(state, 1, action);
    if (res.error) {
      const fb = applyAction(state, 1, { type: 'endTurn' });
      if (fb.error) return;
      state = fb.state;
      afterState(fb.events);
      return;
    }
    state = res.state;
    afterState(res.events);
  }, 680);
}

function rematch() {
  $('overModal').hidden = true;
  if (isHost) {
    resetDuelHost(guestConnected);
  } else if (net?.connected) {
    net.requestRematch();
    toast('再戦をリクエストしました。');
  } else {
    fallbackToAI('接続がありません。AI対戦を開始します。');
  }
}

function resetDuelHost(notifyGuest) {
  clearTimeout(aiTimer);
  aiTimer = null;
  disarmSurrender();
  waiting = false;
  gameOverShown = false;
  selectedUid = null;
  inspectUid = null;
  const names = guestConnected ? [playerName, guestName || 'ゲスト'] : [playerName, 'ポーラーAI'];
  const ai = guestConnected ? [false, false] : [false, true];
  state = createDuel({ names, ai, roomCode });
  $('overModal').hidden = true;
  render([], { initial: true });
  showBanner('REMATCH', guestConnected ? '再戦開始' : 'AIとの再戦');
  if (notifyGuest && guestConnected) net?.sendState(state, [], true);
  if (!guestConnected) scheduleAI();
}

/* =========================================================
   animation / effects
   ========================================================= */
function collectCardRects() {
  cardRects.clear();
  document.querySelectorAll('.card[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    if (!uid) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) cardRects.set(uid, { left: r.left, top: r.top, width: r.width, height: r.height });
  });
}

function animateMoves(oldRects) {
  document.querySelectorAll('.card[data-uid]').forEach((el, idx) => {
    const uid = el.dataset.uid;
    if (!uid) return;
    const nr = cardRects.get(uid);
    if (!nr) return;
    const or = oldRects.get(uid);
    if (or) {
      const dx = or.left - nr.left;
      const dy = or.top - nr.top;
      const sx = or.width / nr.width;
      const sy = or.height / nr.height;
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5 || Math.abs(sx - 1) > .02 || Math.abs(sy - 1) > .02) {
        el.animate([
          { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}`, opacity: .72 },
          { translate: '0 0', scale: '1 1', opacity: 1 }
        ], { duration: 430, easing: 'cubic-bezier(.2,.9,.2,1)' });
      }
    } else {
      const owner = Number(el.dataset.owner);
      const dr = deckRect(owner);
      const cx = nr.left + nr.width / 2;
      const cy = nr.top + nr.height / 2;
      const dx = dr.left + dr.width / 2 - cx;
      const dy = dr.top + dr.height / 2 - cy;
      const scale = clamp(dr.width / nr.width, .2, .55);
      const delay = el.dataset.where === 'hand' ? Math.min(260, idx * 38) : 0;
      el.animate([
        { translate: `${dx}px ${dy}px`, scale: `${scale}`, rotate: '-9deg', opacity: 0 },
        { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 }
      ], { duration: 500, delay, easing: 'cubic-bezier(.2,.9,.2,1)' });
    }
  });
}

function deckRect(owner) {
  let el;
  if (owner === myIndex) {
    const visual = $('deckVisual');
    el = visual && visual.getClientRects().length ? visual : $('youDeck')?.closest('.deck-pill');
  } else {
    el = $('oppDeck')?.closest('.deck-pill');
  }
  if (!el || !el.getClientRects().length) el = owner === myIndex ? $('hudYou') : $('hudOpp');
  return el.getBoundingClientRect();
}

function zoneRect(owner, row, col) {
  const field = owner === myIndex ? $('playerField') : $('oppField');
  const zone = field.querySelector(`.zone[data-row="${row}"][data-col="${col}"]`);
  return zone ? zone.getBoundingClientRect() : field.getBoundingClientRect();
}

function hudRect(owner) {
  return (owner === myIndex ? $('hudYou') : $('hudOpp')).getBoundingClientRect();
}

function ghostCard(cardId, inst, faceDown = false, extra = '') {
  const data = inst || { uid: '', cardId, atkMod: 0, defMod: 0, position: 'atk', faceDown: false, attacked: false, changed: false };
  const el = makeCardEl(data, { owner: '', where: 'ghost', faceDown });
  el.removeAttribute('data-uid');
  el.dataset.uid = '';
  el.classList.add('attack-clone');
  if (extra) extra.split(' ').filter(Boolean).forEach(c => el.classList.add(c));
  el.style.pointerEvents = 'none';
  return el;
}

function playEvents(events, oldRects) {
  if (!events?.length) return;
  const hasAttack = events.some(e => e.kind === 'attack');
  const hasTrap = events.some(e => e.kind === 'trapReveal');
  const attackDelay = hasTrap ? 470 : 90;

  for (const ev of events) {
    switch (ev.kind) {
      case 'draw':
        sound.draw();
        if (ev.player !== myIndex) flyBack(ev);
        break;
      case 'summon':
        sound.summon();
        break;
      case 'setMonster':
      case 'setSpell':
        sound.set();
        break;
      case 'activate':
        ringAtPlayer(ev.player);
        sound.tone(ev.effect === 'burn' ? 280 : 620, .25, 'triangle', .08, ev.effect === 'burn' ? -140 : 120);
        break;
      case 'trapReveal':
        sound.trap();
        revealTrap(ev, oldRects);
        break;
      case 'trap':
        sound.trap();
        break;
      case 'damage':
        setTimeout(() => showDamage(ev.player, ev.amount, 'damage'), hasAttack ? 560 : 140);
        break;
      case 'heal':
        setTimeout(() => showDamage(ev.player, ev.amount, 'heal'), 100);
        sound.heal();
        break;
      case 'destroy':
        setTimeout(() => shatter(ev, oldRects), hasAttack ? 720 : 160);
        break;
      case 'attack':
        setTimeout(() => animateAttack(ev, oldRects), attackDelay);
        break;
      case 'flip':
        pulseZone(ev.player, 0, ev.col);
        sound.set();
        break;
      case 'position':
        sound.set();
        break;
      case 'buff':
        setTimeout(() => showText(ev.player, `ATK +${ev.amount}`, 'buff'), 120);
        sound.heal();
        document.querySelectorAll(`.card[data-owner="${ev.player}"]`).forEach(el => pulseEl(el));
        break;
      case 'weaken':
        pulseUid(ev.uid);
        break;
      case 'turn':
        sound.turn();
        showBanner(ev.player === myIndex ? 'YOUR TURN' : 'OPPONENT TURN', `TURN ${ev.turn}`, ev.player !== myIndex);
        break;
      case 'phase':
        sound.click();
        break;
    }
  }
}

function flyBack(ev) {
  const from = deckRect(ev.player);
  const to = hudRect(ev.player);
  const el = ghostCard(ev.cardId, null, true);
  el.style.left = `${from.left + from.width / 2 - 22}px`;
  el.style.top = `${from.top + from.height / 2 - 30}px`;
  el.style.width = '44px';
  el.style.height = '60px';
  document.getElementById('fxLayer').append(el);
  el.animate([
    { translate: '0 0', rotate: '0deg', opacity: 0 },
    { translate: '0 -4px', rotate: '-8deg', opacity: 1, offset: .18 },
    { translate: `${to.left + to.width / 2 - (from.left + from.width / 2)}px ${to.top + to.height / 2 - (from.top + from.height / 2)}px`, rotate: '8deg', opacity: 0 }
  ], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => el.remove();
}

function revealTrap(ev, oldRects) {
  const rect = oldRects.get(ev.uid) || zoneRect(ev.player, 1, ev.col);
  const el = ghostCard(ev.cardId, null, false);
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  document.getElementById('fxLayer').append(el);
  el.animate([
    { scale: '.5', rotate: '-8deg', opacity: 0, filter: 'brightness(2)' },
    { scale: '1.12', rotate: '2deg', opacity: 1, offset: .55 },
    { scale: '1', rotate: '0deg', opacity: 1 }
  ], { duration: 480, easing: 'cubic-bezier(.2,.9,.2,1)' });
  const r = el.getBoundingClientRect();
  ring(r.left + r.width / 2, r.top + r.height / 2, '#ff7ad9');
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -18px' }], { duration: 420, fill: 'forwards' }).onfinish = () => el.remove();
  }, 650);
}

function animateAttack(ev, oldRects) {
  if (ev.negated) {
    const r = ev.direct ? hudRect(1 - ev.player) : (oldRects.get(ev.targetUid) || zoneRect(1 - ev.player, 0, ev.to.col));
    showTextAt(1 - ev.player, 'NEGATE', 'buff', r.left + r.width / 2, r.top + r.height / 2);
    return;
  }
  const from = oldRects.get(ev.attackerUid) || zoneRect(ev.player, 0, ev.from.col);
  const to = ev.direct ? hudRect(1 - ev.player) : (oldRects.get(ev.targetUid) || zoneRect(1 - ev.player, 0, ev.to.col));
  const el = ghostCard(ev.attackerId, null, false, ev.player !== myIndex ? 'enemy' : '');
  el.style.left = `${from.left}px`;
  el.style.top = `${from.top}px`;
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  document.getElementById('fxLayer').append(el);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const up = Math.max(38, from.height * .58);
  const anim = el.animate([
    { translate: '0 0', scale: '1', rotate: '0deg', filter: 'brightness(1)', offset: 0 },
    { translate: `0 ${-up}px`, scale: '1.1', rotate: '-2deg', filter: 'brightness(1.35)', offset: .26 },
    { translate: `${dx * .08}px ${-up * 1.12}px`, scale: '1.14', rotate: '2deg', filter: 'brightness(1.5)', offset: .52 },
    { translate: `${dx}px ${dy}px`, scale: '1.03', rotate: '7deg', filter: 'brightness(1.2)', offset: 1 }
  ], { duration: 720, easing: 'cubic-bezier(.2,.7,.2,1)' });
  anim.onfinish = () => el.remove();

  setTimeout(() => {
    const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
    impactAt(tx, ty);
    sound.impact();
    if (ev.damageTo === myIndex) shake();
  }, 470);
}

function shatter(ev, oldRects) {
  const rect = oldRects.get(ev.uid) || zoneRect(ev.player, ev.row, ev.col);
  const el = ghostCard(ev.cardId, null, !!ev.faceDown);
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  document.getElementById('fxLayer').append(el);
  el.animate([
    { opacity: 1, scale: '1', rotate: '0deg', filter: 'brightness(1)' },
    { opacity: .9, scale: '1.08', rotate: '-4deg', filter: 'brightness(2)', offset: .28 },
    { opacity: 0, scale: '.72', rotate: '12deg', filter: 'brightness(.5)' }
  ], { duration: 640, easing: 'ease-out' }).onfinish = () => el.remove();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  for (let i = 0; i < 9; i++) {
    const sh = document.createElement('div');
    sh.className = 'shard';
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 65;
    sh.style.left = `${cx}px`; sh.style.top = `${cy}px`;
    sh.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    sh.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    sh.style.setProperty('--rot', `${(Math.random() - .5) * 360}deg`);
    document.getElementById('fxLayer').append(sh);
    setTimeout(() => sh.remove(), 800);
  }
}

function impactAt(x, y) {
  const impact = document.createElement('div');
  impact.className = 'impact';
  impact.style.left = `${x}px`; impact.style.top = `${y}px`;
  document.getElementById('fxLayer').append(impact);
  setTimeout(() => impact.remove(), 650);
  const ringEl = document.createElement('div');
  ringEl.className = 'ring';
  ringEl.style.left = `${x}px`; ringEl.style.top = `${y}px`;
  ringEl.style.width = '90px'; ringEl.style.height = '90px';
  document.getElementById('fxLayer').append(ringEl);
  setTimeout(() => ringEl.remove(), 750);
}

function ring(x, y, color = '#62f4df') {
  const el = document.createElement('div');
  el.className = 'ring';
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.style.width = '70px'; el.style.height = '70px';
  el.style.borderColor = color;
  document.getElementById('fxLayer').append(el);
  setTimeout(() => el.remove(), 760);
}

function ringAtPlayer(owner) {
  const r = (owner === myIndex ? $('playerField') : $('oppField')).getBoundingClientRect();
  ring(r.left + r.width / 2, r.top + r.height / 2, owner === myIndex ? '#62f4df' : '#ff7ad9');
}

function pulseZone(owner, row, col) {
  const field = owner === myIndex ? $('playerField') : $('oppField');
  const zone = field.querySelector(`.zone[data-row="${row}"][data-col="${col}"]`);
  if (zone) pulseEl(zone);
}

function pulseUid(uid) {
  const el = document.querySelector(`.card[data-uid="${CSS.escape(uid)}"]`);
  if (el) pulseEl(el);
}

function pulseEl(el) {
  el.animate([
    { filter: 'brightness(1)' },
    { filter: 'brightness(1.9)', scale: '1.06', offset: .35 },
    { filter: 'brightness(1)', scale: '1' }
  ], { duration: 520, easing: 'ease-out' });
}

function showDamage(player, amount, kind) {
  if (!amount) return;
  const r = hudRect(player);
  const el = document.createElement('div');
  el.className = `damage-float ${kind === 'heal' ? 'heal' : ''}`;
  el.textContent = kind === 'heal' ? `+${amount}` : `-${amount}`;
  el.style.left = `${r.left + r.width * .58}px`;
  el.style.top = `${r.top + r.height * .42}px`;
  document.getElementById('fxLayer').append(el);
  setTimeout(() => el.remove(), 1150);
  if (kind !== 'heal') {
    const bar = (player === myIndex ? $('youLpBar') : $('oppLpBar')).parentElement;
    bar.animate([{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], { duration: 500 });
    sound.damage();
    if (player === myIndex) shake();
  }
}

function showText(player, text, kind = '', delay = 0) {
  setTimeout(() => {
    const r = hudRect(player);
    showTextAt(player, text, kind, r.left + r.width * .58, r.top + r.height * .42);
  }, delay);
}

function showTextAt(player, text, kind, x, y) {
  const el = document.createElement('div');
  el.className = `damage-float ${kind || ''}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.getElementById('fxLayer').append(el);
  setTimeout(() => el.remove(), 1150);
}

function shake() {
  const app = document.querySelector('.app');
  app.classList.remove('shake');
  void app.offsetWidth;
  app.classList.add('shake');
  setTimeout(() => app.classList.remove('shake'), 360);
}

function showBanner(title, sub, enemy = false) {
  const layer = document.getElementById('bannerLayer');
  layer.innerHTML = '';
  const el = document.createElement('div');
  el.className = `duel-banner${enemy ? ' enemy' : ''}`;
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
  layer.append(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 1950);
}

function showGameOver() {
  if (!state || state.winner === null || gameOverShown) return;
  gameOverShown = true;
  const win = state.winner === myIndex;
  const me = state.players[myIndex];
  const foe = state.players[1 - myIndex];
  const reasons = { lp: 'ライフポイントが尽きた', deckout: 'デッキが尽きた', surrender: '降参した' };
  $('overKicker').textContent = win ? 'DUEL COMPLETE / VICTORY' : 'DUEL COMPLETE / DEFEAT';
  $('overTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
  $('overTitle').classList.toggle('lose', !win);
  $('overCopy').textContent = win
    ? `${foe.name} を下し、北極の頂点に立った。`
    : `${foe.name} に敗北。${reasons[state.reason] || ''}。`;
  $('overStats').innerHTML = `
    <span>TURN<b>${state.turn}</b></span>
    <span>YOUR LP<b>${me.lp}</b></span>
    <span>DAMAGE<b>${me.stats.damage}</b></span>
    <span>DESTROYED<b>${me.stats.destroyed}</b></span>`;
  $('overModal').hidden = false;
  sound[win ? 'victory' : 'defeat']();
}

/* =========================================================
   toast / modals / binding
   ========================================================= */
function toast(message, kind = '') {
  const stack = $('toastStack');
  while (stack.children.length >= 3) stack.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  stack.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .35s, transform .35s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 380);
  }, 2600);
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.hidden = false;
  if (id === 'roomModal') updateRoomUI();
  sound.click();
}

function closeModal(id) {
  const el = $(id);
  if (el) el.hidden = true;
}

function copyInvite() {
  const link = roomLink(roomCode);
  const done = () => toast('招待リンクをコピーしました。');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link));
  } else {
    fallbackCopy(link);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('招待リンクをコピーしました。');
  } catch {
    toast(`コピーできませんでした: ${text}`, 'warn');
  }
}

function updateSoundButton() {
  $('soundBtn').classList.toggle('muted', sound.muted);
  $('soundBtn').title = sound.muted ? 'サウンドをオン' : 'サウンドをオフ';
}

function bindUI() {
  $('roomChip').addEventListener('click', () => openModal('roomModal'));
  $('helpBtn').addEventListener('click', () => openModal('helpModal'));
  $('copyBtn').addEventListener('click', copyInvite);
  $('modalCopy').addEventListener('click', copyInvite);
  $('soundBtn').addEventListener('click', () => {
    sound.ensure();
    sound.setMuted(!sound.muted);
    updateSoundButton();
    if (!sound.muted) sound.click();
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(b => {
    b.addEventListener('click', (e) => { if (e.target === b) b.hidden = true; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(b => { b.hidden = true; });
    }
  });
  window.addEventListener('pointerdown', () => sound.ensure(), { once: true });

  $('hand').addEventListener('click', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl || !state) return;
    const found = findCard(state, cardEl.dataset.uid);
    if (found) selectCard(found);
  });
  $('hand').addEventListener('mouseover', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl || !state) return;
    if (inspectUid !== cardEl.dataset.uid) {
      inspectUid = cardEl.dataset.uid;
      renderInspect();
    }
  });

  const fieldClick = (container) => {
    container.addEventListener('click', (e) => {
      if (!state) return;
      const zone = e.target.closest('.zone');
      if (!zone) return;
      const owner = Number(zone.dataset.owner);
      const row = Number(zone.dataset.row), col = Number(zone.dataset.col);
      const inst = fieldCard(state, owner, row, col);
      if (inst) handleFieldCardClick(owner, row, col, inst);
      else handleZoneClick(owner, row, col);
    });
  };
  fieldClick($('oppField'));
  fieldClick($('playerField'));

  $('hudOpp').addEventListener('click', () => {
    if (!state) return;
    const ctx = getSelection();
    if (ctx.canDirect && ctx.fieldSel) {
      doAction({ type: 'attack', from: { col: ctx.fieldSel.col }, direct: true });
    }
  });

  $('phaseBtn').addEventListener('click', () => doAction({ type: 'nextPhase' }));
  $('endBtn').addEventListener('click', () => doAction({ type: 'endTurn' }));
  $('surrenderBtn').addEventListener('click', () => {
    if (!state || state.turnPlayer !== myIndex) return;
    if (surrenderAt && Date.now() - surrenderAt < 4000) {
      disarmSurrender();
      doAction({ type: 'surrender' });
      return;
    }
    surrenderAt = Date.now();
    clearTimeout(surrenderTimer);
    $('surrenderBtn').classList.add('armed');
    $('surrenderBtn').textContent = 'もう一度で降参';
    surrenderTimer = setTimeout(disarmSurrender, 4000);
    toast('もう一度押すと降参します。', 'warn');
  });
  $('rematchBtn').addEventListener('click', rematch);
  $('overRoomBtn').addEventListener('click', () => { $('overModal').hidden = true; openModal('roomModal'); });
  $('modalAi').addEventListener('click', () => {
    if (guestConnected) { toast('対戦相手が接続中です。', 'warn'); return; }
    closeModal('roomModal');
    resetDuelHost(false);
    toast('AIとのデュエルを開始します。');
  });
  $('nameInput').addEventListener('change', (e) => {
    const next = String(e.target.value || '').trim().slice(0, 14) || 'あなた';
    playerName = next;
    writeStore('aurora-name', next);
    if (state) {
      state.players[myIndex].name = next;
      render();
      if (isHost && guestConnected) net?.sendState(state, []);
    }
    updateRoomUI();
  });
}

/* =========================================================
   start
   ========================================================= */
window.__aurora = {
  get state() { return state; },
  get net() { return net; },
  get myIndex() { return myIndex; },
  get isHost() { return isHost; },
  get guestConnected() { return guestConnected; },
  get netStatus() { return netStatus; },
  get surrenderAt() { return surrenderAt; }
};
boot();
