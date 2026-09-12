/*
 * Rule tests for engine.js. Open tests/engine-tests.html in a browser,
 * or run `python tools/run_tests.py` for a headless pass/fail report.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error.message || error) });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function equal(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }

  // A match on the given rules with only the listed units: [player, type, x, y, overrides?].
  function scenario(rules, units, currentPlayer = 'p1') {
    const state = D.createGame(rules);
    const unitSet = D.UNIT_SETS[D.MAPS[state.rules.map].units || 'grid'];
    const counts = {};
    state.units = units.map(([player, type, x, y, extra = {}]) => {
      const stats = { ...unitSet[type], ...(state.rules.unitOverrides[type] || {}) };
      counts[player + type] = (counts[player + type] || 0) + 1;
      return {
        id: `${player}-${type}-${counts[player + type]}`,
        type, player, x, y,
        hp: stats.hp, maxHp: stats.hp, move: stats.move, range: stats.range, damage: stats.damage, armor: stats.armor,
        radius: stats.radius || 0, field: stats.field || 0, splash: stats.splash || 0,
        moved: false, attacked: false,
        ...extra,
      };
    });
    state.currentPlayer = currentPlayer;
    return state;
  }

  const COMMANDS = [['p1', 'command', 2, 12], ['p2', 'command', 12, 2]];
  const unit = (state, id) => D.getUnit(state, id);
  const canReach = (state, id, x, y) => D.legalMoves(state, unit(state, id)).some((c) => c.x === x && c.y === y);
  const targetIds = (state, id) => D.legalTargets(state, unit(state, id)).map((t) => t.id);

  test('Prism targets an enemy at an L-shaped offset without hanging (prototype froze here)', () => {
    const s = scenario('classic', [['p1', 'prism', 2, 10], ['p2', 'scout', 3, 12]]);
    assert(targetIds(s, 'p1-prism-1').includes('p2-scout-1'), 'Prism should be able to fire');
  });

  test('Classic movement jumps walls but cannot stop on them', () => {
    const s = scenario('classic', [['p1', 'scout', 7, 4]]);
    assert(canReach(s, 'p1-scout-1', 7, 6), 'Scout should jump the wall at (7,5)');
    assert(!canReach(s, 'p1-scout-1', 7, 5), 'Scout should not stop on a wall');
  });

  test('Pathing movement must walk around walls', () => {
    const s = scenario('complete', [['p1', 'scout', 7, 4]]);
    assert(!canReach(s, 'p1-scout-1', 7, 6), 'Wall should block the direct route');
    assert(canReach(s, 'p1-scout-1', 4, 4), 'Open route should be reachable');
  });

  test('Pathing lets units pass allies but not enemies', () => {
    const s = scenario('complete', [['p1', 'lancer', 0, 14], ['p1', 'guard', 0, 13], ['p2', 'scout', 1, 14]]);
    assert(canReach(s, 'p1-lancer-1', 0, 12), 'Lancer should pass through the allied Guard');
    assert(!canReach(s, 'p1-lancer-1', 0, 13), 'Lancer should not stop on an ally');
    assert(!canReach(s, 'p1-lancer-1', 2, 14), 'Lancer should not pass through the enemy Scout');
  });

  test('Blocking asteroids cannot be entered', () => {
    const s = scenario('complete', [['p1', 'scout', 7, 4]]);
    assert(!canReach(s, 'p1-scout-1', 7, 3), 'Asteroid at (7,3) should block');
    assert(!canReach(s, 'p1-scout-1', 7, 2), 'Route through the asteroid should be blocked');
    assert(canReach(s, 'p1-scout-1', 8, 2), 'Route around the asteroid should be open');
  });

  test('Armor reduces damage; Prism ignores it', () => {
    const units = [['p1', 'lancer', 5, 12], ['p1', 'prism', 5, 10], ['p2', 'guard', 5, 13]];
    const complete = scenario('complete', units);
    equal(D.damageAgainst(complete, unit(complete, 'p1-lancer-1'), unit(complete, 'p2-guard-1')), 1, 'Lancer vs Guard with armor');
    equal(D.damageAgainst(complete, unit(complete, 'p1-prism-1'), unit(complete, 'p2-guard-1')), 2, 'Prism vs Guard with armor');
    const classic = scenario('classic', units);
    equal(D.damageAgainst(classic, unit(classic, 'p1-lancer-1'), unit(classic, 'p2-guard-1')), 2, 'Lancer vs Guard without armor');
  });

  test('Walls block Lancer shots only when every ranged shot needs a lane', () => {
    const units = [['p1', 'lancer', 7, 4], ['p2', 'scout', 7, 6]];
    assert(!targetIds(scenario('complete', units), 'p1-lancer-1').includes('p2-scout-1'), 'Blocked in complete');
    assert(targetIds(scenario('classic', units), 'p1-lancer-1').includes('p2-scout-1'), 'Open in classic');
  });

  test('Prism beams crossing a wall tile are blocked in every ruleset', () => {
    const units = [['p1', 'prism', 4, 4], ['p2', 'scout', 5, 6]];
    assert(!targetIds(scenario('classic', units), 'p1-prism-1').includes('p2-scout-1'), 'Line crosses wall (5,5)');
  });

  test('A shot grazing a single wall corner is not blocked', () => {
    const s = scenario('complete', [['p1', 'lancer', 4, 5], ['p2', 'scout', 5, 4]]);
    assert(targetIds(s, 'p1-lancer-1').includes('p2-scout-1'), 'Corner shared with one wall should be open');
  });

  test('Orbiter field stops ranged attacks but not adjacent ones', () => {
    const units = [['p1', 'lancer', 3, 12], ['p1', 'guard', 5, 11], ['p2', 'scout', 5, 12], ['p2', 'orbiter', 6, 12]];
    const complete = scenario('complete', units);
    assert(!targetIds(complete, 'p1-lancer-1').includes('p2-scout-1'), 'Ranged attack should be blocked by the field');
    assert(targetIds(complete, 'p1-guard-1').includes('p2-scout-1'), 'Adjacent attack should be allowed');
    assert(targetIds(scenario('classic', units), 'p1-lancer-1').includes('p2-scout-1'), 'No field in classic');
  });

  test('Order limit stops a third unit from acting', () => {
    const s = scenario('orders', [...COMMANDS, ['p1', 'scout', 0, 13], ['p1', 'scout', 4, 13], ['p1', 'lancer', 1, 14]]);
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-1', x: 0, y: 11 }).ok, 'First order');
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-2', x: 4, y: 11 }).ok, 'Second order');
    equal(D.legalMoves(s, unit(s, 'p1-lancer-1')).length, 0, 'Third unit moves');
    assert(!D.applyAction(s, { type: 'move', unitId: 'p1-lancer-1', x: 1, y: 13 }).ok, 'Third order should be rejected');
    equal(D.legalMoves(s, unit(s, 'p1-scout-1')).length, 0, 'A unit cannot move twice');
  });

  test('Opening turn order limit applies only to Player 1\'s first turn', () => {
    const s = scenario({ preset: 'orders', firstTurnOrders: 1 }, [...COMMANDS, ['p1', 'scout', 0, 13], ['p1', 'scout', 4, 13], ['p2', 'scout', 14, 1], ['p2', 'scout', 10, 1]]);
    assert(D.applyAction(s, { type: 'move', unitId: 'p1-scout-1', x: 0, y: 11 }).ok, 'First order');
    equal(D.legalMoves(s, unit(s, 'p1-scout-2')).length, 0, 'Second unit moves on turn 1');
    D.applyAction(s, { type: 'endTurn' });
    assert(D.applyAction(s, { type: 'move', unitId: 'p2-scout-1', x: 14, y: 3 }).ok, 'Player 2 first order');
    assert(D.applyAction(s, { type: 'move', unitId: 'p2-scout-2', x: 10, y: 3 }).ok, 'Player 2 second order');
  });

  test('Star points score at end of turn and win at the target', () => {
    const s = scenario({ preset: 'complete', starTarget: 2 }, [...COMMANDS, ['p1', 'scout', 7, 6], ['p1', 'guard', 7, 8]]);
    D.applyAction(s, { type: 'endTurn' });
    equal(s.score.p1, 2, 'Two stars held');
    equal(s.winner, 'p1', 'Winner');
    equal(s.winReason, 'stars', 'Win reason');
  });

  test('Contested stars do not score', () => {
    const units = [...COMMANDS, ['p1', 'scout', 7, 6], ['p1', 'guard', 7, 8], ['p2', 'scout', 6, 6]];
    const s = scenario({ preset: 'complete', contestedStars: true }, units);
    D.applyAction(s, { type: 'endTurn' });
    equal(s.score.p1, 1, 'Only the uncontested star scores');
    const open = scenario('complete', units);
    D.applyAction(open, { type: 'endTurn' });
    equal(open.score.p1, 2, 'Without the rule both stars score');
  });

  test('Doomstar fires on the enemy Command when fully charged', () => {
    const s = scenario({ preset: 'complete', stars: 'doomstar', doomstarCharge: 2 }, [...COMMANDS, ['p1', 'scout', 7, 6], ['p1', 'guard', 7, 8]]);
    D.applyAction(s, { type: 'endTurn' });
    equal(D.commandOf(s, 'p2').hp, 3, 'Enemy Command HP');
    equal(s.charge.p1, 0, 'Charge resets after firing');
  });

  test('Destroying the Command ends the match', () => {
    const s = scenario('classic', [['p1', 'command', 2, 12], ['p2', 'command', 12, 2, { hp: 1 }], ['p1', 'scout', 12, 3]]);
    assert(D.applyAction(s, { type: 'attack', unitId: 'p1-scout-1', targetId: 'p2-command-1' }).ok, 'Attack');
    equal(s.winner, 'p1', 'Winner');
    assert(!D.applyAction(s, { type: 'endTurn' }).ok, 'No actions after the match ends');
  });

  test('Turn limit ends the match in a draw', () => {
    const s = scenario({ preset: 'classic', turnLimit: 2 }, COMMANDS);
    D.applyAction(s, { type: 'endTurn' });
    D.applyAction(s, { type: 'endTurn' });
    equal(s.winner, 'draw', 'Winner');
  });

  const FIELD_COMMANDS = [['p1', 'command', 9, 34], ['p2', 'command', 35, 10]];

  test('Field movement fills a circle in open space', () => {
    const s = scenario('field', [...FIELD_COMMANDS, ['p1', 'scout', 6, 6]]);
    assert(canReach(s, 'p1-scout-1', 15, 6), 'Straight line at full move (9)');
    assert(canReach(s, 'p1-scout-1', 14, 3), 'Off-axis point inside the circle (8.5)');
    assert(canReach(s, 'p1-scout-1', 12, 12), 'Diagonal point inside the circle (8.5)');
    assert(!canReach(s, 'p1-scout-1', 15, 7), 'Point just outside the circle (9.06)');
  });

  test('Field footprints cannot overlap', () => {
    const s = scenario('field', [...FIELD_COMMANDS, ['p1', 'scout', 6, 6], ['p1', 'guard', 10, 6]]);
    assert(!canReach(s, 'p1-scout-1', 8, 6), 'Scout would overlap the Guard (2 < 0.9 + 1.4)');
    assert(canReach(s, 'p1-scout-1', 7, 6), 'Scout can stand clear of the Guard');
  });

  test('Field attack range is measured edge to edge', () => {
    const far = scenario('field', [...FIELD_COMMANDS, ['p1', 'lancer', 6, 6], ['p2', 'guard', 6, 14]]);
    assert(!targetIds(far, 'p1-lancer-1').includes('p2-guard-1'), 'Gap 5.5 is beyond range 5');
    const near = scenario('field', [...FIELD_COMMANDS, ['p1', 'lancer', 6, 6], ['p2', 'guard', 6, 13]]);
    assert(targetIds(near, 'p1-lancer-1').includes('p2-guard-1'), 'Gap 4.5 is within range 5');
  });

  test('Nova splash hits nearby enemies but not allies or distant enemies', () => {
    const s = scenario('field', [
      ...FIELD_COMMANDS,
      ['p1', 'nova', 6, 6], ['p1', 'scout', 4, 14],
      ['p2', 'scout', 6, 14], ['p2', 'guard', 8, 15], ['p2', 'lancer', 6, 19],
    ]);
    const result = D.applyAction(s, { type: 'attack', unitId: 'p1-nova-1', targetId: 'p2-scout-1' });
    assert(result.ok, 'Attack is legal');
    equal(unit(s, 'p2-scout-1').hp, 1, 'Target HP');
    equal(unit(s, 'p2-guard-1').hp, 2, 'Splashed Guard HP');
    equal(unit(s, 'p2-lancer-1').hp, 2, 'Lancer outside the blast');
    equal(unit(s, 'p1-scout-1').hp, 2, 'No friendly fire');
  });

  test('Field stars are zones and nearby enemies contest them', () => {
    const held = scenario('field', [...FIELD_COMMANDS, ['p1', 'scout', 13, 13]]);
    equal(D.starsHeld(held, 'p1'), 1, 'Scout inside the star zone holds it');
    const contested = scenario('field', [...FIELD_COMMANDS, ['p1', 'scout', 13, 13], ['p2', 'scout', 15, 13]]);
    equal(D.starsHeld(contested, 'p1'), 0, 'Enemy in melee reach contests the star');
  });

  test('Field Orbiter cloak covers allies within its radius', () => {
    const s = scenario('field', [
      ...FIELD_COMMANDS,
      ['p1', 'lancer', 6, 6], ['p1', 'guard', 6, 9],
      ['p2', 'scout', 6, 12], ['p2', 'orbiter', 9, 12],
    ]);
    assert(!targetIds(s, 'p1-lancer-1').includes('p2-scout-1'), 'Ranged attack on a cloaked unit is blocked');
    assert(targetIds(s, 'p1-guard-1').includes('p2-scout-1'), 'Melee attack is allowed');
  });

  test('Bots replay identically from the same seed', () => {
    const a = D.AI.playGame({ rules: 'orders', seed: 7, record: true });
    const b = D.AI.playGame({ rules: 'orders', seed: 7, record: true });
    equal(JSON.stringify(a.actions), JSON.stringify(b.actions), 'Action lists match');
  });

  test('Bot games finish without illegal actions on every ruleset', () => {
    for (const preset of Object.keys(D.RULESETS)) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const result = D.AI.playGame({ rules: preset, seed });
        assert(result.winner, `${preset} seed ${seed} should finish`);
      }
    }
  });

  const list = document.getElementById('list');
  list.innerHTML = results
    .map((r) => `<li class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` - ${r.error}`}</li>`)
    .join('');
  document.getElementById('results').textContent = JSON.stringify({ ok: true, passed: results.every((r) => r.ok), results });
})();
