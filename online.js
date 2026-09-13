/*
 * Online session protocol for a 1v1 Doomstar match. Host-authoritative: the host's browser runs
 * `engine.js` and is the only copy of the truth; the guest only ever renders snapshots it is sent.
 * No DOM and no networking library here -- `transport` is injected as
 * { send(message), onMessage(fn), onOpen(fn), onClose(fn) } so this file can be unit tested with an
 * in-memory loopback (see tests/online-tests.js) and reused by net.js's real PeerJS transport.
 * Exposes `window.DoomstarOnline`.
 */
(function (root) {
  'use strict';

  const D = root.Doomstar;
  const PROTOCOL_VERSION = 1;
  const CHAT_LIMIT = 50;
  const CHAT_MAX_CHARS = 200;
  const PING_INTERVAL_MS = 5000;
  const PING_TIMEOUT_MS = 15000;

  const now = () => Date.now();

  function makeToken() {
    // Not a security boundary (there is no hidden information in this game); just enough that a
    // stranger can't casually reconnect into someone else's seat by guessing the room code.
    let token = '';
    for (let i = 0; i < 24; i += 1) token += Math.floor(Math.random() * 36).toString(36);
    return token;
  }

  function clampChat(text) {
    return String(text || '').slice(0, CHAT_MAX_CHARS);
  }

  // ---------------------------------------------------------------------------
  // Host: owns the authoritative state, accepts one guest connection.
  //
  // `resume` restores a host session across a page refresh: { snapshot, guestSeat, guestToken, chat }.
  // The snapshot comes from serializeState (e.g. saved to localStorage after every update).

  function createHost({ transport, rules = 'doomstar', onUpdate = () => {}, resume = null } = {}) {
    let state = resume ? D.deserializeState(resume.snapshot) : D.createGame(rules);
    let seq = 0;
    let hostSeat = (resume && resume.hostSeat) || 'p1';
    let guestSeat = (resume && resume.guestSeat) || 'p2';
    let guestToken = (resume && resume.guestToken) || null;
    let connected = false;
    let lastPongAt = now();
    const chat = (resume && resume.chat) ? resume.chat.slice() : [];
    const rematchReady = { host: false, guest: false };
    let disconnected = false;

    const view = () => ({
      role: 'host',
      seat: hostSeat,
      state,
      connected,
      disconnected,
      chat: chat.slice(),
      rematchReady: { ...rematchReady },
    });

    function emit(events) {
      onUpdate({ ...view(), events: events || [] });
    }

    function broadcastState(events) {
      seq += 1;
      // `seat` rides along on every update (not just welcome) so a rematch's seat swap reaches the
      // guest without a separate round trip.
      transport.send({ v: PROTOCOL_VERSION, type: 'state', snapshot: D.serializeState(state), seat: guestSeat, events: events || [], seq });
      emit(events);
    }

    function perform(action) {
      const result = D.applyActionAs(state, hostSeat, action);
      if (result.ok) broadcastState(result.events);
      return result;
    }

    function startRematch() {
      state = D.createGame(state.rules);
      [hostSeat, guestSeat] = [guestSeat, hostSeat];
      rematchReady.host = false;
      rematchReady.guest = false;
      seq = 0;
      broadcastState([]);
    }

    function handleMessage(message) {
      if (!message || message.v !== PROTOCOL_VERSION) {
        transport.send({ v: PROTOCOL_VERSION, type: 'reject', error: 'version-mismatch', seq });
        return;
      }
      if (message.type === 'hello') {
        const resuming = guestToken && message.resumeToken && message.resumeToken === guestToken;
        if (!resuming && connected) {
          transport.send({ v: PROTOCOL_VERSION, type: 'reject', error: 'room-full', seq });
          return;
        }
        if (!resuming) guestToken = makeToken();
        connected = true;
        disconnected = false;
        lastPongAt = now();
        transport.send({
          v: PROTOCOL_VERSION, type: 'welcome',
          seat: guestSeat, token: guestToken, snapshot: D.serializeState(state), seq, chat: chat.slice(),
        });
        emit([]);
      } else if (message.type === 'action') {
        const result = D.applyActionAs(state, guestSeat, message.action);
        if (result.ok) {
          broadcastState(result.events);
        } else {
          transport.send({ v: PROTOCOL_VERSION, type: 'reject', error: result.error, seq });
        }
      } else if (message.type === 'chat') {
        const entry = { from: guestSeat, text: clampChat(message.text), at: now() };
        chat.push(entry);
        if (chat.length > CHAT_LIMIT) chat.shift();
        transport.send({ v: PROTOCOL_VERSION, type: 'chat', entry });
        emit([]);
      } else if (message.type === 'rematch') {
        rematchReady.guest = Boolean(message.ready);
        if (rematchReady.host && rematchReady.guest) {
          startRematch();
        } else {
          transport.send({ v: PROTOCOL_VERSION, type: 'rematch', ready: rematchReady });
          emit([]);
        }
      } else if (message.type === 'pong') {
        lastPongAt = now();
        if (disconnected) {
          disconnected = false;
          emit([]);
        }
      }
    }

    transport.onMessage(handleMessage);
    transport.onOpen(() => {
      disconnected = false;
      lastPongAt = now();
    });
    transport.onClose(() => {
      connected = false;
      disconnected = true;
      emit([]);
    });

    const pingTimer = setInterval(() => {
      transport.send({ v: PROTOCOL_VERSION, type: 'ping' });
      if (connected && now() - lastPongAt > PING_TIMEOUT_MS && !disconnected) {
        disconnected = true;
        emit([]);
      }
    }, PING_INTERVAL_MS);

    function sendChat(text) {
      const entry = { from: hostSeat, text: clampChat(text), at: now() };
      chat.push(entry);
      if (chat.length > CHAT_LIMIT) chat.shift();
      transport.send({ v: PROTOCOL_VERSION, type: 'chat', entry });
      emit([]);
    }

    function setRematchReady(ready) {
      rematchReady.host = Boolean(ready);
      if (rematchReady.host && rematchReady.guest) {
        startRematch();
      } else {
        transport.send({ v: PROTOCOL_VERSION, type: 'rematch', ready: rematchReady });
        emit([]);
      }
    }

    return {
      get state() {
        return state;
      },
      get seat() {
        return hostSeat;
      },
      get chat() {
        return chat.slice();
      },
      get rematchReady() {
        return { ...rematchReady };
      },
      snapshotForResume() {
        return { snapshot: D.serializeState(state), hostSeat, guestSeat, guestToken, chat: chat.slice() };
      },
      perform,
      sendChat,
      setRematchReady,
      destroy() {
        clearInterval(pingTimer);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Guest: never mutates state itself, only renders whatever the host last sent.
  //
  // `resume` restores a guest session across a page refresh: { seat, token, snapshot, seq, chat }.
  // The guest shows this immediately, then sends hello with the token to pick up where it left off.

  function createGuest({ transport, name = '', onUpdate = () => {}, resume = null } = {}) {
    let state = resume ? D.deserializeState(resume.snapshot) : null;
    let seat = (resume && resume.seat) || null;
    let token = (resume && resume.token) || null;
    let seq = resume ? resume.seq : -1;
    let connected = false;
    let disconnected = Boolean(resume);
    let versionMismatch = false;
    let rejectedReason = null;
    let lastPongAt = now();
    const chat = (resume && resume.chat) ? resume.chat.slice() : [];
    const rematchReady = { host: false, guest: false };

    const view = () => ({
      role: 'guest',
      seat,
      state,
      connected,
      disconnected,
      versionMismatch,
      rejectedReason,
      chat: chat.slice(),
      rematchReady: { ...rematchReady },
    });

    function emit(events) {
      onUpdate({ ...view(), events: events || [] });
    }

    function sendHello() {
      transport.send({ v: PROTOCOL_VERSION, type: 'hello', name, resumeToken: token });
    }

    function handleMessage(message) {
      if (!message) return;
      if (message.v !== PROTOCOL_VERSION) {
        versionMismatch = true;
        emit([]);
        return;
      }
      if (message.type === 'welcome') {
        seat = message.seat;
        token = message.token;
        seq = message.seq;
        state = D.deserializeState(message.snapshot);
        chat.length = 0;
        chat.push(...(message.chat || []));
        connected = true;
        disconnected = false;
        rejectedReason = null;
        emit([]);
      } else if (message.type === 'state') {
        if (message.seq <= seq) return; // stale, already applied
        seq = message.seq;
        state = D.deserializeState(message.snapshot);
        if (message.seat) seat = message.seat; // carries a rematch's seat swap without a round trip
        connected = true;
        disconnected = false;
        emit(message.events || []);
      } else if (message.type === 'reject') {
        if (message.error === 'room-full' || message.error === 'version-mismatch') {
          rejectedReason = message.error;
          emit([]);
        }
        // Illegal/out-of-turn action rejections just leave the guest's current state as-is; the
        // host never applied them, so there is nothing to roll back.
      } else if (message.type === 'chat') {
        chat.push(message.entry);
        if (chat.length > CHAT_LIMIT) chat.shift();
        emit([]);
      } else if (message.type === 'rematch') {
        rematchReady.host = Boolean(message.ready && message.ready.host);
        rematchReady.guest = Boolean(message.ready && message.ready.guest);
        emit([]);
      } else if (message.type === 'ping') {
        transport.send({ v: PROTOCOL_VERSION, type: 'pong' });
        lastPongAt = now();
        if (disconnected) {
          disconnected = false;
          emit([]);
        }
      }
    }

    transport.onMessage(handleMessage);
    transport.onOpen(() => {
      disconnected = false;
      lastPongAt = now();
      sendHello();
    });
    transport.onClose(() => {
      connected = false;
      disconnected = true;
      emit([]);
    });

    const pingTimer = setInterval(() => {
      if (connected && now() - lastPongAt > PING_TIMEOUT_MS && !disconnected) {
        disconnected = true;
        emit([]);
      }
    }, PING_INTERVAL_MS);

    function perform(action) {
      transport.send({ v: PROTOCOL_VERSION, type: 'action', action });
    }

    function sendChat(text) {
      transport.send({ v: PROTOCOL_VERSION, type: 'chat', text: clampChat(text) });
    }

    function setRematchReady(ready) {
      rematchReady.guest = Boolean(ready);
      transport.send({ v: PROTOCOL_VERSION, type: 'rematch', ready });
    }

    return {
      get state() {
        return state;
      },
      get seat() {
        return seat;
      },
      get token() {
        return token;
      },
      get chat() {
        return chat.slice();
      },
      get rematchReady() {
        return { ...rematchReady };
      },
      snapshotForResume() {
        return state && seat ? { seat, token, snapshot: D.serializeState(state), seq, chat: chat.slice() } : null;
      },
      perform,
      sendChat,
      setRematchReady,
      destroy() {
        clearInterval(pingTimer);
      },
    };
  }

  root.DoomstarOnline = {
    PROTOCOL_VERSION,
    CHAT_LIMIT,
    CHAT_MAX_CHARS,
    createHost,
    createGuest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
