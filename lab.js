/*
 * Doomstar balance lab: plays many bot-vs-bot matches and summarises the results.
 *
 * Interactive in the browser, or headless for tools/simulate.py:
 *   lab.html?headless=1&suite=NAME&games=N[&seed=S][&only=0,2]
 *   lab.html?headless=1&config=<JSON array of experiments>&games=N
 * Headless runs are synchronous and write a JSON report into <pre id="results">.
 *
 * An experiment is { name, rules, p1, p2, swapSeats }, where rules is a ruleset
 * name or a rules object (see Doomstar.DEFAULT_RULES) and p1/p2 are persona names.
 * Games in different experiments share seeds, so comparisons use common random numbers.
 */
(function (root) {
  'use strict';

  const D = root.Doomstar;
  const AI = D.AI;
  const UNIT_KEYS = Object.keys(D.UNIT_TYPES);

  const NON_COMMAND = UNIT_KEYS.filter((type) => type !== 'command');
  const PERSONA_KEYS = Object.keys(AI.PERSONAS);
  const PAIRINGS = PERSONA_KEYS.flatMap((a, i) => PERSONA_KEYS.slice(i + 1).map((b) => [a, b]));
  const classicWith = (changes) => ({ preset: 'classic', ...changes });
  const ordersWith = (changes) => ({ preset: 'orders', ...changes });

  // Every persona mirror and pairing (seats alternate) on one ruleset.
  const matchups = (label, rules) => [
    ...PERSONA_KEYS.map((p) => ({ name: `${label}: ${p} mirror`, rules, p1: p, p2: p })),
    ...PAIRINGS.map(([a, b]) => ({ name: `${label}: ${a} vs ${b}`, rules, p1: a, p2: b, swapSeats: true })),
  ];

  // One unit removed from one side at a time (only types the map fields); compare against the balanced mirror.
  const unitRemovals = (label, rules) => {
    const request = typeof rules === 'string' ? { preset: rules } : rules;
    const setup = D.MAPS[D.resolveRules(request).map].setup.p1;
    return NON_COMMAND.filter((type) => setup.some((slot) => slot.type === type))
      .flatMap((type) => ['p1', 'p2'].map((player) => ({
        name: `${label}, ${player} missing a ${type}`,
        rules: { ...request, remove: [{ player, type }] },
      })));
  };

  const SUITES = {
    smoke: {
      label: 'Smoke test: each ruleset, balanced mirror',
      experiments: Object.keys(D.RULESETS).map((preset) => ({ name: `${preset}: balanced mirror`, rules: preset })),
    },
    ablation: {
      label: 'Ablation: Classic plus one mechanic at a time',
      experiments: [
        { name: 'classic', rules: 'classic' },
        { name: 'classic + pathing', rules: classicWith({ pathing: true }) },
        { name: 'classic + armor', rules: classicWith({ armor: true }) },
        { name: 'classic + walls block all shots', rules: classicWith({ lineOfFire: 'ranged' }) },
        { name: 'classic + orbiter field', rules: classicWith({ cloak: 'field' }) },
        { name: 'classic + asteroids block', rules: classicWith({ asteroids: 'block' }) },
        { name: 'classic + crucible map', rules: classicWith({ map: 'crucible' }) },
        { name: 'classic + star points (prototype map)', rules: classicWith({ stars: 'points' }) },
        { name: 'classic + star points (crucible map)', rules: classicWith({ stars: 'points', map: 'crucible' }) },
        { name: 'classic + 1 order per turn', rules: classicWith({ activations: 1 }) },
        { name: 'classic + 2 orders per turn', rules: classicWith({ activations: 2 }) },
        { name: 'classic + 3 orders per turn', rules: classicWith({ activations: 3 }) },
        { name: 'complete (all mechanics)', rules: 'complete' },
        { name: 'orders (complete + 2 orders)', rules: 'orders' },
        { name: 'orders, 3 orders per turn', rules: ordersWith({ activations: 3 }) },
        { name: 'orders, doomstar instead of points', rules: ordersWith({ stars: 'doomstar' }) },
        { name: 'orders, no star scoring', rules: ordersWith({ stars: 'none' }) },
      ],
    },
    strategies: {
      label: 'Strategies: every bot pairing, seats alternate',
      experiments: ['classic', 'orders'].flatMap((preset) => matchups(preset, preset)),
    },
    doomstar: {
      label: 'Doomstar rules: bot matchups and unit value',
      experiments: [...matchups('doomstar', 'doomstar'), ...unitRemovals('doomstar', 'doomstar')],
    },
    field: {
      label: 'Field map: bot matchups, unit value and variants',
      experiments: [
        ...matchups('field', 'field'),
        ...unitRemovals('field', 'field'),
        { name: 'field, 3 orders', rules: { preset: 'field', activations: 3 } },
        { name: 'field, stars not contested', rules: { preset: 'field', contestedStars: false } },
        { name: 'field, Nova blast 2', rules: { preset: 'field', unitOverrides: { nova: { splash: 2 } } } },
      ],
    },
    compact: {
      label: 'Compact map: Outpost 11x11 variants',
      experiments: [
        { name: 'classic on outpost', rules: classicWith({ map: 'outpost' }) },
        { name: 'complete on outpost', rules: { preset: 'complete', map: 'outpost' } },
        { name: 'orders on outpost', rules: ordersWith({ map: 'outpost' }) },
        { name: 'outpost, 1 order per turn', rules: ordersWith({ map: 'outpost', activations: 1 }) },
        { name: 'outpost, 3 orders per turn', rules: ordersWith({ map: 'outpost', activations: 3 }) },
        { name: 'outpost, no star scoring', rules: ordersWith({ map: 'outpost', stars: 'none' }) },
        { name: 'outpost, doomstar', rules: ordersWith({ map: 'outpost', stars: 'doomstar' }) },
        { name: 'outpost, star target 8', rules: ordersWith({ map: 'outpost', starTarget: 8 }) },
        { name: 'outpost, star target 16', rules: ordersWith({ map: 'outpost', starTarget: 16 }) },
        { name: 'outpost, Command moves 1', rules: ordersWith({ map: 'outpost', unitOverrides: { command: { move: 1 } } }) },
        { name: 'orders (crucible), Command moves 1', rules: ordersWith({ unitOverrides: { command: { move: 1 } } }) },
      ],
    },
    candidates: {
      label: 'Candidates: first-move edge, win condition, slow units',
      experiments: [
        { name: 'orders + points', rules: 'orders' },
        { name: 'orders + points, P1 opens with 1 order', rules: ordersWith({ firstTurnOrders: 1 }) },
        { name: 'orders + doomstar', rules: ordersWith({ stars: 'doomstar' }) },
        { name: 'doomstar, P1 opens with 1 order', rules: ordersWith({ stars: 'doomstar', firstTurnOrders: 1 }) },
        { name: 'doomstar, charge 4', rules: ordersWith({ stars: 'doomstar', doomstarCharge: 4 }) },
        { name: 'doomstar, charge 8', rules: ordersWith({ stars: 'doomstar', doomstarCharge: 8 }) },
        { name: 'doomstar, Guard moves 2', rules: ordersWith({ stars: 'doomstar', unitOverrides: { guard: { move: 2 } } }) },
        { name: 'doomstar, Prism moves 2', rules: ordersWith({ stars: 'doomstar', unitOverrides: { prism: { move: 2 } } }) },
        { name: 'doomstar, Scout moves 2', rules: ordersWith({ stars: 'doomstar', unitOverrides: { scout: { move: 2 } } }) },
        { name: 'doomstar, 3 orders', rules: ordersWith({ stars: 'doomstar', activations: 3 }) },
        { name: 'outpost + doomstar', rules: ordersWith({ map: 'outpost', stars: 'doomstar' }) },
        { name: 'outpost + doomstar, P1 opens with 1 order', rules: ordersWith({ map: 'outpost', stars: 'doomstar', firstTurnOrders: 1 }) },
        { name: 'outpost + points, P1 opens with 1 order', rules: ordersWith({ map: 'outpost', firstTurnOrders: 1 }) },
        { name: 'outpost + doomstar, 3 orders', rules: ordersWith({ map: 'outpost', stars: 'doomstar', activations: 3 }) },
        { name: 'points, contested stars', rules: ordersWith({ contestedStars: true }) },
        { name: 'doomstar, contested stars', rules: ordersWith({ stars: 'doomstar', contestedStars: true }) },
        { name: 'doomstar, contested, P1 opens with 1', rules: ordersWith({ stars: 'doomstar', contestedStars: true, firstTurnOrders: 1 }) },
        { name: 'outpost + doomstar, contested stars', rules: ordersWith({ map: 'outpost', stars: 'doomstar', contestedStars: true }) },
        { name: 'outpost + doomstar, Prism damage 1', rules: ordersWith({ map: 'outpost', stars: 'doomstar', unitOverrides: { prism: { damage: 1 } } }) },
        { name: 'outpost + doomstar, Prism range 2', rules: ordersWith({ map: 'outpost', stars: 'doomstar', unitOverrides: { prism: { range: 2 } } }) },
        {
          name: 'outpost + doomstar, contested, P1 opens 1, Prism range 2',
          rules: ordersWith({ map: 'outpost', stars: 'doomstar', contestedStars: true, firstTurnOrders: 1, unitOverrides: { prism: { range: 2 } } }),
        },
      ],
    },
    units: {
      label: 'Unit value: remove one unit from one side (orders rules)',
      experiments: [{ name: 'orders baseline', rules: 'orders' }, ...unitRemovals('orders', 'orders')],
    },
  };

  function normalise(experiment) {
    return {
      name: experiment.name || 'Experiment',
      rules: experiment.rules || 'classic',
      p1: experiment.p1 || 'balanced',
      p2: experiment.p2 || 'balanced',
      swapSeats: Boolean(experiment.swapSeats),
    };
  }

  function playOne(experiment, index, seed) {
    const swapped = experiment.swapSeats && index % 2 === 1;
    const result = AI.playGame({
      rules: experiment.rules,
      p1: swapped ? experiment.p2 : experiment.p1,
      p2: swapped ? experiment.p1 : experiment.p2,
      seed: seed + index,
    });
    result.swapped = swapped;
    return result;
  }

  const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

  function wilsonHalfWidth(successes, n, z = 1.96) {
    if (!n) return 0;
    const p = successes / n;
    const denominator = 1 + (z * z) / n;
    return (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  }

  function percentile(sorted, q) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  }

  function summarise(experiment, results) {
    const n = results.length;
    const wins = { p1: 0, p2: 0, draw: 0 };
    const botWins = { a: 0, b: 0 };
    const reasons = {};
    const rounds = [];
    const firstKillRounds = [];
    const units = {};
    for (const type of UNIT_KEYS) units[type] = { fielded: 0, damage: 0, kills: 0, lost: 0, attacks: 0 };
    let attacks = 0;
    let moves = 0;
    let ms = 0;
    let starPoints = 0;
    let survivors = 0;

    for (const r of results) {
      wins[r.winner] += 1;
      if (r.winner !== 'draw') {
        const winnerIsBotA = (r.winner === 'p1') !== r.swapped;
        botWins[winnerIsBotA ? 'a' : 'b'] += 1;
      }
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      rounds.push(Math.ceil(r.turns / 2));
      if (r.summary.firstKillTurn !== null) firstKillRounds.push(Math.ceil(r.summary.firstKillTurn / 2));
      attacks += r.summary.attacks;
      moves += r.summary.moves;
      starPoints += r.summary.starPoints.p1 + r.summary.starPoints.p2;
      survivors += r.survivors.p1 + r.survivors.p2;
      ms += r.ms;
      for (const player of D.PLAYERS) {
        for (const type of UNIT_KEYS) {
          const row = r.summary.byType[player][type];
          for (const key of Object.keys(units[type])) units[type][key] += row[key];
        }
      }
    }

    rounds.sort((a, b) => a - b);
    const pct = (count) => round((100 * count) / n);
    const unitReport = {};
    for (const type of UNIT_KEYS) {
      const u = units[type];
      unitReport[type] = {
        fieldedPerGame: round(u.fielded / n, 2),
        damagePerGame: round(u.damage / n, 2),
        killsPerGame: round(u.kills / n, 2),
        damagePerUnit: u.fielded ? round(u.damage / u.fielded, 2) : 0,
        killsPerUnit: u.fielded ? round(u.kills / u.fielded, 2) : 0,
        lossRate: u.fielded ? round((100 * u.lost) / u.fielded) : 0,
      };
    }

    return {
      name: experiment.name,
      rules: experiment.rules,
      rulesLabel: D.resolveRules(experiment.rules).label,
      p1: experiment.p1,
      p2: experiment.p2,
      swapSeats: experiment.swapSeats,
      games: n,
      p1Win: pct(wins.p1),
      p2Win: pct(wins.p2),
      draw: pct(wins.draw),
      p1WinMargin: round(100 * wilsonHalfWidth(wins.p1, n)),
      botAWin: pct(botWins.a),
      botBWin: pct(botWins.b),
      reasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, pct(v)])),
      roundsAvg: round(rounds.reduce((s, v) => s + v, 0) / n),
      roundsMedian: percentile(rounds, 0.5),
      roundsP10: percentile(rounds, 0.1),
      roundsP90: percentile(rounds, 0.9),
      firstKillRoundAvg: firstKillRounds.length ? round(firstKillRounds.reduce((s, v) => s + v, 0) / firstKillRounds.length) : null,
      attacksPerGame: round(attacks / n),
      movesPerGame: round(moves / n),
      actionsPerTurn: round((attacks + moves) / rounds.reduce((s, v) => s + 2 * v, 0), 2),
      starPointsPerGame: round(starPoints / n),
      survivorsPerGame: round(survivors / n),
      units: unitReport,
      msPerGame: round(ms / n, 0),
    };
  }

  function runSync(experiment, games, seed) {
    const exp = normalise(experiment);
    const results = [];
    for (let i = 0; i < games; i += 1) results.push(playOne(exp, i, seed));
    return summarise(exp, results);
  }

  function runAsync(experiment, games, seed, onProgress) {
    const exp = normalise(experiment);
    const results = [];
    return new Promise((resolve, reject) => {
      const chunk = () => {
        try {
          const until = Date.now() + 40;
          while (results.length < games && Date.now() < until) results.push(playOne(exp, results.length, seed));
          onProgress?.(results.length, games);
          if (results.length < games) setTimeout(chunk, 0);
          else resolve(summarise(exp, results));
        } catch (error) {
          reject(error);
        }
      };
      chunk();
    });
  }

  // ---------------------------------------------------------------------------
  // Headless

  function parseRulesParam(value) {
    if (!value) return 'classic';
    return value.trim().startsWith('{') ? JSON.parse(value) : value;
  }

  // Text map: Player 1 units are capitals, Player 2 lower case; # wall, % asteroid, * star.
  function asciiBoard(state) {
    const letters = { scout: 's', guard: 'g', lancer: 'l', orbiter: 'o', prism: 'p', nova: 'n', command: 'c' };
    const terrain = { empty: '.', wall: '#', asteroid: '%', star: '*' };
    const lines = [`   ${Array.from({ length: state.size }, (_, x) => x % 10).join(' ')}`];
    for (let y = 0; y < state.size; y += 1) {
      const row = [];
      for (let x = 0; x < state.size; x += 1) {
        const u = D.unitAt(state, x, y);
        row.push(u ? (u.player === 'p1' ? letters[u.type].toUpperCase() : letters[u.type]) : terrain[state.terrain[y * state.size + x]]);
      }
      lines.push(`${String(y).padStart(2)} ${row.join(' ')}`);
    }
    return lines.join('\n');
  }

  function narrate(params) {
    const state = D.createGame(parseRulesParam(params.get('rules')));
    const bot = AI.createBot({
      p1: params.get('p1') || 'balanced',
      p2: params.get('p2') || 'balanced',
      seed: Number(params.get('seed') || 1),
    });
    const lines = [`Rules: ${state.rules.label}`, asciiBoard(state)];
    while (!state.winner) {
      const turn = state.turn;
      const action = bot.nextAction(state);
      const { events } = D.applyAction(state, action);
      for (const e of events) {
        if (e.type !== 'endTurn') lines.push(`  r${Math.ceil(turn / 2)} ${D.describeEvent(e)}`);
      }
      if (action.type === 'endTurn' && !state.winner && state.currentPlayer === 'p1') {
        lines.push(`--- after round ${Math.ceil(turn / 2)} ---`, asciiBoard(state));
      }
    }
    lines.push('--- final ---', asciiBoard(state));
    return lines.join('\n');
  }

  function runHeadless(params) {
    const out = document.getElementById('results');
    try {
      if (params.get('narrate')) {
        out.textContent = JSON.stringify({ ok: true, text: narrate(params) });
        return;
      }
      const experiments = params.get('config')
        ? JSON.parse(params.get('config'))
        : SUITES[params.get('suite') || 'smoke']?.experiments;
      if (!experiments) throw new Error(`Unknown suite "${params.get('suite')}"`);
      if (params.get('list')) {
        out.textContent = JSON.stringify({ ok: true, experiments: experiments.map((e) => e.name) });
        return;
      }
      const games = Number(params.get('games') || 20);
      const seed = Number(params.get('seed') || 1);
      const only = params.get('only') ? params.get('only').split(',').map(Number) : null;
      const results = [];
      experiments.forEach((experiment, index) => {
        if (!only || only.includes(index)) results.push({ index, ...runSync(experiment, games, seed) });
      });
      out.textContent = JSON.stringify({ ok: true, games, seed, results });
    } catch (error) {
      out.textContent = JSON.stringify({ ok: false, error: String(error?.stack || error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive page

  function arenaLink(result, seed) {
    const params = new URLSearchParams({
      rules: typeof result.rules === 'string' ? result.rules : JSON.stringify(result.rules),
      p1: result.p1,
      p2: result.p2,
      seed: String(seed),
      autoplay: '1',
    });
    return `arena.html?${params}`;
  }

  function initPage() {
    const $ = (id) => document.getElementById(id);
    const rulesSelect = $('labRules');
    const suiteSelect = $('labSuite');
    const progress = $('labProgress');
    const tableEl = $('labTable');
    const unitsEl = $('labUnits');
    const rows = [];

    for (const [key, preset] of Object.entries(D.RULESETS)) rulesSelect.add(new Option(preset.label, key));
    for (const select of [$('labP1'), $('labP2')]) {
      for (const [key, persona] of Object.entries(AI.PERSONAS)) select.add(new Option(persona.label, key));
    }
    for (const [key, suite] of Object.entries(SUITES)) suiteSelect.add(new Option(suite.label, key));

    const setBusy = (busy) => {
      $('labRun').disabled = busy;
      $('labRunSuite').disabled = busy;
    };

    const renderTable = () => {
      if (!rows.length) {
        tableEl.innerHTML = '<p class="muted">Run an experiment to see results.</p>';
        return;
      }
      tableEl.innerHTML = `
        <div class="table-scroll"><table class="data-table">
          <thead><tr>
            <th>Experiment</th><th>Games</th><th>P1 win</th><th>P2 win</th><th>Draw</th>
            <th>Rounds (median)</th><th>First kill (round)</th><th>How games end</th><th></th>
          </tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr data-row="${i}">
              <td><strong>${r.name}</strong><br><span class="muted">${AI.PERSONAS[r.p1]?.label ?? r.p1} vs ${AI.PERSONAS[r.p2]?.label ?? r.p2}${r.swapSeats ? ' (seats alternate)' : ''}</span></td>
              <td>${r.games}</td>
              <td>${r.p1Win}% <span class="muted">±${r.p1WinMargin}</span>${r.swapSeats ? `<br><span class="muted">Bot A ${r.botAWin}%</span>` : ''}</td>
              <td>${r.p2Win}%${r.swapSeats ? `<br><span class="muted">Bot B ${r.botBWin}%</span>` : ''}</td>
              <td>${r.draw}%</td>
              <td>${r.roundsMedian} <span class="muted">(${r.roundsP10}-${r.roundsP90})</span></td>
              <td>${r.firstKillRoundAvg ?? '-'}</td>
              <td>${Object.entries(r.reasons).map(([k, v]) => `${k} ${v}%`).join('<br>')}</td>
              <td><a class="button-link small" href="${arenaLink(r, r.seed)}" target="_blank" rel="noopener">Watch</a></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
      tableEl.querySelectorAll('tr[data-row]').forEach((tr) => {
        tr.addEventListener('click', () => renderUnits(rows[Number(tr.dataset.row)]));
      });
    };

    const renderUnits = (r) => {
      unitsEl.innerHTML = `
        <p class="muted">${r.name}: per-unit numbers are totals across both players.</p>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Unit</th><th>Fielded / game</th><th>Damage / unit</th><th>Kills / unit</th><th>Lost</th></tr></thead>
          <tbody>${UNIT_KEYS.map((type) => {
            const u = r.units[type];
            return `<tr><td>${D.UNIT_TYPES[type].label}</td><td>${u.fieldedPerGame}</td><td>${u.damagePerUnit}</td><td>${u.killsPerUnit}</td><td>${u.lossRate}%</td></tr>`;
          }).join('')}</tbody>
        </table></div>`;
    };

    const run = async (experiments) => {
      const games = Math.max(1, Number($('labGames').value) || 1);
      const seed = Number($('labSeed').value) || 1;
      setBusy(true);
      try {
        for (const [index, experiment] of experiments.entries()) {
          const result = await runAsync(experiment, games, seed, (done, total) => {
            progress.textContent = `${experiment.name || 'Experiment'} (${index + 1}/${experiments.length}): ${done}/${total} games`;
          });
          result.seed = seed;
          rows.unshift(result);
          renderTable();
          renderUnits(result);
        }
        progress.textContent = 'Done.';
      } catch (error) {
        progress.textContent = `Error: ${error.message}`;
      } finally {
        setBusy(false);
      }
    };

    $('labRun').addEventListener('click', () => {
      let overrides = {};
      try {
        overrides = $('labOverrides').value.trim() ? JSON.parse($('labOverrides').value) : {};
      } catch (error) {
        progress.textContent = `Rule overrides are not valid JSON: ${error.message}`;
        return;
      }
      const preset = rulesSelect.value;
      const rules = Object.keys(overrides).length ? { preset, ...overrides } : preset;
      run([{
        name: Object.keys(overrides).length ? `${preset} + ${JSON.stringify(overrides)}` : preset,
        rules,
        p1: $('labP1').value,
        p2: $('labP2').value,
        swapSeats: $('labSwap').checked,
      }]);
    });
    $('labRunSuite').addEventListener('click', () => run(SUITES[suiteSelect.value].experiments));
    renderTable();
  }

  root.DoomstarLab = { SUITES, runSync, runAsync, summarise };

  const params = new URLSearchParams(root.location.search);
  if (params.get('headless')) runHeadless(params);
  else initPage();
})(window);
