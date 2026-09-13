/*
 * PeerJS transport for online.js. Wraps a PeerJS DataConnection as the
 * { send, onMessage, onOpen, onClose, isOpen } interface online.js expects, using only the free
 * public PeerJS signaling server and Google's free STUN servers -- no accounts, no servers to run.
 * Requires vendor/peerjs.min.js (defines window.Peer); exposes `window.DoomstarNet`.
 */
(function (root) {
  'use strict';

  const ROOM_PREFIX = 'doomstar-';
  const ROOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/i, easier to read aloud or retype
  const STUN_CONFIG = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
  const UNAVAILABLE_RETRY_MS = 5000;
  const UNAVAILABLE_RETRY_LIMIT_MS = 60000;

  function makeRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    return code;
  }

  // Wraps a single PeerJS DataConnection. `swapConnection` lets the host point the same transport
  // object at a fresh DataConnection when a guest reconnects, without online.js knowing anything changed.
  function wrapConnection(initialConn) {
    let conn = null;
    const handlers = { message: null, open: null, close: null };
    let queued = [];
    let opened = false;

    function wire(c) {
      conn = c;
      opened = false;
      conn.on('open', () => {
        opened = true;
        for (const message of queued) conn.send(message);
        queued = [];
        if (handlers.open) handlers.open();
      });
      conn.on('data', (data) => {
        if (handlers.message) handlers.message(data);
      });
      conn.on('close', () => {
        opened = false;
        if (handlers.close) handlers.close();
      });
      conn.on('error', () => {
        opened = false;
        if (handlers.close) handlers.close();
      });
    }

    if (initialConn) wire(initialConn);

    return {
      send(message) {
        if (opened && conn) conn.send(message);
        else queued.push(message);
      },
      onMessage(fn) {
        handlers.message = fn;
      },
      onOpen(fn) {
        handlers.open = fn;
      },
      onClose(fn) {
        handlers.close = fn;
      },
      isOpen() {
        return opened;
      },
      // Host-only: point this same transport at a newly accepted connection (a guest reconnecting).
      swapConnection(nextConn) {
        if (conn) conn.removeAllListeners();
        queued = [];
        wire(nextConn);
      },
    };
  }

  // Hosts a room: registers a PeerJS peer under a room code and waits for one guest to connect.
  // onStatus receives { state: 'waiting' | 'connected' | 'error', code, error }.
  function hostRoom({ code = makeRoomCode(), onStatus = () => {}, onConnection = () => {} } = {}) {
    const transport = wrapConnection(null);
    let peer = null;
    let destroyed = false;
    let retryBudget = UNAVAILABLE_RETRY_LIMIT_MS;

    function open() {
      peer = new root.Peer(ROOM_PREFIX + code, { config: STUN_CONFIG });
      peer.on('open', () => {
        onStatus({ state: 'waiting', code });
      });
      peer.on('connection', (conn) => {
        transport.swapConnection(conn);
        onConnection();
        onStatus({ state: 'connected', code });
      });
      peer.on('disconnected', () => {
        if (!destroyed && peer) peer.reconnect();
      });
      peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id') {
          // Rejoining the same room after a refresh: the old id may take up to ~60s to free up.
          try { peer.destroy(); } catch (destroyError) { /* already gone */ }
          if (retryBudget > 0) {
            retryBudget -= UNAVAILABLE_RETRY_MS;
            onStatus({ state: 'retrying', code });
            setTimeout(() => {
              if (!destroyed) open();
            }, UNAVAILABLE_RETRY_MS);
          } else {
            onStatus({ state: 'error', code, error: 'unavailable-id' });
          }
          return;
        }
        onStatus({ state: 'error', code, error: (err && err.type) || 'unknown' });
      });
    }

    open();

    return {
      code,
      transport,
      destroy() {
        destroyed = true;
        if (peer) peer.destroy();
      },
    };
  }

  // Joins a room by code. onStatus receives { state: 'connecting' | 'connected' | 'error', error }.
  function joinRoom({ code, onStatus = () => {} } = {}) {
    const cleanCode = String(code || '').trim().toLowerCase().replace(/^doomstar-/, '');
    let transport = null;
    let peer = null;
    let destroyed = false;

    peer = new root.Peer(undefined, { config: STUN_CONFIG });
    peer.on('open', () => {
      const conn = peer.connect(ROOM_PREFIX + cleanCode, { reliable: true });
      transport = wrapConnection(conn);
      transport.onOpen(() => onStatus({ state: 'connected' }));
      transport.onClose(() => {
        if (!destroyed) onStatus({ state: 'error', error: 'disconnected' });
      });
      onStatus({ state: 'connecting', transport });
    });
    peer.on('disconnected', () => {
      if (!destroyed && peer) peer.reconnect();
    });
    peer.on('error', (err) => {
      const type = (err && err.type) || 'unknown';
      onStatus({ state: 'error', error: type === 'peer-unavailable' ? 'room-not-found' : type });
    });

    return {
      get transport() {
        return transport;
      },
      destroy() {
        destroyed = true;
        if (peer) peer.destroy();
      },
    };
  }

  root.DoomstarNet = { ROOM_PREFIX, makeRoomCode, hostRoom, joinRoom };
})(typeof window !== 'undefined' ? window : globalThis);
