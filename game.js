/*
 * Doomstar hot-seat game: two players share one screen, or Player 2 is a bot.
 * Rules live in engine.js and board rendering in board.js; this file handles input and panels.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const AI = D.AI;
  const Board = window.DoomstarBoard;
  const BOT_DELAY_MS = 450;
  const $ = (id) => document.getElementById(id);

  const el = {
    board: $('board'),
    banner: $('boardBanner'),
    turnBanner: $('turnBanner'),
    status: $('statusPanel'),
    scoreboard: $('objectivePanel'),
    roster: $('rosterPanel'),
    rulesList: $('rulesList'),
    endTurn: $('endTurnBtn'),
    fire: $('fireBtn'),
    newGame: $('newGameBtn'),
    opponent: $('opponentSelect'),
  };

  let state;
  let bot = null;
  let botTimer = null;
  let selectedId = null;
  let events = [];
  let message = '';

  function setup() {
    el.opponent.add(new Option('Human (hot-seat)', 'human'));
    for (const [key, persona] of Object.entries(AI.PERSONAS)) el.opponent.add(new Option(`Bot: ${persona.label}`, key));

    el.endTurn.addEventListener('click', () => {
      if (!isBotTurn()) perform({ type: 'endTurn' });
    });
    el.fire.addEventListener('click', () => {
      const selected = selectedId ? D.getUnit(state, selectedId) : null;
      if (!isBotTurn() && D.canFireDoomstar(state, selected)) perform({ type: 'fire', unitId: selected.id });
    });
    el.newGame.addEventListener('click', newMatch);
    el.opponent.addEventListener('change', newMatch);
    el.roster.addEventListener('click', (event) => {
      const card = event.target.closest('[data-unit]');
      if (card && !isBotTurn()) select(card.dataset.unit);
    });
    newMatch();
  }

  function newMatch() {
    clearTimeout(botTimer);
    state = D.createGame('doomstar');
    bot = el.opponent.value === 'human'
      ? null
      : AI.createBot({ p2: el.opponent.value, seed: 1 + Math.floor(Math.random() * 1e9) });
    selectedId = null;
    events = [];
    message = 'Player 1 to move. Select a unit to begin.';
    render();
  }

  const isBotTurn = () => Boolean(bot) && !state.winner && state.currentPlayer === 'p2';

  // `unit` is the ship under the click; `move` is the nearest legal destination to the click, if any.
  function handleBoardClick({ unit, move }) {
    if (state.winner || isBotTurn()) return;
    const selected = selectedId ? D.getUnit(state, selectedId) : null;

    if (selected) {
      if (unit && unit.player === state.currentPlayer) {
        select(unit.id === selected.id ? null : unit.id);
        return;
      }
      if (!unit && move) {
        perform({ type: 'move', unitId: selected.id, x: move.x, y: move.y });
        return;
      }
      if (unit && D.legalTargets(state, selected).includes(unit)) {
        perform({ type: 'attack', unitId: selected.id, targetId: unit.id });
        return;
      }
    }

    if (unit && unit.player === state.currentPlayer) {
      select(unit.id);
      return;
    }
    if (unit) {
      message = describeUnit(unit);
    } else {
      message = selected ? 'Out of reach. Pick a spot inside the green area.' : 'Select one of your ships.';
    }
    select(null);
  }

  function select(unitId) {
    const unit = unitId ? D.getUnit(state, unitId) : null;
    selectedId = unit && unit.player === state.currentPlayer ? unit.id : null;
    if (selectedId) {
      const label = D.UNIT_TYPES[unit.type].label;
      if (!D.canActivate(state, unit)) {
        message = `No orders left this turn; the ${label} must wait.`;
      } else {
        const canMove = D.legalMoves(state, unit).length > 0;
        const targets = D.legalTargets(state, unit).length;
        const fireHint = D.canFireDoomstar(state, unit) ? ' In the Doomstar with full charge: press Fire Doomstar!' : '';
        message = `${label}: ${canMove ? 'click inside the green area to move' : 'no moves left'}; ${targets} target${targets === 1 ? '' : 's'} in range.${fireHint}`;
      }
    }
    render();
  }

  function describeUnit(unit) {
    const label = D.UNIT_TYPES[unit.type].label;
    const armor = unit.armor ? `, armor ${unit.armor}` : '';
    return `${D.PLAYER_NAMES[unit.player]} ${label}: HP ${unit.hp}/${unit.maxHp}, move ${unit.move}, range ${unit.range}, damage ${unit.damage}${armor}. ${Board.abilityText(state.rules, unit.type)}`;
  }

  function perform(action) {
    const result = D.applyAction(state, action);
    if (!result.ok) {
      message = result.error;
      render();
      return;
    }
    events = result.events;
    message = events.map(D.describeEvent).filter(Boolean).join(' ');

    const selected = selectedId ? D.getUnit(state, selectedId) : null;
    if (!selected || (!D.legalMoves(state, selected).length && !D.legalTargets(state, selected).length
      && !D.canFireDoomstar(state, selected))) {
      selectedId = null;
    }
    render();

    if (isBotTurn()) {
      clearTimeout(botTimer);
      botTimer = setTimeout(playBotAction, BOT_DELAY_MS);
    }
  }

  function playBotAction() {
    if (isBotTurn()) perform(bot.nextAction(state));
  }

  function render() {
    const selected = selectedId ? D.getUnit(state, selectedId) : null;
    Board.renderBoard(el.board, state, {
      events,
      selectedId,
      moves: selected ? D.legalMoves(state, selected) : [],
      targets: selected ? D.legalTargets(state, selected) : [],
      onBoardClick: handleBoardClick,
    });
    Board.renderTurnBanner(el.turnBanner, state, isBotTurn() ? ' (bot)' : '');
    el.status.innerHTML = `<div class="status-message">${message}</div>`;
    el.scoreboard.innerHTML = Board.scoreboardHtml(state);
    el.roster.innerHTML = rosterHtml();
    el.rulesList.innerHTML = Board.describeRules(state.rules).map((line) => `<li>${line}</li>`).join('');
    el.banner.hidden = !state.winner;
    if (state.winner) el.banner.innerHTML = Board.winnerBannerHtml(state);
    el.endTurn.disabled = Boolean(state.winner) || isBotTurn();
    el.fire.disabled = isBotTurn() || !D.canFireDoomstar(state, selected);
  }

  function rosterHtml() {
    const player = bot ? 'p1' : state.currentPlayer;
    return state.units
      .filter((u) => u.player === player)
      .map((u) => {
        const label = D.UNIT_TYPES[u.type].label;
        const armor = u.armor ? ` • Armor ${u.armor}` : '';
        return `
          <div class="unit-card${u.id === selectedId ? ' selected' : ''}" data-unit="${u.id}">
            <div class="info">
              <div class="unit-heading">
                ${Board.unitIcon(u.type, player)}
                <span class="unit-small">${label}</span>
              </div>
              <span class="unit-meta">HP ${u.hp}/${u.maxHp} • Damage ${u.damage} • Range ${u.range} • Move ${u.move}${armor}</span>
              <span class="unit-meta">${Board.abilityText(state.rules, u.type)}</span>
            </div>
            <span class="unit-meta unit-status">${unitStatus(u)}</span>
          </div>`;
      })
      .join('');
  }

  function unitStatus(unit) {
    if (state.winner || unit.player !== state.currentPlayer) return '';
    if (!D.canActivate(state, unit)) return 'Waiting';
    if (D.canFireDoomstar(state, unit)) return 'Can fire';
    const canMove = !unit.moved && unit.move > 0;
    if (canMove && !unit.attacked) return 'Ready';
    if (canMove) return 'Can move';
    if (!unit.attacked) return 'Can attack';
    return 'Done';
  }

  setup();
})();
