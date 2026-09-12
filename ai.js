/*
 * Doomstar AI: a greedy, one-turn-lookahead bot used by the arena, the balance lab
 * and the optional computer opponent in the hot-seat game.
 *
 * Each decision enumerates every "plan" available to the side to move (one unit's
 * move and/or attack, in either order), scores the resulting position, and executes
 * the best plan. The turn ends when no plan improves the position. Enemy threat is
 * estimated with per-unit "could hit this tile next turn" maps built once per decision.
 *
 * Personas are weight presets that change how the bot values advancing, risk,
 * sieging the Command and holding stars, which is how the lab probes strategies.
 * Requires engine.js; exposes `Doomstar.AI`.
 */
(function (root) {
  'use strict';

  const D = root.Doomstar;

  const UNIT_VALUE = { scout: 3, guard: 4, lancer: 4.5, orbiter: 3, prism: 5, nova: 4.5, command: 0 };
  // Threat maps on field maps assume a typical target footprint.
  const TYPICAL_RADIUS = 1.1;
  const COMMAND_HP_VALUE = 3;
  const COMMAND_LETHAL_THREAT = 150;
  const WIN_SCORE = 100000;
  const IMPROVEMENT_THRESHOLD = 0.05;
  const MAX_PLANS_PER_TURN = 40;

  // advance: pull toward the enemy Command     risk: fear of losing exposed units
  // support: loss multiplier when an ally could strike back     defend: pull toward raiders near my Command
  // siege: bonus for units already in range of the enemy Command     commandFocus: value of enemy Command HP
  // commandGuard: value of my own Command HP     starSeek / starHold: pull toward and value of holding stars
  const PERSONAS = {
    balanced: {
      label: 'Balanced',
      blurb: 'Trades carefully, advances steadily, contests stars.',
      advance: 0.12, risk: 0.8, support: 0.6, defend: 0.5, siege: 0.6, commandFocus: 1.2, commandGuard: 1.6,
      guardHome: 0, starSeek: 0.25, starHold: 1.5, noise: 0.2,
    },
    rusher: {
      label: 'Rusher',
      blurb: 'Charges the enemy Command and accepts losses to get there.',
      advance: 0.35, risk: 0.45, support: 0.8, defend: 0.1, siege: 1.5, commandFocus: 2, commandGuard: 1,
      guardHome: 0, starSeek: 0.05, starHold: 0.8, noise: 0.2,
    },
    turtle: {
      label: 'Turtle',
      blurb: 'Keeps Guards home, avoids exposure, punishes attackers.',
      advance: 0.03, risk: 1.2, support: 0.5, defend: 0.7, siege: 0.4, commandFocus: 1, commandGuard: 2.2,
      guardHome: 0.35, starSeek: 0.1, starHold: 1.5, noise: 0.2,
    },
    hunter: {
      label: 'Star Hunter',
      blurb: 'Plays for star control above everything else.',
      advance: 0.05, risk: 0.8, support: 0.6, defend: 0.35, siege: 0.4, commandFocus: 1, commandGuard: 1.4,
      guardHome: 0, starSeek: 0.8, starHold: 3, noise: 0.2,
    },
  };
  const RAID_RADIUS = 7;

  function resolvePersona(persona) {
    if (!persona) return PERSONAS.balanced;
    if (typeof persona === 'string') {
      if (!PERSONAS[persona]) throw new Error(`Unknown persona "${persona}"`);
      return PERSONAS[persona];
    }
    return { ...PERSONAS.balanced, ...persona };
  }

  // mulberry32: small, fast, seedable.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Evaluation

  // For each unit of `player`: which tiles could it attack on its next turn?
  // `close` marks melee reach (ignores cloaking); `ranged` marks shots that need a clear lane.
  function buildThreatMaps(state, player) {
    const { size } = state;
    const cells = size * size;
    const targetRadius = state.metric === 'euclidean' ? TYPICAL_RADIUS : 0;
    const maps = [];
    for (const unit of state.units) {
      if (unit.player !== player || unit.damage <= 0) continue;
      const close = new Uint8Array(cells);
      const ranged = new Uint8Array(cells);
      const origins = D.reachableCells(state, unit);
      origins.push({ x: unit.x, y: unit.y });
      const span = Math.ceil(unit.range + (unit.radius || 0) + targetRadius);
      for (const origin of origins) {
        for (let dy = -span; dy <= span; dy += 1) {
          for (let dx = -span; dx <= span; dx += 1) {
            const tx = origin.x + dx;
            const ty = origin.y + dy;
            if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
            const i = ty * size + tx;
            if (close[i]) continue;
            const d = D.distance(state, origin.x, origin.y, tx, ty);
            const reach = d - (unit.radius || 0) - targetRadius;
            if (d < 1e-9 || reach > unit.range + 1e-9) continue;
            if (reach <= state.meleeReach + 1e-9) close[i] = 1;
            else if (!ranged[i] && D.canFireAt(state, unit, origin.x, origin.y, tx, ty, targetRadius)) ranged[i] = 1;
          }
        }
      }
      maps.push({ id: unit.id, unit, close, ranged });
    }
    return maps;
  }

  function unitWorth(unit) {
    return UNIT_VALUE[unit.type] * (0.6 + (0.4 * unit.hp) / unit.maxHp);
  }

  // Score a position from `me`'s point of view, assuming `me` is about to end the turn.
  // `threats` are the enemy's threat maps and `support` my own, both built before the plan.
  function evaluate(state, me, persona, threats, support) {
    if (state.winner) {
      if (state.winner === 'draw') return 0;
      return state.winner === me ? WIN_SCORE : -WIN_SCORE;
    }

    const { rules } = state;
    const foe = D.otherPlayer(me);
    const myCommand = D.commandOf(state, me);
    const foeCommand = D.commandOf(state, foe);
    const mine = [];
    // Distances in original-tile units, so persona weights mean the same on every map.
    const tiles = (a, b) => D.distance(state, a.x, a.y, b.x, b.y) / state.scale;
    let score = myCommand.hp * COMMAND_HP_VALUE * persona.commandGuard
      - foeCommand.hp * COMMAND_HP_VALUE * persona.commandFocus;

    for (const u of state.units) {
      if (u.type === 'command') continue;
      if (u.player === foe) {
        score -= unitWorth(u);
        continue;
      }
      mine.push(u);
      score += unitWorth(u);
      score -= persona.advance * tiles(u, foeCommand);
      if (D.gap(state, u, u.x, u.y, foeCommand) <= u.range && D.canAttackFrom(state, u, u.x, u.y, foeCommand)) {
        score += persona.siege * D.damageAgainst(state, u, foeCommand);
      }
      if (u.type === 'guard' && persona.guardHome) {
        score -= persona.guardHome * Math.max(0, tiles(u, myCommand) - 1);
      }
    }

    // Pull defenders toward enemy raiders that are closing on my Command.
    for (const e of state.units) {
      if (e.player !== foe || e.type === 'command' || !mine.length) continue;
      const toCommand = tiles(e, myCommand);
      if (toCommand > RAID_RADIUS) continue;
      let nearest = Infinity;
      for (const u of mine) nearest = Math.min(nearest, tiles(u, e));
      score -= (persona.defend * nearest * (RAID_RADIUS + 1 - toCommand)) / RAID_RADIUS;
    }

    // Expected losses to the enemy's next turn.
    const alive = new Set();
    for (const u of state.units) alive.add(u.id);
    const losses = [];
    for (const u of state.units) {
      if (u.player !== me) continue;
      const i = u.y * state.size + u.x;
      const cloaked = D.isCloaked(state, u);
      let incoming = 0;
      for (const threat of threats) {
        if (!alive.has(threat.id)) continue;
        if (threat.close[i] || (threat.ranged[i] && !cloaked)) incoming += D.damageAgainst(state, threat.unit, u);
      }
      if (!incoming) continue;
      if (u.type === 'command') {
        losses.push(incoming >= u.hp ? COMMAND_LETHAL_THREAT : incoming * COMMAND_HP_VALUE * persona.commandGuard);
        continue;
      }
      // A unit that allies could avenge is a less attractive target.
      const supported = support.some((s) => s.id !== u.id && alive.has(s.id) && (s.close[i] || s.ranged[i]));
      const fear = persona.risk * (supported ? persona.support : 1);
      losses.push(incoming >= u.hp
        ? unitWorth(u) * fear
        : ((UNIT_VALUE[u.type] * 0.4 * incoming) / u.maxHp) * fear);
    }
    losses.sort((a, b) => b - a);
    const counted = rules.activations ? losses.slice(0, rules.activations) : losses;
    for (const loss of counted) score -= loss;

    if (rules.stars !== 'none') score += evaluateStars(state, me, foe, persona, mine, myCommand, foeCommand);
    return score;
  }

  function evaluateStars(state, me, foe, persona, mine, myCommand, foeCommand) {
    const { rules } = state;
    // Enemy-held stars matter more the closer the enemy is to cashing them in.
    const foeProgress = rules.stars === 'points'
      ? state.score[foe] / rules.starTarget
      : state.charge[foe] / rules.doomstarCharge;
    const urgency = 1 + 3 * foeProgress;
    let score = 0;
    for (const star of D.starCells(state)) {
      const mineHeld = D.starHolder(state, star, me);
      if (mineHeld) {
        score += persona.starHold;
        continue;
      }
      const foeHeld = D.starHolder(state, star, foe);
      if (foeHeld) score -= persona.starHold * urgency;
      let nearest = Infinity;
      for (const u of mine) {
        nearest = Math.min(nearest, Math.max(0, D.distance(state, u.x, u.y, star.x, star.y) - star.r) / state.scale);
      }
      if (nearest !== Infinity) score -= persona.starSeek * (foeHeld ? urgency : 1) * 0.25 * nearest;
    }

    const myHeld = D.starsHeld(state, me);
    const foeHeld = D.starsHeld(state, foe);
    if (rules.stars === 'points') {
      score += (state.score[me] - state.score[foe]) * 0.8;
      // My stars score when this turn ends; the foe's only if they still hold them after my turn.
      if (state.score[me] + myHeld >= rules.starTarget) score += WIN_SCORE / 2;
      if (state.score[foe] + foeHeld >= rules.starTarget) score -= 400;
    } else if (rules.stars === 'doomstar') {
      score += (state.charge[me] - state.charge[foe]) * 0.6;
      if (state.charge[me] + myHeld >= rules.doomstarCharge) {
        score += foeCommand.hp <= rules.doomstarDamage
          ? WIN_SCORE / 2
          : rules.doomstarDamage * COMMAND_HP_VALUE * persona.commandFocus;
      }
      if (state.charge[foe] + foeHeld >= rules.doomstarCharge) {
        score -= myCommand.hp <= rules.doomstarDamage ? 400 : rules.doomstarDamage * COMMAND_HP_VALUE;
      }
    }
    return score;
  }

  // ---------------------------------------------------------------------------
  // Decisions

  // Field maps offer hundreds of destinations per unit. Score every other tile, plus every tile that
  // brings an enemy into range or sits in a star zone, so attacks and objectives are never skipped.
  function candidateMoves(state, unit, cells) {
    if (state.metric !== 'euclidean') return cells;
    const enemies = state.units.filter((u) => u.player !== unit.player);
    return cells.filter((c) => (c.x % 2 === 0 && c.y % 2 === 0)
      || state.stars.some((s) => Math.hypot(c.x - s.x, c.y - s.y) <= s.r)
      || enemies.some((e) => Math.hypot(c.x - e.x, c.y - e.y) - unit.radius - e.radius <= unit.range));
  }

  // Returns the best plan for the side to move: 1-2 actions, or [endTurn].
  function choosePlan(state, persona, rng) {
    const me = state.currentPlayer;
    const threats = buildThreatMaps(state, D.otherPlayer(me));
    const support = buildThreatMaps(state, me);
    let bestPlan = null;
    let bestScore = evaluate(state, me, persona, threats, support) + IMPROVEMENT_THRESHOLD;

    const consider = (plan, result) => {
      const value = evaluate(result, me, persona, threats, support) + (rng() - 0.5) * persona.noise;
      if (value > bestScore) {
        bestScore = value;
        bestPlan = plan;
      }
    };
    const after = (source, action) => {
      const next = D.cloneState(source);
      D.applyAction(next, action, { trusted: true });
      return next;
    };

    for (const unit of state.units) {
      if (unit.player !== me || !D.canActivate(state, unit)) continue;

      for (const target of D.legalTargets(state, unit)) {
        const attack = { type: 'attack', unitId: unit.id, targetId: target.id };
        const afterAttack = after(state, attack);
        consider([attack], afterAttack);
        if (afterAttack.winner) continue;
        const mover = D.getUnit(afterAttack, unit.id);
        for (const cell of candidateMoves(afterAttack, mover, D.legalMoves(afterAttack, mover))) {
          const move = { type: 'move', unitId: unit.id, x: cell.x, y: cell.y };
          consider([attack, move], after(afterAttack, move));
        }
      }

      for (const cell of candidateMoves(state, unit, D.legalMoves(state, unit))) {
        const move = { type: 'move', unitId: unit.id, x: cell.x, y: cell.y };
        const afterMove = after(state, move);
        consider([move], afterMove);
        for (const target of D.legalTargets(afterMove, D.getUnit(afterMove, unit.id))) {
          const attack = { type: 'attack', unitId: unit.id, targetId: target.id };
          consider([move, attack], after(afterMove, attack));
        }
      }
    }

    return bestPlan || [{ type: 'endTurn' }];
  }

  // A bot that can play either side. Call nextAction(state) and apply what it returns.
  function createBot({ p1 = 'balanced', p2 = 'balanced', seed = 1 } = {}) {
    const personas = { p1: resolvePersona(p1), p2: resolvePersona(p2) };
    const rngs = { p1: makeRng(seed * 2 + 1), p2: makeRng(seed * 2 + 2) };
    let queue = [];
    let turnSeen = null;
    let plansThisTurn = 0;

    return {
      nextAction(state) {
        if (state.winner) return null;
        if (turnSeen !== state.turn) {
          turnSeen = state.turn;
          plansThisTurn = 0;
          queue = [];
        }
        if (!queue.length) {
          plansThisTurn += 1;
          const player = state.currentPlayer;
          queue = plansThisTurn > MAX_PLANS_PER_TURN
            ? [{ type: 'endTurn' }]
            : choosePlan(state, personas[player], rngs[player]).slice();
        }
        return queue.shift();
      },
      reset() {
        queue = [];
        turnSeen = null;
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Headless matches

  function newSummary(state) {
    const byType = {};
    for (const player of D.PLAYERS) {
      byType[player] = {};
      for (const type of Object.keys(D.UNIT_TYPES)) {
        byType[player][type] = { fielded: 0, damage: 0, kills: 0, lost: 0, attacks: 0 };
      }
    }
    for (const u of state.units) byType[u.player][u.type].fielded += 1;
    return {
      byType,
      firstHitTurn: null,
      firstKillTurn: null,
      moves: 0,
      attacks: 0,
      commandDamage: { p1: 0, p2: 0 },
      starPoints: { p1: 0, p2: 0 },
      doomstarShots: { p1: 0, p2: 0 },
    };
  }

  function tally(summary, events, turn) {
    for (const e of events) {
      if (e.type === 'move') {
        summary.moves += 1;
      } else if (e.type === 'attack' || e.type === 'splash') {
        const row = summary.byType[e.player][e.unitType];
        if (e.type === 'attack') {
          summary.attacks += 1;
          row.attacks += 1;
        }
        if (summary.firstHitTurn === null) summary.firstHitTurn = turn;
        row.damage += e.dealt;
        if (e.targetType === 'command') summary.commandDamage[e.player] += e.dealt;
        if (e.killed) {
          row.kills += 1;
          summary.byType[e.targetPlayer][e.targetType].lost += 1;
          if (summary.firstKillTurn === null) summary.firstKillTurn = turn;
        }
      } else if (e.type === 'score') {
        summary.starPoints[e.player] += e.points;
      } else if (e.type === 'doomstar') {
        summary.doomstarShots[e.player] += 1;
        summary.commandDamage[e.player] += e.damage;
      }
    }
  }

  function playGame({ rules = 'classic', p1 = 'balanced', p2 = 'balanced', seed = 1, record = false } = {}) {
    const started = Date.now();
    const state = D.createGame(rules);
    state.log = null;
    const bot = createBot({ p1, p2, seed });
    const summary = newSummary(state);
    const actions = record ? [] : null;

    for (let step = 0; !state.winner; step += 1) {
      if (step > 20000) throw new Error('Match did not finish.');
      const action = bot.nextAction(state);
      const turn = state.turn;
      const result = D.applyAction(state, action);
      if (!result.ok) throw new Error(`Bot chose an illegal action: ${result.error} ${JSON.stringify(action)}`);
      tally(summary, result.events, turn);
      if (actions) actions.push(action);
    }

    const count = (player) => state.units.filter((u) => u.player === player && u.type !== 'command').length;
    return {
      seed,
      winner: state.winner,
      reason: state.winReason,
      turns: state.turn,
      score: state.score,
      charge: state.charge,
      survivors: { p1: count('p1'), p2: count('p2') },
      commandHp: {
        p1: D.commandOf(state, 'p1')?.hp ?? 0,
        p2: D.commandOf(state, 'p2')?.hp ?? 0,
      },
      summary,
      actions,
      ms: Date.now() - started,
    };
  }

  D.AI = {
    PERSONAS,
    UNIT_VALUE,
    makeRng,
    resolvePersona,
    buildThreatMaps,
    evaluate,
    choosePlan,
    createBot,
    playGame,
  };
})(typeof window !== 'undefined' ? window : globalThis);
