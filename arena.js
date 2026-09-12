/*
 * AI Arena: watch two Doomstar bots play, one action at a time.
 * URL parameters (all optional): rules (JSON rule overrides), p1, p2, seed, speed (1-5), autoplay=1.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const AI = D.AI;
  const Board = window.DoomstarBoard;
  const SPEED_DELAYS_MS = [1400, 800, 420, 180, 50];
  const LOG_LENGTH = 150;
  const $ = (id) => document.getElementById(id);

  const el = {
    board: $('board'),
    banner: $('boardBanner'),
    p1: $('p1Bot'),
    p2: $('p2Bot'),
    seed: $('seedInput'),
    speed: $('speedInput'),
    play: $('playBtn'),
    step: $('stepBtn'),
    turn: $('turnBtn'),
    turnBanner: $('turnBanner'),
    scoreboard: $('scoreboard'),
    log: $('battleLog'),
    rulesList: $('rulesList'),
  };

  let state;
  let bot;
  let seed = 1;
  let events = [];
  let timer = null;
  let playing = false;
  let customRules = null;

  const randomSeed = () => 1 + Math.floor(Math.random() * 99999);

  function setup() {
    const params = new URLSearchParams(location.search);

    // Balance Lab links pass rule variants as JSON.
    const rulesParam = params.get('rules');
    if (rulesParam && rulesParam.trim().startsWith('{')) {
      try {
        customRules = JSON.parse(rulesParam);
      } catch {
        customRules = null;
      }
    }

    for (const select of [el.p1, el.p2]) {
      for (const [key, persona] of Object.entries(AI.PERSONAS)) select.add(new Option(persona.label, key));
    }
    if (AI.PERSONAS[params.get('p1')]) el.p1.value = params.get('p1');
    if (AI.PERSONAS[params.get('p2')]) el.p2.value = params.get('p2');
    el.seed.value = params.get('seed') || String(randomSeed());
    if (params.get('speed')) el.speed.value = params.get('speed');

    $('newMatchBtn').addEventListener('click', newMatch);
    $('randomSeedBtn').addEventListener('click', () => {
      el.seed.value = String(randomSeed());
      newMatch();
    });
    for (const select of [el.p1, el.p2]) select.addEventListener('change', newMatch);
    el.play.addEventListener('click', () => (playing ? pause() : play()));
    el.step.addEventListener('click', () => {
      pause();
      step();
    });
    el.turn.addEventListener('click', finishTurn);

    newMatch();
    if (params.get('autoplay')) play();
  }

  function currentRules() {
    return customRules || 'doomstar';
  }

  function newMatch() {
    pause();
    seed = Math.max(1, Math.floor(Number(el.seed.value) || 1));
    el.seed.value = String(seed);
    state = D.createGame(currentRules());
    bot = AI.createBot({ p1: el.p1.value, p2: el.p2.value, seed });
    events = [];
    syncUrl();
    render();
  }

  function syncUrl() {
    const params = new URLSearchParams({
      p1: el.p1.value,
      p2: el.p2.value,
      seed: String(seed),
    });
    if (customRules) params.set('rules', JSON.stringify(customRules));
    try {
      history.replaceState(null, '', `?${params}`);
    } catch {
      // Some browsers refuse history updates on file:// pages; the arena works without it.
    }
  }

  function advance() {
    const action = bot.nextAction(state);
    if (!action) return null;
    const result = D.applyAction(state, action);
    if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(action)}`);
    return { action, events: result.events };
  }

  function step() {
    if (state.winner) return null;
    const outcome = advance();
    if (outcome) events = outcome.events;
    render();
    return outcome;
  }

  function finishTurn() {
    pause();
    const turn = state.turn;
    const collected = [];
    while (!state.winner && state.turn === turn) {
      const outcome = advance();
      if (!outcome) break;
      collected.push(...outcome.events);
    }
    events = collected;
    render();
  }

  function tick() {
    const outcome = step();
    if (!outcome || state.winner) {
      pause();
      return;
    }
    const delay = SPEED_DELAYS_MS[Number(el.speed.value) - 1];
    timer = setTimeout(tick, outcome.action.type === 'endTurn' ? delay * 1.5 : delay);
  }

  function play() {
    if (state.winner) return;
    playing = true;
    updateButtons();
    tick();
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    timer = null;
    updateButtons();
  }

  function updateButtons() {
    if (!state) return;
    el.play.textContent = playing ? 'Pause' : 'Play';
    el.play.disabled = Boolean(state.winner);
    el.step.disabled = Boolean(state.winner);
    el.turn.disabled = Boolean(state.winner);
  }

  function render() {
    Board.renderBoard(el.board, state, { events });
    Board.renderTurnBanner(el.turnBanner, state);
    el.scoreboard.innerHTML = Board.scoreboardHtml(state);
    el.rulesList.innerHTML = Board.describeRules(state.rules).map((line) => `<li>${line}</li>`).join('');
    renderLog();
    el.banner.hidden = !state.winner;
    if (state.winner) el.banner.innerHTML = Board.winnerBannerHtml(state, ` · seed ${seed}`);
    updateButtons();
  }

  function renderLog() {
    el.log.innerHTML = state.log.slice(-LOG_LENGTH).reverse().map((e) => {
      if (e.type === 'endTurn') {
        return `<li class="turn">End of ${D.PLAYER_NAMES[e.player]}'s turn, round ${Math.ceil(e.turn / 2)}</li>`;
      }
      const classes = [e.player || e.winner, e.type];
      if (e.killed) classes.push('kill');
      return `<li class="${classes.join(' ')}">${D.describeEvent(e)}</li>`;
    }).join('');
  }

  setup();
})();
