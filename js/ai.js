// Simple but complete opponent AI. It uses the same legal actions as a human.
import { CARDS } from './cards.js';
import { effAtk, effDef, cardOf, isMonster, isSpell, isTrap } from './engine.js';

const card = (inst) => CARDS[inst.cardId];
const emptyCol = (arr) => arr.findIndex(v => !v);

export function chooseAIAction(state, me) {
  if (!state || state.winner !== null || state.turnPlayer !== me) return null;
  const p = state.players[me];
  const foe = state.players[1 - me];

  if (state.phase === 'main') {
    // 1. Flip/activate a set spell if it is useful.
    for (let col = 0; col < 4; col++) {
      const inst = p.field.spells[col];
      if (!inst || !inst.faceDown || !isSpell(inst) || inst.setTurn >= state.turn) continue;
      const c = card(inst);
      if (usefulSpell(c, p, foe)) return { type: 'activateSet', zone: { col } };
    }

    // 2. Normal summon / set.
    if (!p.normalSummoned) {
      const monsters = p.hand.filter(isMonster).sort((a, b) => {
        const ca = card(a), cb = card(b);
        return (cb.atk + cb.def * .4) - (ca.atk + ca.def * .4);
      });
      const col = emptyCol(p.field.monsters);
      if (monsters.length && col >= 0) {
        const m = monsters[0];
        const c = card(m);
        const foeThreat = foe.field.monsters.filter(Boolean).reduce((max, i) => Math.max(max, effAtk(i)), 0);
        const defensive = c.atk < 1500 || (foeThreat > c.atk && c.def > c.atk);
        return { type: defensive ? 'setMonster' : 'summon', uid: m.uid, zone: { col } };
      }
    }

    // 3. Use a useful spell from hand.
    const spells = p.hand.filter(isSpell);
    for (const s of spells) {
      const c = card(s);
      if (usefulSpell(c, p, foe)) return { type: 'activateSpell', uid: s.uid };
    }

    // 4. Set a trap or spare spell.
    const trap = p.hand.find(isTrap);
    const spare = p.hand.find(c => isSpell(c) && !usefulSpell(card(c), p, foe));
    const spellCol = emptyCol(p.field.spells);
    if (trap && spellCol >= 0) return { type: 'setSpell', uid: trap.uid, zone: { col: spellCol } };
    if (spare && spellCol >= 0 && p.hand.length > 4 && Math.random() < .35) return { type: 'setSpell', uid: spare.uid, zone: { col: spellCol } };

    // 5. Enter battle if there is an attack worth making.
    if (hasGoodAttack(state, me)) return { type: 'nextPhase' };
    return { type: 'endTurn' };
  }

  if (state.phase === 'battle') {
    const attackers = p.field.monsters
      .map((inst, col) => ({ inst, col }))
      .filter(({ inst }) => inst && !inst.faceDown && inst.position === 'atk' && !inst.attacked && !inst.changed);
    for (const { inst, col } of attackers) {
      const atk = effAtk(inst);
      const targets = foe.field.monsters.map((t, c) => ({ t, c })).filter(x => x.t);
      if (!targets.length) return { type: 'attack', from: { col }, direct: true };
      let best = null;
      for (const { t, c } of targets) {
        if (t.faceDown) {
          if (atk >= 1800) {
            const score = 30 + atk;
            if (!best || score > best.score) best = { col: c, score };
          }
          continue;
        }
        const ta = effAtk(t), td = effDef(t);
        if (t.position === 'atk') {
          if (atk > ta) {
            const score = 100 + (atk - ta);
            if (!best || score > best.score) best = { col: c, score };
          }
        } else if (atk > td) {
          const score = 80 + (atk - td) * .2;
          if (!best || score > best.score) best = { col: c, score };
        }
      }
      if (best) return { type: 'attack', from: { col }, to: { col: best.col } };
    }
    return { type: 'endTurn' };
  }
  return { type: 'endTurn' };
}

function usefulSpell(c, p, foe) {
  if (!c) return false;
  switch (c.effect) {
    case 'burn': return foe.lp <= 2000 || Math.random() < .72;
    case 'heal': return p.lp <= 5200;
    case 'draw2': return p.hand.length <= 5 && p.deck.length >= 2;
    case 'buff': return p.field.monsters.some(m => m && !m.faceDown);
    case 'destroy': return foe.field.monsters.some(Boolean);
    case 'search': return p.hand.length <= 5 && p.deck.some(i => cardOf(i).type === 'monster');
  }
  return false;
}

function hasGoodAttack(state, me) {
  const p = state.players[me];
  const foe = state.players[1 - me];
  const attackers = p.field.monsters.filter(inst => inst && !inst.faceDown && inst.position === 'atk' && !inst.attacked && !inst.changed);
  if (!attackers.length) return false;
  const targets = foe.field.monsters.filter(Boolean);
  if (!targets.length) return true;
  return attackers.some(a => {
    const atk = effAtk(a);
    return targets.some(t => {
      if (t.faceDown) return atk >= 1800;
      if (t.position === 'atk') return atk > effAtk(t);
      return atk > effDef(t);
    });
  });
}
