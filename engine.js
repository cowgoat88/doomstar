/*
 * Doomstar rules engine.
 *
 * Pure game logic with no DOM access. The hot-seat game, the AI arena and the
 * balance lab all run on this file so that humans and bots play identical rules.
 * Loaded as a classic <script>; exposes `window.Doomstar`.
 *
 * A match is a plain JSON-friendly state object mutated by `applyAction`:
 *   { type: 'move', unitId, x, y }
 *   { type: 'attack', unitId, targetId }
 *   { type: 'endTurn' }
 * Rules are a flat object of toggles (see DEFAULT_RULES) so that mechanics can be
 * switched on one at a time and compared in simulation.
 */
(function (root) {
  'use strict';

  const PLAYERS = ['p1', 'p2'];
  const PLAYER_NAMES = { p1: 'Player 1', p2: 'Player 2' };

  // Tile-map stats (the original prototype). `radius` is the unit footprint (0 = one tile),
  // `field` the Orbiter cloak radius and `splash` the Nova blast radius.
  const UNIT_TYPES = {
    scout: {
      label: 'Scout', move: 3, range: 1, damage: 1, hp: 2, armor: 0, radius: 0,
      ability: 'Fast recon unit that can move far and dart into weak points.',
    },
    guard: {
      label: 'Guard', move: 1, range: 1, damage: 2, hp: 3, armor: 1, radius: 0,
      ability: 'Frontline defender with extra health and armor.',
    },
    lancer: {
      label: 'Lancer', move: 2, range: 2, damage: 2, hp: 2, armor: 0, radius: 0,
      ability: 'Long-range skirmisher that strikes from a distance.',
    },
    orbiter: {
      label: 'Orbiter', move: 2, range: 1, damage: 1, hp: 2, armor: 0, radius: 0, field: 1,
      ability: 'Small science vessel that projects a cloaking field over nearby allies.',
    },
    prism: {
      label: 'Prism', move: 1, range: 3, damage: 2, hp: 2, armor: 0, radius: 0,
      ability: 'Beam artillery that fires through open lanes and cracks through armor.',
    },
    nova: {
      label: 'Nova', move: 1, range: 2, damage: 1, hp: 2, armor: 0, radius: 0, splash: 1,
      ability: 'Splash artillery: its blast also hits every enemy close to the target.',
    },
    command: {
      label: 'Command', move: 0, range: 1, damage: 1, hp: 5, armor: 1, radius: 0,
      ability: 'The command star. Lose it and the battle collapses.',
    },
  };

  // Field-map stats on the hidden fine grid (3 fine tiles = 1 original tile). Distances are
  // Euclidean and ranges are measured edge to edge between footprints. HP, damage and armor
  // are shared with the tile stats.
  const FIELD_STATS = {
    scout: { move: 9, range: 1.5, radius: 0.9 },
    guard: { move: 4.5, range: 1.5, radius: 1.4 },
    lancer: { move: 6, range: 5, radius: 1.1 },
    orbiter: { move: 6, range: 1.5, radius: 0.8, field: 4 },
    prism: { move: 3, range: 8, radius: 1.2 },
    nova: { move: 4.5, range: 7, radius: 1.2, splash: 3.5 },
    command: { move: 0, range: 1.5, radius: 2 },
  };

  const UNIT_SETS = {
    grid: UNIT_TYPES,
    field: Object.fromEntries(
      Object.entries(UNIT_TYPES).map(([type, stats]) => [type, { ...stats, ...FIELD_STATS[type] }]),
    ),
  };

  // Both armies are 180-degree rotations of each other: (x, y) -> (14 - x, 14 - y).
  const PROTOTYPE_SETUP = {
    p1: [
      { type: 'command', x: 2, y: 12 },
      { type: 'guard', x: 1, y: 12 },
      { type: 'guard', x: 3, y: 12 },
      { type: 'scout', x: 0, y: 13 },
      { type: 'scout', x: 4, y: 13 },
      { type: 'lancer', x: 1, y: 14 },
      { type: 'lancer', x: 3, y: 14 },
      { type: 'orbiter', x: 2, y: 14 },
      { type: 'prism', x: 2, y: 10 },
    ],
    p2: [
      { type: 'command', x: 12, y: 2 },
      { type: 'guard', x: 13, y: 2 },
      { type: 'guard', x: 11, y: 2 },
      { type: 'scout', x: 14, y: 1 },
      { type: 'scout', x: 10, y: 1 },
      { type: 'lancer', x: 13, y: 0 },
      { type: 'lancer', x: 11, y: 0 },
      { type: 'orbiter', x: 12, y: 0 },
      { type: 'prism', x: 12, y: 4 },
    ],
  };

  // Compact chess-style face-off. Player 2 mirrors Player 1 across the middle row: (x, y) -> (x, 10 - y).
  const OUTPOST_P1 = [
    { type: 'command', x: 5, y: 10 },
    { type: 'lancer', x: 3, y: 10 },
    { type: 'lancer', x: 7, y: 10 },
    { type: 'scout', x: 2, y: 9 },
    { type: 'guard', x: 4, y: 9 },
    { type: 'orbiter', x: 5, y: 9 },
    { type: 'guard', x: 6, y: 9 },
    { type: 'scout', x: 8, y: 9 },
    { type: 'prism', x: 5, y: 8 },
  ];
  const OUTPOST_SETUP = {
    p1: OUTPOST_P1,
    p2: OUTPOST_P1.map((slot) => ({ ...slot, y: 10 - slot.y })),
  };

  // Open battlefield on a hidden 45x45 grid. Player 2 is Player 1 rotated 180 degrees: (x, y) -> (44 - x, 44 - y).
  const EXPANSE_P1 = [
    { type: 'command', x: 9, y: 34 },
    { type: 'guard', x: 5, y: 34 },
    { type: 'guard', x: 13, y: 34 },
    { type: 'scout', x: 2, y: 38 },
    { type: 'scout', x: 17, y: 38 },
    { type: 'lancer', x: 5, y: 41 },
    { type: 'lancer', x: 13, y: 41 },
    { type: 'orbiter', x: 9, y: 41 },
    { type: 'nova', x: 9, y: 30 },
    { type: 'prism', x: 9, y: 26 },
  ];
  const EXPANSE_SETUP = {
    p1: EXPANSE_P1,
    p2: EXPANSE_P1.map((slot) => ({ ...slot, x: 44 - slot.x, y: 44 - slot.y })),
  };

  const CENTRAL_WALLS = [
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
    [5, 9], [6, 9], [7, 9], [8, 9], [9, 9],
  ];

  const MAPS = {
    prototype: {
      label: 'Prototype layout',
      size: 15,
      walls: CENTRAL_WALLS,
      // The original asteroid block and stars are not symmetric: stars sit closer to Player 2.
      asteroids: [[7, 7], [8, 7], [7, 8], [8, 8]],
      stars: [[7, 6], [8, 6], [6, 7], [9, 7]],
      setup: PROTOTYPE_SETUP,
    },
    crucible: {
      label: 'Crucible (symmetric)',
      size: 15,
      walls: CENTRAL_WALLS,
      asteroids: [[7, 7], [3, 6], [3, 7], [11, 7], [11, 8], [6, 3], [7, 3], [7, 11], [8, 11]],
      stars: [[7, 6], [7, 8], [6, 7], [8, 7]],
      setup: PROTOTYPE_SETUP,
    },
    outpost: {
      label: 'Outpost (11x11 face-off)',
      size: 11,
      walls: [[3, 4], [7, 4], [3, 6], [7, 6]],
      asteroids: [[5, 4], [5, 6]],
      stars: [[2, 5], [5, 5], [8, 5]],
      setup: OUTPOST_SETUP,
    },
    // Tile maps default to metric 'manhattan', units 'grid', scale 1, meleeReach 1.
    // Field maps describe terrain as shapes: { rect: [x, y, w, h] }, { circle: [x, y, r] }, stars { x, y, r }.
    expanse: {
      label: 'Expanse (open field)',
      size: 45,
      metric: 'euclidean',
      units: 'field',
      scale: 3,
      meleeReach: 1.5,
      walls: [{ rect: [16, 15, 13, 2] }, { rect: [16, 28, 13, 2] }],
      asteroids: [
        { circle: [17, 9, 2.5] }, { circle: [27, 35, 2.5] },
        { circle: [9, 17, 2.5] }, { circle: [35, 27, 2.5] },
        { circle: [22, 11, 1.8] }, { circle: [22, 33, 1.8] },
      ],
      stars: [{ x: 22, y: 22, r: 2.5 }, { x: 12, y: 12, r: 2 }, { x: 32, y: 32, r: 2 }],
      setup: EXPANSE_SETUP,
    },
  };

  const DEFAULT_RULES = {
    label: 'Custom rules',
    map: 'prototype',
    activations: 0, // units that may act each turn; 0 = every unit
    firstTurnOrders: 0, // units Player 1 may order on the opening turn (offsets first-move advantage); 0 = normal
    pathing: false, // true: moves follow orthogonal paths (terrain and enemies block, allies can be passed)
    asteroids: 'open', // 'open' | 'block' (asteroids block movement but not shots)
    armor: false, // true: damage is reduced by armor (minimum 1); Prism ignores armor
    lineOfFire: 'prism', // 'prism': only Prism shots need a clear lane | 'ranged': every shot at range 2+ does
    cloak: 'none', // 'none' | 'field': Orbiter and adjacent allies can only be attacked from adjacent tiles
    stars: 'none', // 'none' | 'points' | 'doomstar'
    contestedStars: false, // true: a star does not score while an enemy unit stands next to it
    starTarget: 12, // 'points': star points needed to win
    doomstarCharge: 6, // 'doomstar': charge needed to fire
    doomstarDamage: 2, // 'doomstar': damage dealt to the enemy Command (ignores armor)
    turnLimit: 120, // player-turns before the match is called
    unitOverrides: {}, // e.g. { scout: { move: 2 } }
    remove: [], // e.g. [{ player: 'p1', type: 'scout' }]
  };

  const RULESETS = {
    classic: {
      label: 'Classic: prototype rules as coded',
    },
    complete: {
      label: 'Complete: described mechanics working, every unit acts',
      map: 'crucible', pathing: true, asteroids: 'block', armor: true,
      lineOfFire: 'ranged', cloak: 'field', stars: 'points',
    },
    orders: {
      label: 'Orders: Complete + 2 unit orders per turn',
      map: 'crucible', activations: 2, pathing: true, asteroids: 'block', armor: true,
      lineOfFire: 'ranged', cloak: 'field', stars: 'points',
    },
    doomstar: {
      label: 'Doomstar: 2 orders, contested stars charge the Doomstar',
      map: 'crucible', activations: 2, pathing: true, asteroids: 'block', armor: true,
      lineOfFire: 'ranged', cloak: 'field', stars: 'doomstar', contestedStars: true,
    },
    field: {
      label: 'Field: open battlefield with circular ranges (Doomstar rules)',
      map: 'expanse', activations: 2, pathing: true, asteroids: 'block', armor: true,
      lineOfFire: 'ranged', cloak: 'field', stars: 'doomstar', contestedStars: true,
    },
  };

  // ---------------------------------------------------------------------------
  // Setup

  function resolveRules(input) {
    const request = typeof input === 'string' ? { preset: input } : { ...(input || { preset: 'classic' }) };
    const preset = request.preset ? RULESETS[request.preset] : {};
    if (!preset) throw new Error(`Unknown ruleset "${request.preset}"`);
    const rules = { ...DEFAULT_RULES, ...preset, ...request };
    rules.unitOverrides = { ...(preset.unitOverrides || {}), ...(request.unitOverrides || {}) };
    rules.remove = [...(request.remove || preset.remove || [])];
    if (!MAPS[rules.map]) throw new Error(`Unknown map "${rules.map}"`);
    return rules;
  }

  // Paint map entries onto the tile array: [x, y] tiles, { rect: [x, y, w, h] }, { circle: [x, y, r] } or { x, y, r }.
  function stampTerrain(terrain, size, entries, kind, onlyEmpty = false) {
    const paint = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = y * size + x;
      if (!onlyEmpty || terrain[i] === 'empty') terrain[i] = kind;
    };
    for (const entry of entries) {
      if (Array.isArray(entry)) {
        paint(entry[0], entry[1]);
      } else if (entry.rect) {
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

  function createGame(rulesInput) {
    const rules = resolveRules(rulesInput);
    const map = MAPS[rules.map];
    const size = map.size;
    const terrain = new Array(size * size).fill('empty');
    stampTerrain(terrain, size, map.walls, 'wall');
    stampTerrain(terrain, size, map.asteroids, 'asteroid');
    stampTerrain(terrain, size, map.stars, 'star', true);
    const stars = map.stars.map((s) => (Array.isArray(s) ? { x: s[0], y: s[1], r: 0 } : { x: s.x, y: s.y, r: s.r }));
    const unitSet = UNIT_SETS[map.units || 'grid'];

    const removals = rules.remove.map((r) => ({ ...r }));
    const units = [];
    for (const player of PLAYERS) {
      map.setup[player].forEach((slot, index) => {
        const removal = removals.findIndex((r) => r.player === player && r.type === slot.type);
        if (removal !== -1 && slot.type !== 'command') {
          removals.splice(removal, 1);
          return;
        }
        const stats = { ...unitSet[slot.type], ...(rules.unitOverrides[slot.type] || {}) };
        units.push({
          id: `${player}-${slot.type}-${index}`,
          type: slot.type,
          player,
          x: slot.x,
          y: slot.y,
          hp: stats.hp,
          maxHp: stats.hp,
          move: stats.move,
          range: stats.range,
          damage: stats.damage,
          armor: stats.armor,
          radius: stats.radius || 0,
          field: stats.field || 0,
          splash: stats.splash || 0,
          moved: false,
          attacked: false,
        });
      });
    }

    return {
      rules,
      size,
      metric: map.metric || 'manhattan',
      scale: map.scale || 1,
      meleeReach: map.meleeReach || 1,
      terrain,
      stars,
      units,
      turn: 1,
      currentPlayer: 'p1',
      activated: [],
      score: { p1: 0, p2: 0 },
      charge: { p1: 0, p2: 0 },
      winner: null,
      winReason: null,
      log: [],
    };
  }

  // Copies everything a move can change. Terrain and rules are shared (never mutated).
  function cloneState(state, { withLog = false } = {}) {
    return {
      ...state,
      units: state.units.map((u) => ({ ...u })),
      activated: state.activated.slice(),
      score: { ...state.score },
      charge: { ...state.charge },
      log: withLog && state.log ? state.log.slice() : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries

  const otherPlayer = (player) => (player === 'p1' ? 'p2' : 'p1');
  const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  const inBounds = (state, x, y) => x >= 0 && y >= 0 && x < state.size && y < state.size;
  const terrainAt = (state, x, y) => (inBounds(state, x, y) ? state.terrain[y * state.size + x] : 'wall');
  const unitAt = (state, x, y) => state.units.find((u) => u.x === x && u.y === y) || null;
  const getUnit = (state, id) => state.units.find((u) => u.id === id) || null;
  const commandOf = (state, player) => state.units.find((u) => u.player === player && u.type === 'command') || null;
  const EPSILON = 1e-9;
  const SQRT2 = Math.SQRT2;
  const STEPS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
  // Octile paths (1 and sqrt 2 steps) cover a full Euclidean circle when given this much extra budget.
  const OCTILE_SLACK = 1 / Math.cos(Math.PI / 8);

  // Distance in tiles under the map's metric.
  function distance(state, ax, ay, bx, by) {
    return state.metric === 'euclidean' ? Math.hypot(ax - bx, ay - by) : manhattan(ax, ay, bx, by);
  }

  // Space between footprints if `a` stood at (ax, ay). On tile maps (radius 0) this is the distance.
  function gap(state, a, ax, ay, b) {
    return distance(state, ax, ay, b.x, b.y) - (a.radius || 0) - (b.radius || 0);
  }

  // The unit whose footprint covers the board point (px, py), preferring the closest centre.
  function unitNear(state, px, py) {
    let best = null;
    let bestDistance = Infinity;
    for (const u of state.units) {
      const d = Math.hypot(u.x - px, u.y - py);
      if (d <= Math.max(u.radius || 0, 0.5) && d < bestDistance) {
        best = u;
        bestDistance = d;
      }
    }
    return best;
  }

  function blocksMovement(rules, terrain) {
    return terrain === 'wall' || (terrain === 'asteroid' && rules.asteroids === 'block');
  }

  // Distance from each tile centre to the nearest movement-blocking tile or the board edge, capped at 4.
  // A unit may stand on a tile when this is at least its radius + 0.5.
  const clearanceCache = new WeakMap();

  function clearanceMap(state) {
    let byRule = clearanceCache.get(state.terrain);
    if (!byRule) {
      byRule = {};
      clearanceCache.set(state.terrain, byRule);
    }
    const key = state.rules.asteroids;
    if (byRule[key]) return byRule[key];
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
            if (!inBounds(state, nx, ny) || blocksMovement(state.rules, state.terrain[ny * size + nx])) nearest = d;
          }
        }
        clearance[y * size + x] = nearest;
      }
    }
    byRule[key] = clearance;
    return clearance;
  }

  // Tiles where `unit` would overlap another unit (only enemies when `enemiesOnly`).
  function footprintBlocks(state, unit, enemiesOnly) {
    const { size } = state;
    const blocked = new Uint8Array(size * size);
    for (const other of state.units) {
      if (other.id === unit.id || (enemiesOnly && other.player === unit.player)) continue;
      const reach = (other.radius || 0) + (unit.radius || 0);
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

  // Field maps: tiles within a Euclidean circle of `move`, reached by 8-way paths around terrain
  // and enemy footprints. Allies can be passed but not overlapped at the destination.
  function reachableField(state, unit) {
    const { size } = state;
    const cells = [];
    if (unit.move <= 0) return cells;
    const clearance = clearanceMap(state);
    const needed = (unit.radius || 0) + 0.5;
    const enemyBlocks = footprintBlocks(state, unit, true);
    const anyBlocks = footprintBlocks(state, unit, false);
    const inCircle = (x, y) => Math.hypot(x - unit.x, y - unit.y) <= unit.move + EPSILON;
    const canStop = (i) => clearance[i] >= needed && !anyBlocks[i];

    if (!state.rules.pathing) {
      const r = Math.floor(unit.move);
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = unit.x + dx;
          const y = unit.y + dy;
          if ((dx || dy) && inBounds(state, x, y) && inCircle(x, y) && canStop(y * size + x)) cells.push({ x, y });
        }
      }
      return cells;
    }

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
      if (i !== start && canStop(i)) cells.push({ x, y });
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

  // Star zones: { x, y, r }. On tile maps r is 0, so a unit must stand on the star tile.
  function starCells(state) {
    return state.stars;
  }

  function inStar(state, unit, star) {
    return distance(state, unit.x, unit.y, star.x, star.y) <= star.r + EPSILON;
  }

  // An enemy within melee reach stops a unit from holding a star (when contested stars are on).
  function isContested(state, unit) {
    return state.rules.contestedStars
      && state.units.some((e) => e.player !== unit.player && gap(state, e, e.x, e.y, unit) <= state.meleeReach + EPSILON);
  }

  // The unit that holds a star for scoring, if any (first uncontested unit inside the zone).
  function starHolder(state, star, player = null) {
    return state.units.find((u) => (!player || u.player === player) && inStar(state, u, star) && !isContested(state, u)) || null;
  }

  // Star zones that would score for `player` right now.
  function starsHeld(state, player) {
    let held = 0;
    for (const star of state.stars) {
      if (starHolder(state, star, player)) held += 1;
    }
    return held;
  }

  // Cells a unit could end a move on, ignoring whose turn it is and whether it already moved.
  function reachableCells(state, unit) {
    if (state.metric === 'euclidean') return reachableField(state, unit);
    const { rules, size } = state;
    const cells = [];
    if (unit.move <= 0) return cells;

    const occupant = new Array(size * size).fill(null);
    for (const u of state.units) occupant[u.y * size + u.x] = u;

    if (!rules.pathing) {
      // Classic prototype movement: any open tile within Manhattan distance, even across walls.
      for (let dy = -unit.move; dy <= unit.move; dy += 1) {
        const span = unit.move - Math.abs(dy);
        for (let dx = -span; dx <= span; dx += 1) {
          const x = unit.x + dx;
          const y = unit.y + dy;
          if ((dx === 0 && dy === 0) || !inBounds(state, x, y)) continue;
          const i = y * size + x;
          if (occupant[i] || blocksMovement(rules, state.terrain[i])) continue;
          cells.push({ x, y });
        }
      }
      return cells;
    }

    const steps = new Int8Array(size * size).fill(-1);
    const start = unit.y * size + unit.x;
    steps[start] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head];
      if (steps[i] === unit.move) continue;
      const x = i % size;
      const y = (i - x) / size;
      const neighbours = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbours) {
        if (!inBounds(state, nx, ny)) continue;
        const ni = ny * size + nx;
        if (steps[ni] !== -1 || blocksMovement(rules, state.terrain[ni])) continue;
        const occ = occupant[ni];
        if (occ && occ.player !== unit.player) continue;
        steps[ni] = steps[i] + 1;
        queue.push(ni);
        if (!occ) cells.push({ x: nx, y: ny });
      }
    }
    return cells;
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

  // Melee attacks (within reach of touching) never need a clear lane.
  function needsClearLine(state, unit, reach) {
    if (reach <= state.meleeReach + EPSILON) return false;
    return state.rules.lineOfFire === 'ranged' || unit.type === 'prism';
  }

  // Could `unit`, standing at (fx, fy), fire on a target of `targetRadius` centred on (tx, ty)? Ignores cloaking.
  function canFireAt(state, unit, fx, fy, tx, ty, targetRadius = 0) {
    const d = distance(state, fx, fy, tx, ty);
    if (d < EPSILON) return false;
    const reach = d - (unit.radius || 0) - targetRadius;
    if (reach > unit.range + EPSILON) return false;
    return !needsClearLine(state, unit, reach) || clearLine(state, fx, fy, tx, ty);
  }

  function isCloaked(state, unit) {
    if (state.rules.cloak !== 'field') return false;
    return state.units.some(
      (u) => u.player === unit.player && u.type === 'orbiter'
        && distance(state, u.x, u.y, unit.x, unit.y) <= (u.field || 1) + EPSILON,
    );
  }

  function canAttackFrom(state, attacker, fx, fy, target) {
    if (!target || target.player === attacker.player) return false;
    if (!canFireAt(state, attacker, fx, fy, target.x, target.y, target.radius || 0)) return false;
    return gap(state, attacker, fx, fy, target) <= state.meleeReach + EPSILON || !isCloaked(state, target);
  }

  function damageAgainst(state, attacker, target) {
    if (!state.rules.armor || attacker.type === 'prism') return attacker.damage;
    return Math.max(1, attacker.damage - target.armor);
  }

  // How many units the side to move may order this turn; 0 = no limit.
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
      const damage = damageAgainst(state, unit, target);
      const dealt = Math.min(damage, target.hp);
      target.hp -= damage;
      unit.attacked = true;
      markActivated(state, unit);
      events.push({
        type: 'attack',
        unitId: unit.id, player: unit.player, unitType: unit.type,
        targetId: target.id, targetPlayer: target.player, targetType: target.type,
        from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y },
        damage, dealt, hpAfter: Math.max(0, target.hp), killed: target.hp <= 0, splash: unit.splash || 0,
      });

      // Splash: every other enemy whose footprint is inside the blast around the target. No friendly fire.
      if (unit.splash) {
        for (const other of state.units) {
          if (other === target || other.player === unit.player || other.hp <= 0) continue;
          if (distance(state, target.x, target.y, other.x, other.y) - (other.radius || 0) > unit.splash + EPSILON) continue;
          const blast = damageAgainst(state, unit, other);
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

    if (rules.stars === 'points' && held > 0) {
      state.score[player] += held;
      events.push({ type: 'score', player, points: held, total: state.score[player], target: rules.starTarget });
      if (state.score[player] >= rules.starTarget) declareWinner(state, player, 'stars', events);
    } else if (rules.stars === 'doomstar' && held > 0) {
      state.charge[player] += held;
      events.push({ type: 'charge', player, amount: held, total: state.charge[player], needed: rules.doomstarCharge });
      if (state.charge[player] >= rules.doomstarCharge) {
        state.charge[player] = 0;
        const target = commandOf(state, otherPlayer(player));
        target.hp -= rules.doomstarDamage;
        const killed = target.hp <= 0;
        events.push({ type: 'doomstar', player, targetId: target.id, damage: rules.doomstarDamage, hpAfter: Math.max(0, target.hp), to: { x: target.x, y: target.y }, killed });
        if (killed) {
          state.units = state.units.filter((u) => u !== target);
          declareWinner(state, player, 'doomstar', events);
        }
      }
    }

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

    if (state.turn > rules.turnLimit) {
      if (rules.stars === 'points' && state.score.p1 !== state.score.p2) {
        declareWinner(state, state.score.p1 > state.score.p2 ? 'p1' : 'p2', 'time-points', events);
      } else {
        declareWinner(state, 'draw', 'time', events);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Text

  const WIN_REASONS = {
    command: 'destroyed the enemy Command',
    stars: 'reached the star point target',
    doomstar: 'fired the Doomstar and destroyed the enemy Command',
    'time-points': 'led on star points when time ran out',
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
      case 'score':
        return `${PLAYER_NAMES[event.player]} scored ${event.points} star point${event.points === 1 ? '' : 's'} (${event.total}/${event.target}).`;
      case 'charge':
        return `${PLAYER_NAMES[event.player]} charged the Doomstar +${event.amount} (${event.total}/${event.needed}).`;
      case 'doomstar':
        return `${PLAYER_NAMES[event.player]}'s Doomstar hit the enemy Command for ${event.damage}!`;
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
    UNIT_SETS,
    MAPS,
    RULESETS,
    DEFAULT_RULES,
    resolveRules,
    createGame,
    cloneState,
    applyAction,
    otherPlayer,
    manhattan,
    distance,
    gap,
    terrainAt,
    unitAt,
    unitNear,
    getUnit,
    commandOf,
    starCells,
    inStar,
    starHolder,
    isContested,
    starsHeld,
    reachableCells,
    clearLine,
    canFireAt,
    isCloaked,
    canAttackFrom,
    damageAgainst,
    canActivate,
    orderLimit,
    ordersLeft,
    legalMoves,
    legalTargets,
    describeEvent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
