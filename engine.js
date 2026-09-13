/*
 * Doomstar rules engine.
 *
 * Pure game logic with no DOM access. The hot-seat game, the AI arena and the
 * balance lab all run on this file so that humans and bots play identical rules.
 * Loaded as a classic <script>; exposes `window.Doomstar`.
 *
 * The battlefield is a hidden fine grid. Distances are Euclidean, every ship has a
 * circular footprint, and ranges are measured hull to hull. A match is a plain
 * JSON-friendly state object mutated by `applyAction`:
 *   { type: 'move', unitId, x, y }
 *   { type: 'attack', unitId, targetId }
 *   { type: 'fire', unitId }      fire the Doomstar
 *   { type: 'endTurn' }
 * Tunable rules are a flat object (see DEFAULT_RULES) so variants can be compared in simulation.
 */
(function (root) {
  'use strict';

  const PLAYERS = ['p1', 'p2'];
  const PLAYER_NAMES = { p1: 'Player 1', p2: 'Player 2' };

  // Distances are in fine tiles (3 fine tiles = 1 tile of the original 15x15 prototype).
  // `radius` is the ship's footprint and `splash` the Nova blast radius. There is no armor: every hit
  // (and every blast) deals the attacker's full `damage`.
  const UNIT_TYPES = {
    scout: {
      label: 'Scout', move: 9, range: 3, damage: 2, hp: 4, radius: 0.9,
      ability: 'Fast raider that harasses from short range and contests enemy stars.',
    },
    guard: {
      label: 'Guard', move: 4.5, range: 1.5, damage: 4, hp: 9, radius: 1.4,
      ability: 'Tough frontline brawler with the most hit points.',
    },
    lancer: {
      label: 'Lancer', move: 6, range: 5, damage: 4, hp: 4, radius: 1.1,
      ability: 'Mid-range skirmisher that strikes from a distance.',
    },
    prism: {
      label: 'Prism', move: 4, range: 8, damage: 5, hp: 4, radius: 1.2,
      ability: 'Beam artillery with the heaviest hit.',
    },
    nova: {
      label: 'Nova', move: 7, range: 10, damage: 1, hp: 4, radius: 1.2, splash: 3.5,
      ability: 'Fast, long-range splash harasser: a weak blast that hits every enemy close to the target.',
    },
    command: {
      label: 'Command', move: 0, range: 1.5, damage: 2, hp: 15, radius: 2,
      ability: 'Your command star. It cannot move. Lose it and you lose the battle.',
    },
  };

  // Player 2 is Player 1 rotated 180 degrees.
  const rotateSetup = (slots, size) => slots.map((slot) => ({ ...slot, x: size - 1 - slot.x, y: size - 1 - slot.y }));

  const PROVING_P1 = [
    { type: 'command', x: 16, y: 29 },
    { type: 'guard', x: 12, y: 25 },
    { type: 'guard', x: 20, y: 25 },
    { type: 'scout', x: 4, y: 27 },
    { type: 'scout', x: 28, y: 27 },
    { type: 'lancer', x: 9, y: 29 },
    { type: 'lancer', x: 23, y: 29 },
    { type: 'prism', x: 12, y: 31 },
    { type: 'nova', x: 20, y: 31 },
  ];

  // Terrain shapes: { rect: [x, y, w, h] } and { circle: [x, y, r] }. Stars and the Doomstar are zones { x, y, r }.
  const MAPS = {
    proving: {
      label: 'Proving Ground (33x33 test map)',
      size: 33,
      scale: 3,
      meleeReach: 1.5,
      // Walls split the flank stars from the center. No asteroids: on a board this small they only cause congestion.
      walls: [{ rect: [8, 13, 2, 7] }, { rect: [23, 13, 2, 7] }],
      asteroids: [],
      // Charging stars sit on the midline, equally far from both armies.
      stars: [{ x: 4, y: 16, r: 2 }, { x: 28, y: 16, r: 2 }],
      doomstar: { x: 16, y: 16, r: 3 },
      setup: { p1: PROVING_P1, p2: rotateSetup(PROVING_P1, 33) },
    },
  };

  const DEFAULT_RULES = {
    label: 'Doomstar',
    map: 'proving',
    activations: 2, // ships that may be ordered each turn; 0 = every ship
    firstTurnOrders: 0, // ships Player 1 may order on the opening turn (offsets first-move advantage); 0 = normal
    crew: ['guard', 'lancer', 'prism', 'nova'], // ship types that charge stars and fire the Doomstar
    contestedStars: true, // an enemy ship at close range stops a star from charging
    contestedFiring: false, // true: an enemy ship at close range also stops a gunner from firing
    doomstarCharge: 3, // charge needed to fire
    doomstarDamage: 5, // damage to the enemy Command
    doomstarNeedsCrew: true, // false: the Doomstar fires by itself at the end of a turn with full charge
    turnLimit: 120, // player-turns before the match is called a draw
    unitOverrides: {}, // e.g. { scout: { range: 1.5 } }
    remove: [], // e.g. [{ player: 'p1', type: 'scout' }]
  };

  const RULESETS = {
    doomstar: { label: 'Doomstar: charge at the stars, fire from the center' },
  };

  // ---------------------------------------------------------------------------
  // Setup

  function resolveRules(input) {
    const request = typeof input === 'string' ? { preset: input } : { ...(input || { preset: 'doomstar' }) };
    const preset = request.preset ? RULESETS[request.preset] : {};
    if (!preset) throw new Error(`Unknown ruleset "${request.preset}"`);
    const rules = { ...DEFAULT_RULES, ...preset, ...request };
    rules.unitOverrides = { ...(preset.unitOverrides || {}), ...(request.unitOverrides || {}) };
    rules.remove = [...(request.remove || preset.remove || [])];
    rules.crew = [...rules.crew];
    if (!MAPS[rules.map]) throw new Error(`Unknown map "${rules.map}"`);
    return rules;
  }

  // Paint map shapes onto the tile array: { rect: [x, y, w, h] }, { circle: [x, y, r] } or { x, y, r }.
  function stampTerrain(terrain, size, entries, kind, onlyEmpty = false) {
    const paint = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = y * size + x;
      if (!onlyEmpty || terrain[i] === 'empty') terrain[i] = kind;
    };
    for (const entry of entries) {
      if (entry.rect) {
        const [x, y, w, h] = entry.rect;
        for (let yy = y; yy < y + h; yy += 1) {
          for (let xx = x; xx < x + w; xx += 1) paint(xx, yy);
        }
      } else {
        const [cx, cy, r] = entry.circle || [entry.x, entry.y, entry.r];
        for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy += 1) {
          for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx += 1) {
            if (Math.hypot(xx - cx, yy - cy) <= r) paint(xx, yy);
          }
        }
      }
    }
  }

  function createUnit(type, player, x, y, id, overrides = {}) {
    const stats = { ...UNIT_TYPES[type], ...overrides };
    return {
      id, type, player, x, y,
      hp: stats.hp,
      maxHp: stats.hp,
      move: stats.move,
      range: stats.range,
      damage: stats.damage,
      radius: stats.radius,
      splash: stats.splash || 0,
      moved: false,
      attacked: false,
    };
  }

  function createGame(rulesInput) {
    const rules = resolveRules(rulesInput);
    const map = MAPS[rules.map];
    const { size } = map;
    const terrain = new Array(size * size).fill('empty');
    stampTerrain(terrain, size, map.walls, 'wall');
    stampTerrain(terrain, size, map.asteroids, 'asteroid');
    stampTerrain(terrain, size, map.stars, 'star', true);
    stampTerrain(terrain, size, [map.doomstar], 'doomstar', true);

    const removals = rules.remove.map((r) => ({ ...r }));
    const units = [];
    for (const player of PLAYERS) {
      map.setup[player].forEach((slot, index) => {
        const removal = removals.findIndex((r) => r.player === player && r.type === slot.type);
        if (removal !== -1 && slot.type !== 'command') {
          removals.splice(removal, 1);
          return;
        }
        units.push(createUnit(slot.type, player, slot.x, slot.y, `${player}-${slot.type}-${index}`, rules.unitOverrides[slot.type]));
      });
    }

    return {
      rules,
      size,
      scale: map.scale,
      meleeReach: map.meleeReach,
      terrain,
      stars: map.stars.map((s) => ({ ...s })),
      doomstar: { ...map.doomstar },
      units,
      turn: 1,
      currentPlayer: 'p1',
      activated: [],
      charge: { p1: 0, p2: 0 },
      winner: null,
      winReason: null,
      log: [],
    };
  }

  // Copies everything a move can change. Terrain, zones and rules are shared (never mutated).
  function cloneState(state, { withLog = false } = {}) {
    return {
      ...state,
      units: state.units.map((u) => ({ ...u })),
      activated: state.activated.slice(),
      charge: { ...state.charge },
      log: withLog && state.log ? state.log.slice() : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries

  const otherPlayer = (player) => (player === 'p1' ? 'p2' : 'p1');
  const inBounds = (state, x, y) => x >= 0 && y >= 0 && x < state.size && y < state.size;
  const terrainAt = (state, x, y) => (inBounds(state, x, y) ? state.terrain[y * state.size + x] : 'wall');
  const unitAt = (state, x, y) => state.units.find((u) => u.x === x && u.y === y) || null;
  const getUnit = (state, id) => state.units.find((u) => u.id === id) || null;
  const commandOf = (state, player) => state.units.find((u) => u.player === player && u.type === 'command') || null;
  const blocksMovement = (terrain) => terrain === 'wall' || terrain === 'asteroid';
  const EPSILON = 1e-9;
  const SQRT2 = Math.SQRT2;
  const STEPS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
  // Octile paths (1 and sqrt 2 steps) cover a full Euclidean circle when given this much extra budget.
  const OCTILE_SLACK = 1 / Math.cos(Math.PI / 8);

  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // Space between footprints if `a` stood at (ax, ay).
  function gap(a, ax, ay, b) {
    return distance(ax, ay, b.x, b.y) - a.radius - b.radius;
  }

  // The ship whose footprint covers the board point (px, py), preferring the closest centre.
  function unitNear(state, px, py) {
    let best = null;
    let bestDistance = Infinity;
    for (const u of state.units) {
      const d = distance(u.x, u.y, px, py);
      if (d <= Math.max(u.radius, 0.5) && d < bestDistance) {
        best = u;
        bestDistance = d;
      }
    }
    return best;
  }

  // Distance from each tile centre to the nearest wall, asteroid or board edge, capped at 4.
  // A ship may stand on a tile when this is at least its radius + 0.5.
  const clearanceCache = new WeakMap();

  function clearanceMap(state) {
    const cached = clearanceCache.get(state.terrain);
    if (cached) return cached;
    const { size } = state;
    const cap = 4;
    const clearance = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let nearest = cap;
        for (let dy = -cap; dy <= cap; dy += 1) {
          for (let dx = -cap; dx <= cap; dx += 1) {
            const d = Math.hypot(dx, dy);
            if (d >= nearest) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(state, nx, ny) || blocksMovement(state.terrain[ny * size + nx])) nearest = d;
          }
        }
        clearance[y * size + x] = nearest;
      }
    }
    clearanceCache.set(state.terrain, clearance);
    return clearance;
  }

  // Tiles where `unit` would overlap another ship (only enemies when `enemiesOnly`).
  function footprintBlocks(state, unit, enemiesOnly) {
    const { size } = state;
    const blocked = new Uint8Array(size * size);
    for (const other of state.units) {
      if (other.id === unit.id || (enemiesOnly && other.player === unit.player)) continue;
      const reach = other.radius + unit.radius;
      const r = Math.ceil(reach);
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = other.x + dx;
          const y = other.y + dy;
          if (inBounds(state, x, y) && (Math.hypot(dx, dy) < reach - EPSILON || (dx === 0 && dy === 0))) {
            blocked[y * size + x] = 1;
          }
        }
      }
    }
    return blocked;
  }

  // Minimal binary heap of (priority, value) pairs for path searches.
  function createHeap() {
    const keys = [];
    const values = [];
    return {
      get size() {
        return keys.length;
      },
      push(key, value) {
        let i = keys.length;
        keys.push(key);
        values.push(value);
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (keys[parent] <= key) break;
          keys[i] = keys[parent];
          values[i] = values[parent];
          i = parent;
        }
        keys[i] = key;
        values[i] = value;
      },
      pop() {
        const top = [keys[0], values[0]];
        const lastKey = keys.pop();
        const lastValue = values.pop();
        if (keys.length) {
          let i = 0;
          for (;;) {
            let child = 2 * i + 1;
            if (child >= keys.length) break;
            if (child + 1 < keys.length && keys[child + 1] < keys[child]) child += 1;
            if (keys[child] >= lastKey) break;
            keys[i] = keys[child];
            values[i] = values[child];
            i = child;
          }
          keys[i] = lastKey;
          values[i] = lastValue;
        }
        return top;
      },
    };
  }

  // Tiles a ship could end a move on, ignoring whose turn it is and whether it already moved:
  // inside a circle of `move`, reached by 8-way paths around terrain and enemy footprints.
  // Allies can be passed but not overlapped at the destination.
  function reachableCells(state, unit) {
    const { size } = state;
    const cells = [];
    if (unit.move <= 0) return cells;
    const clearance = clearanceMap(state);
    const needed = unit.radius + 0.5;
    const enemyBlocks = footprintBlocks(state, unit, true);
    const anyBlocks = footprintBlocks(state, unit, false);
    const inCircle = (x, y) => distance(x, y, unit.x, unit.y) <= unit.move + EPSILON;
    const budget = unit.move * OCTILE_SLACK + EPSILON;
    // Float64 so stored costs match heap keys exactly (Float32 rounding would skip diagonal paths).
    const cost = new Float64Array(size * size).fill(Infinity);
    const start = unit.y * size + unit.x;
    cost[start] = 0;
    const heap = createHeap();
    heap.push(0, start);
    while (heap.size) {
      const [spent, i] = heap.pop();
      if (spent > cost[i]) continue;
      const x = i % size;
      const y = (i - x) / size;
      if (i !== start && clearance[i] >= needed && !anyBlocks[i]) cells.push({ x, y });
      for (const [dx, dy, step] of STEPS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(state, nx, ny) || !inCircle(nx, ny)) continue;
        const ni = ny * size + nx;
        if (clearance[ni] < needed || enemyBlocks[ni]) continue;
        if (dx && dy && (clearance[y * size + nx] < needed || clearance[ny * size + x] < needed)) continue;
        const next = spent + step;
        if (next > budget || next >= cost[ni]) continue;
        cost[ni] = next;
        heap.push(next, ni);
      }
    }
    return cells;
  }

  // A ship is inside a star or Doomstar zone while its centre is.
  function inZone(unit, zone) {
    return distance(unit.x, unit.y, zone.x, zone.y) <= zone.r + EPSILON;
  }

  const canCrew = (state, unit) => state.rules.crew.includes(unit.type);

  // Is an enemy ship within close range? Contested ships can't hold stars (contestedStars) or fire (contestedFiring).
  function isContested(state, unit) {
    return state.units.some((e) => e.player !== unit.player && gap(e, e.x, e.y, unit) <= state.meleeReach + EPSILON);
  }

  // The crew ship that holds a star for charging, if any.
  function starHolder(state, star, player = null) {
    return state.units.find((u) => (!player || u.player === player) && canCrew(state, u)
      && inZone(u, star) && !(state.rules.contestedStars && isContested(state, u))) || null;
  }

  // Stars that would charge the Doomstar for `player` right now.
  function starsHeld(state, player) {
    return state.stars.filter((star) => starHolder(state, star, player)).length;
  }

  // Line of fire between cell centres. Only walls block shots. A line that grazes the
  // corner or edge between cells is blocked only when every cell it touches is a wall.
  const lineCache = new WeakMap();

  function clearLine(state, x1, y1, x2, y2) {
    let cache = lineCache.get(state.terrain);
    if (!cache) {
      cache = new Map();
      lineCache.set(state.terrain, cache);
    }
    const cells = state.size * state.size;
    const key = (y1 * state.size + x1) * cells + (y2 * state.size + x2);
    let clear = cache.get(key);
    if (clear === undefined) {
      clear = traceLine(state, x1, y1, x2, y2);
      if (cache.size > 500000) cache.clear();
      cache.set(key, clear);
    }
    return clear;
  }

  function traceLine(state, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    // Sampling at this resolution lands exactly on every cell-boundary crossing and between them.
    const steps = 4 * Math.max(1, Math.abs(dx)) * Math.max(1, Math.abs(dy));
    for (let k = 1; k < steps; k += 1) {
      const xs = cellsAtSample(x1 * steps + dx * k, steps);
      const ys = cellsAtSample(y1 * steps + dy * k, steps);
      let blocked = true;
      for (const cx of xs) {
        for (const cy of ys) {
          const isEndpoint = (cx === x1 && cy === y1) || (cx === x2 && cy === y2);
          if (isEndpoint || terrainAt(state, cx, cy) !== 'wall') blocked = false;
        }
      }
      if (blocked) return false;
    }
    return true;
  }

  // `scaled` is a coordinate multiplied by `steps`; returns the cell(s) that coordinate lies in.
  function cellsAtSample(scaled, steps) {
    const whole = Math.floor(scaled / steps);
    const remainder = scaled - whole * steps;
    if (remainder * 2 < steps) return [whole];
    if (remainder * 2 > steps) return [whole + 1];
    return [whole, whole + 1];
  }

  // Could `unit`, standing at (fx, fy), hit a target of `targetRadius` centred on (tx, ty)?
  // Shots beyond close range need a lane clear of walls.
  function canFireAt(state, unit, fx, fy, tx, ty, targetRadius = 0) {
    const d = distance(fx, fy, tx, ty);
    if (d < EPSILON) return false;
    const reach = d - unit.radius - targetRadius;
    if (reach > unit.range + EPSILON) return false;
    return reach <= state.meleeReach + EPSILON || clearLine(state, fx, fy, tx, ty);
  }

  function canAttackFrom(state, attacker, fx, fy, target) {
    return Boolean(target) && target.player !== attacker.player
      && canFireAt(state, attacker, fx, fy, target.x, target.y, target.radius);
  }

  // How many ships the side to move may order this turn; 0 = no limit.
  function orderLimit(state) {
    const { activations, firstTurnOrders } = state.rules;
    return state.turn === 1 && firstTurnOrders ? firstTurnOrders : activations;
  }

  function canActivate(state, unit) {
    if (state.winner || !unit || unit.player !== state.currentPlayer) return false;
    const limit = orderLimit(state);
    return !limit || state.activated.includes(unit.id) || state.activated.length < limit;
  }

  function ordersLeft(state) {
    const limit = orderLimit(state);
    return limit ? limit - state.activated.length : Infinity;
  }

  function legalMoves(state, unit) {
    if (!unit || unit.moved || !canActivate(state, unit)) return [];
    return reachableCells(state, unit);
  }

  function legalTargets(state, unit) {
    if (!unit || unit.attacked || !canActivate(state, unit)) return [];
    return state.units.filter((t) => canAttackFrom(state, unit, unit.x, unit.y, t));
  }

  const doomstarReady = (state, player) => state.charge[player] >= state.rules.doomstarCharge;

  // A crew ship inside the Doomstar zone (and not contested, when contestedFiring is on).
  function isGunner(state, unit) {
    return canCrew(state, unit) && inZone(unit, state.doomstar)
      && !(state.rules.contestedFiring && isContested(state, unit));
  }

  // A gunner may spend its attack to fire once its side's charge is full.
  function canFireDoomstar(state, unit) {
    return Boolean(unit) && state.rules.doomstarNeedsCrew && !unit.attacked && canActivate(state, unit)
      && doomstarReady(state, unit.player) && isGunner(state, unit);
  }

  // ---------------------------------------------------------------------------
  // Actions

  function applyAction(state, action, { trusted = false } = {}) {
    if (state.winner) return { ok: false, error: 'The match is over.', events: [] };
    const turn = state.turn;
    const events = [];

    if (action.type === 'move') {
      const unit = getUnit(state, action.unitId);
      if (!trusted && !legalMoves(state, unit).some((c) => c.x === action.x && c.y === action.y)) {
        return { ok: false, error: 'Illegal move.', events };
      }
      const from = { x: unit.x, y: unit.y };
      unit.x = action.x;
      unit.y = action.y;
      unit.moved = true;
      markActivated(state, unit);
      events.push({ type: 'move', unitId: unit.id, player: unit.player, unitType: unit.type, from, to: { x: unit.x, y: unit.y } });
    } else if (action.type === 'attack') {
      const unit = getUnit(state, action.unitId);
      const target = getUnit(state, action.targetId);
      if (!trusted && !legalTargets(state, unit).includes(target)) {
        return { ok: false, error: 'Illegal attack.', events };
      }
      attack(state, unit, target, events);
    } else if (action.type === 'fire') {
      const unit = getUnit(state, action.unitId);
      if (!trusted && !canFireDoomstar(state, unit)) {
        return { ok: false, error: 'That ship cannot fire the Doomstar now.', events };
      }
      unit.attacked = true;
      markActivated(state, unit);
      fireDoomstar(state, unit.player, events, unit);
    } else if (action.type === 'endTurn') {
      endTurn(state, events);
    } else {
      return { ok: false, error: `Unknown action "${action.type}".`, events };
    }

    if (state.log) {
      for (const event of events) state.log.push({ turn, ...event });
    }
    return { ok: true, events };
  }

  function attack(state, unit, target, events) {
    const { damage } = unit;
    const dealt = Math.min(damage, target.hp);
    target.hp -= damage;
    unit.attacked = true;
    markActivated(state, unit);
    events.push({
      type: 'attack',
      unitId: unit.id, player: unit.player, unitType: unit.type,
      targetId: target.id, targetPlayer: target.player, targetType: target.type,
      from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y },
      damage, dealt, hpAfter: Math.max(0, target.hp), killed: target.hp <= 0, splash: unit.splash,
    });

    // Splash: every other enemy whose footprint is inside the blast around the target. No friendly fire.
    if (unit.splash) {
      for (const other of state.units) {
        if (other === target || other.player === unit.player || other.hp <= 0) continue;
        if (distance(target.x, target.y, other.x, other.y) - other.radius > unit.splash + EPSILON) continue;
        const blast = unit.damage;
        const blastDealt = Math.min(blast, other.hp);
        other.hp -= blast;
        events.push({
          type: 'splash',
          unitId: unit.id, player: unit.player, unitType: unit.type,
          targetId: other.id, targetPlayer: other.player, targetType: other.type,
          from: { x: target.x, y: target.y }, to: { x: other.x, y: other.y },
          damage: blast, dealt: blastDealt, hpAfter: Math.max(0, other.hp), killed: other.hp <= 0,
        });
      }
    }

    const destroyed = state.units.filter((u) => u.hp <= 0);
    if (destroyed.length) {
      state.units = state.units.filter((u) => u.hp > 0);
      if (destroyed.some((u) => u.type === 'command')) declareWinner(state, unit.player, 'command', events);
    }
  }

  function fireDoomstar(state, player, events, gunner = null) {
    state.charge[player] = 0;
    const target = commandOf(state, otherPlayer(player));
    const damage = state.rules.doomstarDamage;
    target.hp -= damage;
    const killed = target.hp <= 0;
    events.push({
      type: 'doomstar', player,
      unitId: gunner ? gunner.id : null, unitType: gunner ? gunner.type : null,
      from: { x: state.doomstar.x, y: state.doomstar.y }, to: { x: target.x, y: target.y },
      targetId: target.id, damage, hpAfter: Math.max(0, target.hp), killed,
    });
    if (killed) {
      state.units = state.units.filter((u) => u !== target);
      declareWinner(state, player, 'doomstar', events);
    }
  }

  function markActivated(state, unit) {
    if (!state.activated.includes(unit.id)) state.activated.push(unit.id);
  }

  function declareWinner(state, winner, reason, events) {
    state.winner = winner;
    state.winReason = reason;
    events.push({ type: 'win', winner, reason });
  }

  function endTurn(state, events) {
    const { rules } = state;
    const player = state.currentPlayer;
    const held = starsHeld(state, player);
    const before = state.charge[player];
    if (held > 0 && before < rules.doomstarCharge) {
      state.charge[player] = Math.min(rules.doomstarCharge, before + held);
      events.push({ type: 'charge', player, amount: state.charge[player] - before, total: state.charge[player], needed: rules.doomstarCharge });
    }
    if (!rules.doomstarNeedsCrew && doomstarReady(state, player)) fireDoomstar(state, player, events);

    events.push({ type: 'endTurn', player });
    if (state.winner) return;

    state.turn += 1;
    state.currentPlayer = otherPlayer(player);
    state.activated = [];
    for (const u of state.units) {
      if (u.player === state.currentPlayer) {
        u.moved = false;
        u.attacked = false;
      }
    }
    if (state.turn > rules.turnLimit) declareWinner(state, 'draw', 'time', events);
  }

  // ---------------------------------------------------------------------------
  // Text

  const WIN_REASONS = {
    command: 'destroyed the enemy Command',
    doomstar: 'destroyed the enemy Command with the Doomstar',
    time: 'Turn limit reached. The match is a draw.',
  };

  function describeEvent(event) {
    const name = (player, type) => `${player === 'p1' ? 'P1' : 'P2'} ${UNIT_TYPES[type].label}`;
    switch (event.type) {
      case 'move':
        return `${name(event.player, event.unitType)} moved to (${event.to.x}, ${event.to.y}).`;
      case 'attack':
        return event.killed
          ? `${name(event.player, event.unitType)} destroyed ${name(event.targetPlayer, event.targetType)}.`
          : `${name(event.player, event.unitType)} hit ${name(event.targetPlayer, event.targetType)} for ${event.damage} (${event.hpAfter} HP left).`;
      case 'splash':
        return event.killed
          ? `${name(event.player, event.unitType)}'s blast destroyed ${name(event.targetPlayer, event.targetType)}.`
          : `${name(event.player, event.unitType)}'s blast hit ${name(event.targetPlayer, event.targetType)} for ${event.damage} (${event.hpAfter} HP left).`;
      case 'charge':
        return `${PLAYER_NAMES[event.player]} charged the Doomstar +${event.amount} (${event.total}/${event.needed})${event.total >= event.needed ? '. Ready to fire!' : '.'}`;
      case 'doomstar':
        return event.unitType
          ? `${name(event.player, event.unitType)} fired the Doomstar: enemy Command hit for ${event.damage} (${event.hpAfter} HP left)!`
          : `${PLAYER_NAMES[event.player]}'s Doomstar hit the enemy Command for ${event.damage} (${event.hpAfter} HP left)!`;
      case 'endTurn':
        return `${PLAYER_NAMES[event.player]} ended their turn.`;
      case 'win':
        return event.winner === 'draw'
          ? WIN_REASONS.time
          : `${PLAYER_NAMES[event.winner]} wins: ${WIN_REASONS[event.reason]}.`;
      default:
        return '';
    }
  }

  root.Doomstar = {
    PLAYERS,
    PLAYER_NAMES,
    UNIT_TYPES,
    MAPS,
    RULESETS,
    DEFAULT_RULES,
    resolveRules,
    createGame,
    createUnit,
    cloneState,
    applyAction,
    otherPlayer,
    distance,
    gap,
    terrainAt,
    unitAt,
    unitNear,
    getUnit,
    commandOf,
    inZone,
    canCrew,
    isContested,
    starHolder,
    starsHeld,
    reachableCells,
    clearLine,
    canFireAt,
    canAttackFrom,
    canActivate,
    orderLimit,
    ordersLeft,
    legalMoves,
    legalTargets,
    doomstarReady,
    isGunner,
    canFireDoomstar,
    describeEvent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
