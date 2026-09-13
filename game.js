/*
 * Doomstar game: hot-seat (two players share one screen), vs a bot, or online with a friend.
 * Rules live in engine.js, board rendering in board.js, the online protocol in online.js and the
 * PeerJS transport in net.js; this file handles input, panels and which mode is active.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const AI = D.AI;
  const Board = window.DoomstarBoard;
  const Online = window.DoomstarOnline;
  const Net = window.DoomstarNet;
  const BOT_DELAY_MS = 450;
  const STORAGE_KEY = 'doomstar-online-session';
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
    opponentField: $('opponentField'),
    menuBtn: $('menuBtn'),
    closeMenuBtn: $('closeMenuBtn'),
    sidebar: $('sidebar'),
    sidebarBackdrop: $('sidebarBackdrop'),
    hostBtn: $('hostBtn'),
    joinBtn: $('joinBtn'),
    joinCode: $('joinCodeInput'),
    onlineSetup: $('onlineSetup'),
    onlineConnected: $('onlineConnected'),
    inviteField: $('inviteField'),
    inviteLink: $('inviteLinkInput'),
    copyLink: $('copyLinkBtn'),
    roomCodeText: $('roomCodeText'),
    seatLabel: $('seatLabel'),
    onlineStatus: $('onlineStatus'),
    leaveBtn: $('leaveBtn'),
    chatLog: $('chatLog'),
    chatForm: $('chatForm'),
    chatInput: $('chatInput'),
  };

  let state;
  let bot = null;
  let botTimer = null;
  let selectedId = null;
  let events = [];
  let message = '';
  let pendingMove = null; // touch tap-to-confirm preview cell; mouse never sets this

  // Online play. `session` is a DoomstarOnline host or guest object; `sessionRole` says which.
  let session = null;
  let sessionRole = null; // 'host' | 'guest'
  let roomCode = null;
  let netHandle = null; // DoomstarNet.hostRoom/joinRoom return value, for teardown
  let onlineConnected = false;
  let onlineDisconnected = false;
  let onlineError = null;
  let chat = [];
  let rematchReady = { host: false, guest: false };

  function setup() {
    el.opponent.add(new Option('Human (hot-seat)', 'human'));
    for (const [key, persona] of Object.entries(AI.PERSONAS)) el.opponent.add(new Option(`Bot: ${persona.label}`, key));

    el.endTurn.addEventListener('click', () => {
      if (!isInputLocked()) perform({ type: 'endTurn' });
    });
    el.fire.addEventListener('click', () => {
      const selected = selectedId ? D.getUnit(state, selectedId) : null;
      if (!isInputLocked() && D.canFireDoomstar(state, selected)) perform({ type: 'fire', unitId: selected.id });
    });
    el.newGame.addEventListener('click', () => {
      if (!session) newMatch();
      closeMenu();
    });
    el.opponent.addEventListener('change', () => {
      if (!session) newMatch();
    });
    el.roster.addEventListener('click', (event) => {
      const card = event.target.closest('[data-unit]');
      if (card && !isInputLocked()) {
        select(card.dataset.unit);
        closeMenu(); // back to the board to see the selection (a no-op on desktop, where nothing was hidden)
      }
    });

    el.menuBtn.addEventListener('click', openMenu);
    el.closeMenuBtn.addEventListener('click', closeMenu);
    el.sidebarBackdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    el.hostBtn.addEventListener('click', () => startHost(null));
    el.joinBtn.addEventListener('click', () => {
      const code = el.joinCode.value.trim();
      if (code) startJoin(code, null);
    });
    el.leaveBtn.addEventListener('click', leaveOnlineGame);
    el.copyLink.addEventListener('click', shareInviteLink);
    el.chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = el.chatInput.value.trim();
      if (text && session) {
        session.sendChat(text);
        el.chatInput.value = '';
      }
    });

    startFromUrlOrStorage();
  }

  // On load: resume a saved online session (matching the ?join= code if both are present),
  // otherwise auto-join a ?join=CODE link, otherwise a normal hot-seat/bot match.
  function startFromUrlOrStorage() {
    const params = new URLSearchParams(location.search);
    const joinCode = params.get('join');
    const saved = loadOnlineSession();

    if (saved && (!joinCode || saved.code === joinCode)) {
      if (saved.role === 'host') startHost(saved);
      else startJoin(saved.code, saved);
      return;
    }
    if (joinCode) {
      el.joinCode.value = joinCode;
      startJoin(joinCode, null);
      return;
    }
    newMatch();
  }

  function newMatch() {
    clearTimeout(botTimer);
    state = D.createGame('doomstar');
    bot = el.opponent.value === 'human'
      ? null
      : AI.createBot({ p2: el.opponent.value, seed: 1 + Math.floor(Math.random() * 1e9) });
    selectedId = null;
    pendingMove = null;
    events = [];
    message = 'Player 1 to move. Select a unit to begin.';
    render();
  }

  // The sidebar (Match setup, Online play, Roster, Rules) becomes a slide-in menu below 1024px
  // wide; these are no-ops above that width, where it's CSS-forced to stay open inline.
  function openMenu() {
    el.sidebar.classList.add('open');
    el.sidebarBackdrop.hidden = false;
    el.menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    el.sidebar.classList.remove('open');
    el.sidebarBackdrop.hidden = true;
    el.menuBtn.setAttribute('aria-expanded', 'false');
  }

  const isBotTurn = () => Boolean(bot) && !state.winner && state.currentPlayer === 'p2';

  // True whenever the person looking at this screen should not be able to act right now:
  // it's the bot's turn, or (online) it isn't this seat's turn or the opponent isn't connected.
  function isInputLocked() {
    if (!state || state.winner) return true;
    // `sessionRole` (not `session`) gates this: it is set synchronously when hosting/joining
    // starts, so a click can't slip through and mutate local state during the brief window before
    // the network session object itself exists.
    if (sessionRole) return !session || session.seat !== state.currentPlayer || !onlineConnected || onlineDisconnected;
    return isBotTurn();
  }

  // `unit` is the exact ship under the click; `nearUnit` also allows a little slack (touch taps
  // land less precisely than a mouse); `move` is the nearest legal destination, if any.
  function handleBoardClick({ unit, nearUnit, move, touch }) {
    if (isInputLocked()) return;
    const selected = selectedId ? D.getUnit(state, selectedId) : null;

    if (selected) {
      if (unit && unit.player === state.currentPlayer) {
        pendingMove = null;
        select(unit.id === selected.id ? null : unit.id);
        return;
      }
      if (unit && D.legalTargets(state, selected).includes(unit)) {
        pendingMove = null;
        perform({ type: 'attack', unitId: selected.id, targetId: unit.id });
        return;
      }
      if (!unit && move) {
        if (!touch) {
          perform({ type: 'move', unitId: selected.id, x: move.x, y: move.y });
          return;
        }
        // Touch: a first tap previews the spot; tapping the same spot again confirms the move.
        if (pendingMove && pendingMove.x === move.x && pendingMove.y === move.y) {
          pendingMove = null;
          perform({ type: 'move', unitId: selected.id, x: move.x, y: move.y });
        } else {
          pendingMove = move;
          message = 'Tap again to move here.';
          render();
        }
        return;
      }
      // Nothing exact under the finger: fall back to a nearby ship (touch only).
      if (touch && !unit && nearUnit) {
        if (nearUnit.player === state.currentPlayer) {
          pendingMove = null;
          select(nearUnit.id === selected.id ? null : nearUnit.id);
          return;
        }
        if (D.legalTargets(state, selected).includes(nearUnit)) {
          pendingMove = null;
          perform({ type: 'attack', unitId: selected.id, targetId: nearUnit.id });
          return;
        }
      }
    }

    const clicked = unit || (touch ? nearUnit : null);
    pendingMove = null;
    if (clicked && clicked.player === state.currentPlayer) {
      select(clicked.id);
      return;
    }
    if (clicked) {
      message = describeUnit(clicked);
    } else {
      message = selected ? 'Out of reach. Tap or click inside the green area.' : 'Select one of your ships.';
    }
    select(null);
  }

  function select(unitId) {
    const unit = unitId ? D.getUnit(state, unitId) : null;
    selectedId = unit && unit.player === state.currentPlayer ? unit.id : null;
    pendingMove = null;
    if (selectedId) {
      const label = D.UNIT_TYPES[unit.type].label;
      if (!D.canActivate(state, unit)) {
        message = `No orders left this turn; the ${label} must wait.`;
      } else {
        const canMove = D.legalMoves(state, unit).length > 0;
        const targets = D.legalTargets(state, unit).length;
        const fireHint = D.canFireDoomstar(state, unit) ? ' In the Doomstar with full charge: press Fire Doomstar!' : '';
        message = `${label}: ${canMove ? 'tap or click inside the green area to move' : 'no moves left'}; ${targets} target${targets === 1 ? '' : 's'} in range.${fireHint}`;
      }
    }
    render();
  }

  function describeUnit(unit) {
    const label = D.UNIT_TYPES[unit.type].label;
    return `${D.PLAYER_NAMES[unit.player]} ${label}: HP ${unit.hp}/${unit.maxHp}, move ${unit.move}, range ${unit.range}, damage ${unit.damage}. ${Board.abilityText(state.rules, unit.type)}`;
  }

  // Local (hot-seat / bot) actions apply straight to `state`. Online actions go through the
  // session instead: the host applies and broadcasts, the guest only ever sends and waits for the
  // host's next state message (see onSessionUpdate).
  function perform(action) {
    if (session) {
      const result = session.perform(action);
      if (result && !result.ok) {
        message = result.error;
        render();
      }
      return;
    }

    const result = D.applyAction(state, action);
    if (!result.ok) {
      message = result.error;
      render();
      return;
    }
    events = result.events;
    message = events.map(D.describeEvent).filter(Boolean).join(' ');
    clearStaleSelection();
    render();

    if (isBotTurn()) {
      clearTimeout(botTimer);
      botTimer = setTimeout(playBotAction, BOT_DELAY_MS);
    }
  }

  function clearStaleSelection() {
    const selected = selectedId ? D.getUnit(state, selectedId) : null;
    if (!selected || (!D.legalMoves(state, selected).length && !D.legalTargets(state, selected).length
      && !D.canFireDoomstar(state, selected))) {
      selectedId = null;
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
      preview: pendingMove,
      onBoardClick: handleBoardClick,
    });
    Board.renderTurnBanner(el.turnBanner, state, turnSuffix());
    el.status.innerHTML = `<div class="status-message">${message}</div>`;
    el.scoreboard.innerHTML = Board.scoreboardHtml(state);
    el.roster.innerHTML = rosterHtml();
    el.rulesList.innerHTML = Board.describeRules(state.rules).map((line) => `<li>${line}</li>`).join('');
    renderBanner();
    renderOnlinePanel();
    el.endTurn.disabled = isInputLocked();
    el.fire.disabled = isInputLocked() || !D.canFireDoomstar(state, selected);
    el.newGame.disabled = Boolean(session);
    el.opponent.disabled = Boolean(session);
  }

  function turnSuffix() {
    if (session) return state.currentPlayer === session.seat ? ' (you)' : ' (opponent)';
    if (isBotTurn()) return ' (bot)';
    return '';
  }

  function renderBanner() {
    el.banner.hidden = !state.winner;
    if (!state.winner) return;
    el.banner.innerHTML = Board.winnerBannerHtml(state) + (session ? rematchButtonHtml() : '');
    if (session) {
      const btn = el.banner.querySelector('#rematchBtn');
      if (btn) btn.addEventListener('click', () => session.setRematchReady(true));
    }
  }

  function rematchButtonHtml() {
    const mine = sessionRole === 'host' ? rematchReady.host : rematchReady.guest;
    const theirs = sessionRole === 'host' ? rematchReady.guest : rematchReady.host;
    const label = mine ? (theirs ? 'Starting rematch…' : 'Waiting for opponent…') : 'Rematch';
    return `<button id="rematchBtn" class="primary"${mine ? ' disabled' : ''}>${label}</button>`;
  }

  function rosterHtml() {
    const player = session ? session.seat : (bot ? 'p1' : state.currentPlayer);
    return state.units
      .filter((u) => u.player === player)
      .map((u) => {
        const label = D.UNIT_TYPES[u.type].label;
        return `
          <div class="unit-card${u.id === selectedId ? ' selected' : ''}" data-unit="${u.id}">
            <div class="info">
              <div class="unit-heading">
                ${Board.unitIcon(u.type, player)}
                <span class="unit-small">${label}</span>
              </div>
              <span class="unit-meta">HP ${u.hp}/${u.maxHp} • Damage ${u.damage} • Range ${u.range} • Move ${u.move}</span>
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

  // ---------------------------------------------------------------------------
  // Online play

  function onlineErrorText(code) {
    switch (code) {
      case 'room-full': return 'That room already has two players.';
      case 'room-not-found': return "That room code wasn't found. Check it and try again.";
      case 'version-mismatch': return 'You and your opponent are on different versions -- refresh the page.';
      case 'unavailable-id': return 'Could not reopen your room. It may still be closing; try again shortly.';
      case 'disconnected': return 'Lost the connection to the signaling server.';
      default: return 'Something went wrong connecting online.';
    }
  }

  function endOnlineSession() {
    if (session && session.destroy) session.destroy();
    if (netHandle && netHandle.destroy) netHandle.destroy();
    session = null;
    netHandle = null;
    sessionRole = null;
    roomCode = null;
    onlineConnected = false;
    onlineDisconnected = false;
    onlineError = null;
    chat = [];
    rematchReady = { host: false, guest: false };
    pendingMove = null;
  }

  function leaveOnlineGame() {
    endOnlineSession();
    clearOnlineSession();
    history.replaceState(null, '', location.pathname);
    newMatch();
  }

  function onSessionUpdate(view) {
    state = view.state;
    chat = view.chat || [];
    if (view.rematchReady) rematchReady = view.rematchReady;
    onlineConnected = Boolean(view.connected);
    onlineDisconnected = Boolean(view.disconnected);
    onlineError = view.rejectedReason || (view.versionMismatch ? 'version-mismatch' : onlineError);
    const newEvents = view.events || [];
    if (newEvents.length) {
      events = newEvents;
      message = newEvents.map(D.describeEvent).filter(Boolean).join(' ') || message;
    }
    pendingMove = null;
    clearStaleSelection();
    saveOnlineSession();
    render();
  }

  function startHost(saved) {
    endOnlineSession();
    clearTimeout(botTimer);
    bot = null;
    if (!state) state = D.createGame('doomstar'); // a placeholder to render while the room opens
    sessionRole = 'host';
    roomCode = saved ? saved.code : Net.makeRoomCode();
    message = saved ? 'Resuming your hosted game…' : 'Opening your room…';
    render();

    netHandle = Net.hostRoom({
      code: roomCode,
      onStatus: (status) => {
        if (status.state === 'error') {
          onlineError = status.error;
          render();
        } else if (status.state === 'retrying') {
          onlineError = null;
          render();
        } else if (status.state === 'waiting') {
          onlineError = null;
          render();
        }
      },
      onConnection: () => {
        onlineConnected = true;
      },
    });
    session = Online.createHost({
      transport: netHandle.transport,
      rules: 'doomstar',
      resume: saved ? saved.data : null,
      onUpdate: onSessionUpdate,
    });
    state = session.state;
    selectedId = null;
    pendingMove = null;
    events = [];
    render();
  }

  function startJoin(code, saved) {
    endOnlineSession();
    clearTimeout(botTimer);
    bot = null;
    sessionRole = 'guest';
    roomCode = code;
    onlineDisconnected = Boolean(saved);
    if (saved) {
      state = D.deserializeState(saved.data.snapshot);
      chat = saved.data.chat || [];
    } else if (!state) {
      state = D.createGame('doomstar'); // a placeholder to render while the connection opens
    }
    message = saved ? 'Reconnecting…' : 'Connecting…';
    render();

    netHandle = Net.joinRoom({
      code,
      onStatus: (status) => {
        if (status.state === 'connecting') {
          session = Online.createGuest({
            transport: status.transport,
            resume: saved ? saved.data : null,
            onUpdate: onSessionUpdate,
          });
        } else if (status.state === 'error') {
          onlineError = status.error;
          render();
        }
      },
    });
  }

  function inviteLink() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('join', roomCode);
    return url.toString();
  }

  async function shareInviteLink() {
    const link = inviteLink();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Doomstar', text: 'Join my Doomstar match', url: link });
        return;
      } catch (error) {
        // Cancelled or unsupported; fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      const original = el.copyLink.textContent;
      el.copyLink.textContent = 'Copied!';
      setTimeout(() => { el.copyLink.textContent = original; }, 1500);
    } catch (error) {
      el.inviteLink.select();
    }
  }

  function renderOnlinePanel() {
    el.onlineSetup.hidden = Boolean(session);
    el.onlineConnected.hidden = !session;
    if (!session) return;

    const hosting = sessionRole === 'host';
    el.inviteField.hidden = !hosting;
    if (hosting) {
      el.inviteLink.value = inviteLink();
      el.roomCodeText.textContent = roomCode;
    }
    el.seatLabel.textContent = `You are ${D.PLAYER_NAMES[session.seat]}`;

    let status;
    if (onlineError) status = onlineErrorText(onlineError);
    else if (onlineDisconnected) status = 'Opponent disconnected. Waiting to reconnect…';
    else if (!onlineConnected) status = hosting ? 'Waiting for an opponent to join…' : 'Connecting…';
    else status = 'Connected.';
    el.onlineStatus.textContent = status;

    renderChat();
  }

  // Built with textContent, never innerHTML: chat text comes from the other player.
  function renderChat() {
    el.chatLog.innerHTML = '';
    for (const entry of chat) {
      const li = document.createElement('li');
      const mine = session && entry.from === session.seat;
      li.className = mine ? 'me' : 'them';
      const who = document.createElement('span');
      who.className = 'chat-from';
      who.textContent = mine ? 'You: ' : 'Opponent: ';
      li.appendChild(who);
      li.appendChild(document.createTextNode(entry.text));
      el.chatLog.appendChild(li);
    }
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  function saveOnlineSession() {
    if (!session) return;
    const data = session.snapshotForResume();
    if (!data) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: sessionRole, code: roomCode, data }));
    } catch (error) {
      // Private browsing, quota exceeded, etc: rejoin-after-refresh just won't work this time.
    }
  }

  function loadOnlineSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function clearOnlineSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Nothing to do.
    }
  }

  setup();
})();
