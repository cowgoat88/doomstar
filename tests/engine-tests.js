/*
 * Rule tests for engine.js and ai.js. Open tests/engine-tests.html in a browser,
 * or run `python tools/run_tests.py` for a headless pass/fail report.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const { test, assert, equal } = window.TestHarness;

  // A match with only the listed ships: [player, type, x, y, overrides?]. Terrain is cleared unless
  // `mapTerrain` is set, so geometry tests don't depend on the map layout. Star and Doomstar zones stay.
  function scenario(rules, units, { mapTerrain = false } = {}) {
    const state = D.createGame(rules);
    if (!mapTerrain) state.terrain = new Array(state.size * state.size).fill('empty');
    const counts = {};
    state.units = units.map(([player, type, x, y, extra = {}]) => {
      counts[player + type] = (counts[player + type] || 0) + 1;
      const id = `${player}-${type}-${counts[player + type]}`;
      return { ...D.createUnit(type, player, x, y, id, state.rules.unitOverrides[type]), ...extra };
    });
    return state;
  }

  // Paint a rectangle of terrain; call before the first query on the state (terrain caches are built lazily).
  function paint(state, kind, x, y, w, h) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) state.terrain[yy * state.size + xx] = kind;
    }
  }

  // Zones on the Proving Ground: stars at (4,16) and (28,16), the Doomstar at (16,16).
  const COMMANDS = [['p1', 'command', 30, 30], ['p2', 'command', 30, 2]];
  const unit = (state, id) => D.getUnit(state, id);
  const canReach = (state, id, x, y) => D.legalMoves(state, unit(state, id)).some((c) => c.x === x && c.y === y);
  const targetIds = (state, id) => D.legalTargets(state, unit(state, id)).map((t) => t.id);
  const endTurn = (state) => D.applyAction(state, { type: 'endTurn' });
  const fire = (state, id) => D.applyAction(state, { type: 'fire', unitId: id });

  // --- Movement and geometry ---

  test('Movement fills a circle in open space', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6]]);
    assert(canReach(s, 'p1-scout-1', 15, 6), 'Straight line at full move (9)');
    assert(canReach(s, 'p1-scout-1', 14, 3), 'Off-axis point inside the circle (8.5)');
    assert(canReach(s, 'p1-scout-1', 12, 12), 'Diagonal point inside the circle (8.5)');
    assert(!canReach(s, 'p1-scout-1', 15, 7), 'Point just outside the circle (9.06)');
  });

  test('Walls force ships to steer around them', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6]]);
    paint(s, 'wall', 9, 0, 1, 13);
    assert(!canReach(s, 'p1-scout-1', 12, 6), 'The wall blocks the direct route');
    assert(!canReach(s, 'p1-scout-1', 8, 6), 'A ship cannot stop overlapping the wall');
    assert(canReach(s, 'p1-scout-1', 6, 15), 'Open route along the wall');
  });

  test('Asteroids block movement but not shots', () => {
    const moving = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 5]]);
    paint(moving, 'asteroid', 0, 8, 13, 1);
    assert(!canReach(moving, 'p1-lancer-1', 6, 11), 'Asteroid belt blocks the route');
    const shooting = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 5], ['p2', 'scout', 6, 11]]);
    paint(shooting, 'asteroid', 0, 8, 13, 1);
    assert(targetIds(shooting, 'p1-lancer-1').includes('p2-scout-1'), 'Shot passes over asteroids');
  });

  test('Walls block shots beyond close range only', () => {
    const far = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 5], ['p2', 'scout', 6, 11]]);
    paint(far, 'wall', 0, 8, 13, 1);
    assert(!targetIds(far, 'p1-lancer-1').includes('p2-scout-1'), 'Wall blocks the ranged shot');
    const close = scenario('doomstar', [...COMMANDS, ['p1', 'guard', 6, 5], ['p2', 'scout', 6, 8]]);
    paint(close, 'wall', 0, 7, 13, 1);
    assert(targetIds(close, 'p1-guard-1').includes('p2-scout-1'), 'Close attacks ignore walls');
  });

  test('Footprints cannot overlap; allies can be passed', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6], ['p1', 'guard', 10, 6]]);
    assert(!canReach(s, 'p1-scout-1', 8, 6), 'Scout would overlap the Guard (2 < 0.9 + 1.4)');
    assert(canReach(s, 'p1-scout-1', 7, 6), 'Scout can stand clear of the Guard');
    assert(canReach(s, 'p1-scout-1', 14, 6), 'Scout passes the allied Guard');
  });

  test('Attack range is measured hull to hull', () => {
    const far = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 6], ['p2', 'guard', 6, 14]]);
    assert(!targetIds(far, 'p1-lancer-1').includes('p2-guard-1'), 'Gap 5.5 is beyond range 5');
    const near = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 6], ['p2', 'guard', 6, 13]]);
    assert(targetIds(near, 'p1-lancer-1').includes('p2-guard-1'), 'Gap 4.5 is within range 5');
  });

  test('Scouts hit from 3 tiles away', () => {
    const near = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6], ['p2', 'lancer', 6, 11]]);
    assert(targetIds(near, 'p1-scout-1').includes('p2-lancer-1'), 'Gap 3 is in range');
    const far = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6], ['p2', 'lancer', 6, 12]]);
    assert(!targetIds(far, 'p1-scout-1').includes('p2-lancer-1'), 'Gap 4 is out of range');
  });

  // --- Combat ---

  test('Hits deal the attacker\'s full damage (no armor)', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'lancer', 6, 6], ['p2', 'guard', 6, 10]]);
    assert(D.applyAction(s, { type: 'attack', unitId: 'p1-lancer-1', targetId: 'p2-guard-1' }).ok, 'Attack');
    equal(unit(s, 'p2-guard-1').hp, D.UNIT_TYPES.guard.hp - D.UNIT_TYPES.lancer.damage, 'Guard HP');
  });

  test('Nova splash hits nearby enemies but not allies or distant enemies', () => {
    const s = scenario('doomstar', [
      ...COMMANDS,
      ['p1', 'nova', 6, 6], ['p1', 'scout', 4, 14],
      ['p2', 'scout', 6, 14], ['p2', 'guard', 8, 15], ['p2', 'lancer', 6, 19],
    ]);
    assert(D.applyAction(s, { type: 'attack', unitId: 'p1-nova-1', targetId: 'p2-scout-1' }).ok, 'Attack is legal');
    const hp = (type) => D.UNIT_TYPES[type].hp;
    const blast = D.UNIT_TYPES.nova.damage;
    equal(unit(s, 'p2-scout-1').hp, hp('scout') - blast, 'Target HP');
    equal(unit(s, 'p2-guard-1').hp, hp('guard') - blast, 'Splashed Guard HP');
    equal(unit(s, 'p2-lancer-1').hp, hp('lancer'), 'Lancer outside the blast');
    equal(unit(s, 'p1-scout-1').hp, hp('scout'), 'No friendly fire');
  });

  test('Destroying the Command ends the match', () => {
    const s = scenario('doomstar', [['p1', 'command', 30, 30], ['p2', 'command', 30, 2, { hp: 1 }], ['p1', 'scout', 30, 6]]);
    assert(D.applyAction(s, { type: 'attack', unitId: 'p1-scout-1', targetId: 'p2-command-1' }).ok, 'Attack');
    equal(s.winner, 'p1', 'Winner');
    equal(s.winReason, 'command', 'Win reason');
    assert(!endTurn(s).ok, 'No actions after the match ends');
  });

  // --- Orders and turns ---

  test('Order limit stops a third ship from acting', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 4, 4], ['p1', 'scout', 12, 4], ['p1', 'lancer', 20, 4]]);
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-1', x: 4, y: 8 }).ok, 'First order');
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-2', x: 12, y: 8 }).ok, 'Second order');
    equal(D.legalMoves(s, unit(s, 'p1-lancer-1')).length, 0, 'Third ship moves');
    assert(!D.applyAction(s, { type: 'move', unitId: 'p1-lancer-1', x: 20, y: 6 }).ok, 'Third order should be rejected');
    equal(D.legalMoves(s, unit(s, 'p1-scout-1')).length, 0, 'A ship cannot move twice');
  });

  test('Opening turn order limit applies only to Player 1\'s first turn', () => {
    const s = scenario({ preset: 'doomstar', firstTurnOrders: 1 }, [
      ...COMMANDS, ['p1', 'scout', 4, 4], ['p1', 'scout', 12, 4], ['p2', 'scout', 4, 28], ['p2', 'scout', 12, 28],
    ]);
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-1', x: 4, y: 8 }).ok, 'First order');
    equal(D.legalMoves(s, unit(s, 'p1-scout-2')).length, 0, 'Second ship moves on turn 1');
    endTurn(s);
    assert(D.applyAction(s, { type: 'move', unitId: 'p2-scout-1', x: 4, y: 24 }).ok, 'Player 2 first order');
    assert(D.applyAction(s, { type: 'move', unitId: 'p2-scout-2', x: 12, y: 24 }).ok, 'Player 2 second order');
  });

  test('Turn limit ends the match in a draw', () => {
    const s = scenario({ preset: 'doomstar', turnLimit: 2 }, COMMANDS);
    endTurn(s);
    endTurn(s);
    equal(s.winner, 'draw', 'Winner');
  });

  // --- Stars and the Doomstar ---

  test('Only crew ships charge the Doomstar from a star', () => {
    const scoutOnly = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 4, 16]]);
    endTurn(scoutOnly);
    equal(scoutOnly.charge.p1, 0, 'A Scout on a star does not charge');
    const crew = scenario('doomstar', [...COMMANDS, ['p1', 'guard', 4, 16], ['p1', 'lancer', 28, 16]]);
    endTurn(crew);
    equal(crew.charge.p1, 2, 'Guard and Lancer each charge +1');
  });

  test('A nearby enemy ship, even a Scout, contests a star', () => {
    const units = [...COMMANDS, ['p1', 'guard', 4, 16], ['p2', 'scout', 7, 16]];
    const contested = scenario('doomstar', units);
    endTurn(contested);
    equal(contested.charge.p1, 0, 'Contested star does not charge');
    const open = scenario({ preset: 'doomstar', contestedStars: false }, units);
    endTurn(open);
    equal(open.charge.p1, 1, 'Without the rule the star charges');
  });

  test('Charge stops at the amount needed to fire', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'guard', 4, 16], ['p1', 'lancer', 28, 16]]);
    s.charge.p1 = s.rules.doomstarCharge - 1;
    endTurn(s);
    equal(s.charge.p1, s.rules.doomstarCharge, 'Charge is capped at doomstarCharge');
  });

  test('Firing needs full charge and a crew ship inside the Doomstar', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'guard', 16, 16], ['p1', 'scout', 18, 14], ['p1', 'lancer', 10, 16]]);
    s.charge.p1 = s.rules.doomstarCharge - 1;
    assert(!D.canFireDoomstar(s, unit(s, 'p1-guard-1')), 'Not enough charge');
    s.charge.p1 = s.rules.doomstarCharge;
    assert(!fire(s, 'p1-scout-1').ok, 'Scouts cannot fire');
    assert(!fire(s, 'p1-lancer-1').ok, 'Crew outside the Doomstar cannot fire');
    assert(fire(s, 'p1-guard-1').ok, 'Crew inside the Doomstar fires');
    equal(unit(s, 'p2-command-1').hp, D.UNIT_TYPES.command.hp - s.rules.doomstarDamage, 'Enemy Command takes the Doomstar damage');
    equal(s.charge.p1, 0, 'Charge resets');
    assert(unit(s, 'p1-guard-1').attacked, 'Firing uses the ship\'s attack');
    assert(!fire(s, 'p1-guard-1').ok, 'Cannot fire twice');
  });

  test('A gunner can fire while contested, unless contestedFiring is on', () => {
    const units = [...COMMANDS, ['p1', 'guard', 16, 16], ['p2', 'scout', 19, 16]];
    const s = scenario('doomstar', units);
    s.charge.p1 = 4;
    assert(D.canFireDoomstar(s, unit(s, 'p1-guard-1')), 'Contested gunner fires');
    const strict = scenario({ preset: 'doomstar', contestedFiring: true }, units);
    strict.charge.p1 = 4;
    assert(!D.canFireDoomstar(strict, unit(strict, 'p1-guard-1')), 'Blocked when contestedFiring is on');
  });

  test('A Doomstar shot that destroys the Command wins', () => {
    const s = scenario('doomstar', [['p1', 'command', 30, 30], ['p2', 'command', 30, 2, { hp: 2 }], ['p1', 'nova', 16, 16]]);
    s.charge.p1 = 4;
    assert(fire(s, 'p1-nova-1').ok, 'Fire');
    equal(s.winner, 'p1', 'Winner');
    equal(s.winReason, 'doomstar', 'Win reason');
  });

  test('Without the crew rule the Doomstar fires by itself at full charge', () => {
    const s = scenario({ preset: 'doomstar', doomstarNeedsCrew: false }, [...COMMANDS, ['p1', 'guard', 4, 16]]);
    s.charge.p1 = s.rules.doomstarCharge - 1;
    endTurn(s);
    equal(unit(s, 'p2-command-1').hp, D.UNIT_TYPES.command.hp - s.rules.doomstarDamage, 'Enemy Command HP');
    equal(s.charge.p1, 0, 'Charge resets');
  });

  // --- Map ---

  test('Proving Ground: rotated armies, no overlaps, fair star distances, every ship can move, no asteroids', () => {
    const s = D.createGame('doomstar');
    assert(!s.terrain.includes('asteroid'), 'The small test map has no asteroids');
    const last = s.size - 1;
    const p1 = s.units.filter((u) => u.player === 'p1');
    const p2 = s.units.filter((u) => u.player === 'p2');
    equal(p1.length, p2.length, 'Army sizes');
    for (const a of p1) {
      assert(p2.some((b) => b.type === a.type && b.x === last - a.x && b.y === last - a.y), `${a.id} has a rotated twin`);
    }
    for (const a of s.units) {
      assert(!['wall', 'asteroid'].includes(D.terrainAt(s, a.x, a.y)), `${a.id} starts on terrain`);
      for (const b of s.units) if (a !== b) assert(D.gap(a, a.x, a.y, b) >= 0, `${a.id} overlaps ${b.id}`);
      if (a.move > 0) assert(D.reachableCells(s, a).length > 0, `${a.id} can move`);
    }
    const c1 = D.commandOf(s, 'p1');
    const c2 = D.commandOf(s, 'p2');
    for (const zone of [...s.stars, s.doomstar]) {
      const d1 = D.distance(zone.x, zone.y, c1.x, c1.y);
      const d2 = D.distance(zone.x, zone.y, c2.x, c2.y);
      assert(Math.abs(d1 - d2) < 1e-9, `Zone (${zone.x}, ${zone.y}) is equally far from both Commands`);
    }
  });

  // --- Bot ---

  test('Bot fires the Doomstar when a gunner is in place', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'guard', 16, 16], ['p1', 'lancer', 20, 24], ['p2', 'lancer', 16, 4]]);
    s.charge.p1 = 4;
    const bot = D.AI.createBot({ seed: 3 });
    const actions = [];
    while (!s.winner && s.currentPlayer === 'p1' && actions.length < 8) {
      const action = bot.nextAction(s);
      actions.push(action.type);
      D.applyAction(s, action);
    }
    assert(actions.includes('fire'), `Bot actions: ${actions.join(', ')}`);
  });

  test('Bots replay identically from the same seed', () => {
    const a = D.AI.playGame({ seed: 7, record: true });
    const b = D.AI.playGame({ seed: 7, record: true });
    equal(JSON.stringify(a.actions), JSON.stringify(b.actions), 'Action lists match');
  });

  test('Bot games finish without illegal actions', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const result = D.AI.playGame({ seed });
      assert(result.winner, `Seed ${seed} should finish`);
    }
  });

  // --- Networking helpers ---

  test('serializeState and deserializeState round-trip through JSON', () => {
    const s = D.createGame('doomstar');
    const bot = D.AI.createBot({ seed: 5 });
    for (let step = 0; step < 40 && !s.winner; step += 1) D.applyAction(s, bot.nextAction(s));
    const revived = D.deserializeState(JSON.parse(JSON.stringify(D.serializeState(s))));
    equal(revived.units.length, s.units.length, 'Same number of units');
    for (const u of s.units) {
      const r = D.getUnit(revived, u.id);
      assert(r, `${u.id} survives the round trip`);
      equal(r.x, u.x, `${u.id} x`);
      equal(r.y, u.y, `${u.id} y`);
      equal(r.hp, u.hp, `${u.id} hp`);
      equal(D.legalMoves(revived, r).length, D.legalMoves(s, u).length, `${u.id} legal move count`);
    }
    equal(revived.turn, s.turn, 'Turn');
    equal(revived.currentPlayer, s.currentPlayer, 'Current player');
    equal(revived.charge.p1, s.charge.p1, 'P1 charge');
    equal(revived.charge.p2, s.charge.p2, 'P2 charge');
  });

  test('applyActionAs rejects actions out of turn', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6], ['p2', 'scout', 26, 26]]);
    equal(s.currentPlayer, 'p1', 'Player 1 moves first');
    assert(!D.applyActionAs(s, 'p2', { type: 'endTurn' }).ok, 'Player 2 cannot end Player 1\'s turn');
    assert(!D.applyActionAs(s, 'p2', { type: 'move', unitId: 'p1-scout-1', x: 6, y: 10 }).ok, 'Player 2 cannot move Player 1\'s ship');
    assert(D.applyActionAs(s, 'p1', { type: 'move', unitId: 'p1-scout-1', x: 6, y: 10 }).ok, 'Player 1 may act on their own turn');
    assert(D.applyActionAs(s, 'p1', { type: 'endTurn' }).ok, 'Player 1 may end their own turn');
    equal(s.currentPlayer, 'p2', 'Turn passed to Player 2');
    assert(!D.applyActionAs(s, 'p1', { type: 'endTurn' }).ok, 'Player 1 cannot end Player 2\'s turn');
  });

  test('unitNear finds a ship past its hull only with slack', () => {
    const s = scenario('doomstar', [...COMMANDS, ['p1', 'scout', 6, 6]]);
    const hullEdge = 6 + D.UNIT_TYPES.scout.radius;
    assert(D.unitNear(s, hullEdge - 0.1, 6), 'A point just inside the hull hits');
    assert(!D.unitNear(s, hullEdge + 0.3, 6), 'A point just outside the hull misses with no slack');
    assert(D.unitNear(s, hullEdge + 0.3, 6, 0.8), 'The same point hits with touch slack');
  });

})();
