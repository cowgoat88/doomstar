/*
 * Tests for online.js using an in-memory loopback transport (no real networking). Shares the
 * harness in tests/test-harness.js with tests/engine-tests.js.
 */
(function () {
  'use strict';

  const D = window.Doomstar;
  const Online = window.DoomstarOnline;
  const { test, assert, equal } = window.TestHarness;

  // Two stable transport handles wired to each other. `open()`/`disconnect()` simulate the
  // connection dropping and coming back without replacing the transport objects online.js holds,
  // which matches how net.js will wrap a single PeerJS DataConnection (or a fresh one on rejoin).
  function makeLoopback() {
    let open = false;
    const handlers = {
      host: { message: null, open: null, close: null },
      guest: { message: null, open: null, close: null },
    };
    const send = (from, message) => {
      if (!open) return;
      const to = from === 'host' ? 'guest' : 'host';
      if (handlers[to].message) handlers[to].message(JSON.parse(JSON.stringify(message)));
    };
    const makeTransport = (side) => ({
      send: (message) => send(side, message),
      onMessage: (fn) => { handlers[side].message = fn; },
      onOpen: (fn) => { handlers[side].open = fn; },
      onClose: (fn) => { handlers[side].close = fn; },
      isOpen: () => open,
    });
    return {
      hostTransport: makeTransport('host'),
      guestTransport: makeTransport('guest'),
      connect() {
        open = true;
        if (handlers.host.open) handlers.host.open();
        if (handlers.guest.open) handlers.guest.open();
      },
      disconnect() {
        open = false;
        if (handlers.host.close) handlers.host.close();
        if (handlers.guest.close) handlers.guest.close();
      },
      // Injects a raw message as if it came from an impostor client, bypassing a guest wrapper.
      sendRawToHost(message) {
        if (handlers.host.message) handlers.host.message(message);
      },
    };
  }

  function serialized(state) {
    return JSON.stringify(D.serializeState(state));
  }

  test('A full bot game stays in sync through the protocol and finishes', () => {
    const hub = makeLoopback();
    let hostView = null;
    let guestView = null;
    const host = Online.createHost({ transport: hub.hostTransport, rules: 'doomstar', onUpdate: (v) => { hostView = v; } });
    const guest = Online.createGuest({ transport: hub.guestTransport, onUpdate: (v) => { guestView = v; } });
    hub.connect();

    assert(hostView && hostView.connected, 'Host sees the guest connect');
    assert(guest.seat === 'p2', 'The first guest gets seat p2');
    assert(serialized(host.state) === serialized(guest.state), 'Guest snapshot matches host state after welcome');

    const hostBot = D.AI.createBot({ seed: 11 });
    const guestBot = D.AI.createBot({ seed: 11 });
    let steps = 0;
    while (!host.state.winner) {
      steps += 1;
      assert(steps < 20000, 'Match should finish well before this many steps');
      if (host.state.currentPlayer === 'p1') {
        const action = hostBot.nextAction(host.state);
        const result = host.perform(action);
        assert(result.ok, `Host bot action should be legal: ${result.error || ''} ${JSON.stringify(action)}`);
      } else {
        const action = guestBot.nextAction(guest.state);
        guest.perform(action);
      }
      assert(serialized(host.state) === serialized(guest.state), `Guest snapshot matches host state at step ${steps}`);
    }
    assert(guest.state.winner, 'The guest also sees the match end');
    assert(guestView.events, 'onUpdate carries events for animation');
  });

  test('Illegal and out-of-turn guest actions are rejected without changing state', () => {
    const hub = makeLoopback();
    const host = Online.createHost({ transport: hub.hostTransport });
    const guest = Online.createGuest({ transport: hub.guestTransport });
    hub.connect();

    const before = serialized(host.state);
    guest.perform({ type: 'endTurn' }); // it's p1's turn, not the guest's (p2)
    assert(serialized(host.state) === before, 'Out-of-turn endTurn changes nothing');
    assert(serialized(guest.state) === before, 'Guest state is untouched by its own rejected action');

    const p2Unit = host.state.units.find((u) => u.player === 'p2' && u.type !== 'command');
    guest.perform({ type: 'move', unitId: p2Unit.id, x: -5, y: -5 }); // out of bounds, and also not p2's turn yet
    assert(serialized(host.state) === before, 'Illegal move changes nothing');
  });

  test('Disconnect then rejoin with the saved token restores the same seat and state', () => {
    const hub = makeLoopback();
    const host = Online.createHost({ transport: hub.hostTransport });
    const guest = Online.createGuest({ transport: hub.guestTransport });
    hub.connect();

    const p2Unit = host.state.units.find((u) => u.player === 'p1' && u.type === 'scout');
    host.perform({ type: 'move', unitId: p2Unit.id, x: p2Unit.x, y: p2Unit.y }); // no-op-ish but exercises perform
    const savedState = serialized(host.state);
    const savedResume = guest.snapshotForResume();
    assert(savedResume && savedResume.token, 'Guest can save its seat and token');

    hub.disconnect();
    assert(host.state !== undefined, 'Host keeps its state across a disconnect');

    let guestView = null;
    const guest2 = Online.createGuest({ transport: hub.guestTransport, resume: savedResume, onUpdate: (v) => { guestView = v; } });
    hub.connect();

    equal(guest2.seat, 'p2', 'Rejoining guest keeps its seat');
    assert(serialized(guest2.state) === savedState, 'Rejoining guest is caught up to the current state');
    assert(guestView.connected, 'Rejoining guest is marked connected again');
  });

  test('A rejoin attempt with the wrong token is refused while the real guest is connected', () => {
    const hub = makeLoopback();
    Online.createHost({ transport: hub.hostTransport });
    const guest = Online.createGuest({ transport: hub.guestTransport });
    hub.connect();
    assert(guest.token, 'The real guest has a token');

    // Swap in a plain listener so the host's reply to an impostor hello can be read directly,
    // instead of routing it through the real guest's session logic.
    const impostorMessages = [];
    hub.guestTransport.onMessage((m) => impostorMessages.push(m));
    hub.sendRawToHost({ v: Online.PROTOCOL_VERSION, type: 'hello', resumeToken: 'not-the-real-token' });

    const rejected = impostorMessages.find((m) => m.type === 'reject');
    assert(rejected && rejected.error === 'room-full', 'A mismatched token while connected is refused as room-full');
  });

  test('Rematch swaps seats once both sides are ready', () => {
    const hub = makeLoopback();
    let guestView = null;
    const host = Online.createHost({ transport: hub.hostTransport });
    const guest = Online.createGuest({ transport: hub.guestTransport, onUpdate: (v) => { guestView = v; } });
    hub.connect();

    const firstHostSeat = host.seat;
    const firstGuestSeat = guest.seat;
    host.setRematchReady(true);
    assert(host.state.winner === null, 'A rematch request before both are ready does not restart the game yet');
    guest.setRematchReady(true);

    assert(serialized(host.state) === serialized(guest.state), 'Guest matches host after the rematch starts');
    equal(host.seat, firstGuestSeat, 'Host takes over the seat the guest had');
    equal(guest.seat, firstHostSeat, 'Guest takes over the seat the host had');
    equal(host.state.turn, 1, 'The rematch is a fresh game');
    assert(guestView, 'The guest was notified of the rematch');
  });

  test('Chat is relayed between host and guest and kept to the last 50 lines', () => {
    const hub = makeLoopback();
    const host = Online.createHost({ transport: hub.hostTransport });
    const guest = Online.createGuest({ transport: hub.guestTransport });
    hub.connect();

    guest.sendChat('hi from the guest');
    host.sendChat('hi from the host');
    assert(host.chat.some((c) => c.text === 'hi from the guest' && c.from === 'p2'), 'Host recorded the guest chat');
    assert(guest.chat.some((c) => c.text === 'hi from the host' && c.from === 'p1'), 'Guest received the host chat');

    for (let i = 0; i < 60; i += 1) host.sendChat(`line ${i}`);
    assert(host.chat.length <= Online.CHAT_LIMIT, 'Host chat history is capped');
    assert(guest.chat.length <= Online.CHAT_LIMIT, 'Guest chat history is capped');

    const long = 'x'.repeat(500);
    guest.sendChat(long);
    const received = host.chat[host.chat.length - 1];
    assert(received.text.length <= Online.CHAT_MAX_CHARS, 'Overlong chat messages are clamped');
  });
})();
