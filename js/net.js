// PeerJS room transport. The host owns the duel state; the guest sends actions.
const PREFIX = 'aurora-duel-v2-';

export class Net {
  constructor(opts = {}) {
    this.opts = opts;
    this.peer = null;
    this.conn = null;
    this.roomCode = '';
    this.isHost = false;
    this.guestName = '';
    this.destroyed = false;
    this.retried = false;
    this.openTimer = null;
    this.heartbeat = null;
    this.lastSeen = 0;
  }

  _touch() {
    this.lastSeen = Date.now();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._touch();
    this.heartbeat = setInterval(() => {
      if (this.destroyed) { this._stopHeartbeat(); return; }
      const conn = this.conn;
      if (!conn || !conn.open) return;
      if (Date.now() - this.lastSeen > 9000) {
        this._connectionLost();
        return;
      }
      try { conn.send({ t: 'ping' }); } catch {}
    }, 3000);
  }

  _stopHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  _connectionLost() {
    if (this.destroyed) return;
    this._stopHeartbeat();
    const conn = this.conn;
    this.conn = null;
    try { conn?.close(); } catch {}
    if (this.isHost) {
      this.guestName = '';
      this.status('online');
      this.opts.onGuestLeft?.();
    } else {
      this.status('guest-left');
      this.opts.onGuestLeft?.();
    }
  }

  status(state, detail = '') {
    this.opts.onStatus?.(state, detail);
  }

  startHost(code) {
    this.isHost = true;
    this.roomCode = code;
    this._startHost(code);
  }

  _startHost(code) {
    this._destroyPeer();
    if (!window.Peer) {
      this.status('offline', 'PeerJSが読み込まれていません');
      return;
    }
    this.status('connecting');
    let peer;
    try {
      peer = new window.Peer(PREFIX + code, { debug: 0 });
    } catch (e) {
      this.status('offline', e.message);
      return;
    }
    this.peer = peer;
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (this.peer === peer && !peer.open) this.status('offline', 'シグナリングに接続できません');
    }, 9000);

    peer.on('open', () => {
      if (this.destroyed) return;
      clearTimeout(this.openTimer);
      this.status('online');
    });

    peer.on('connection', (conn) => {
      if (this.destroyed) { try { conn.close(); } catch {} return; }
      if (this.conn && this.conn.open) {
        try { conn.send({ t: 'full' }); } catch {}
        setTimeout(() => { try { conn.close(); } catch {} }, 250);
        return;
      }
      this.conn = conn;
      this._wireHost(conn);
    });

    peer.on('disconnected', () => {
      if (this.destroyed) return;
      this.status('reconnecting');
      setTimeout(() => { try { peer.reconnect(); } catch {} }, 800);
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      const type = err?.type || '';
      if (type === 'unavailable-id' && !this.retried) {
        this.retried = true;
        const next = randomCode();
        this.roomCode = next;
        this.opts.onRoomCode?.(next);
        this.status('connecting', 'ルームIDを再生成');
        setTimeout(() => this._startHost(next), 350);
        return;
      }
      if (type === 'peer-unavailable') {
        this.status('notfound', 'ホストが見つかりません');
      } else {
        this.status('offline', err?.message || type || '接続エラー');
      }
    });
  }

  startGuest(code, name = 'ゲスト') {
    this.isHost = false;
    this.roomCode = code;
    this.guestName = name;
    this._destroyPeer();
    if (!window.Peer) {
      this.status('offline', 'PeerJSが読み込まれていません');
      this.opts.onGuestFailed?.('オンライン機能を読み込めませんでした');
      return;
    }
    this.status('joining');
    let peer;
    try {
      peer = new window.Peer({ debug: 0 });
    } catch (e) {
      this.status('offline', e.message);
      this.opts.onGuestFailed?.(e.message);
      return;
    }
    this.peer = peer;
    let opened = false;
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (!opened) {
        this.status('notfound', '接続がタイムアウトしました');
        this.opts.onGuestFailed?.('ルームに接続できませんでした。コードを確認してください。');
      }
    }, 12000);

    peer.on('open', () => {
      opened = true;
      clearTimeout(this.openTimer);
      let conn;
      try {
        conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      } catch (e) {
        this.status('offline', e.message);
        this.opts.onGuestFailed?.(e.message);
        return;
      }
      this.conn = conn;
      this._wireGuest(conn);
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      const type = err?.type || '';
      if (type === 'peer-unavailable') {
        this.status('notfound', 'ルームが見つかりません');
        this.opts.onGuestFailed?.('そのルームは見つかりませんでした。ホストが退出した可能性があります。');
      } else {
        this.status('offline', err?.message || type || '接続エラー');
        this.opts.onGuestFailed?.(err?.message || '接続エラー');
      }
    });
  }

  _wireHost(conn) {
    let greeted = false;
    conn.on('open', () => {
      this._startHeartbeat();
      this.status('guest-connected');
    });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      this._touch();
      if (msg.t === 'ping') { try { conn.send({ t: 'pong' }); } catch {} return; }
      if (msg.t === 'pong') return;
      if (msg.t === 'hello' && !greeted) {
        greeted = true;
        this.guestName = String(msg.name || 'ゲスト').slice(0, 14);
        this.status('guest-connected', this.guestName);
        this.opts.onGuestJoined?.(this.guestName);
      } else if (msg.t === 'action') {
        this.opts.onAction?.(msg.action);
      } else if (msg.t === 'rematch') {
        this.opts.onRematch?.();
      }
    });
    conn.on('close', () => {
      this._stopHeartbeat();
      if (this.conn === conn) {
        this.conn = null;
        this.guestName = '';
        this.status('online');
        this.opts.onGuestLeft?.();
      }
    });
    conn.on('error', () => {});
  }

  _wireGuest(conn) {
    conn.on('open', () => {
      this._startHeartbeat();
      this.status('joining');
      try { conn.send({ t: 'hello', name: this.guestName }); } catch {}
    });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      this._touch();
      if (msg.t === 'ping') { try { conn.send({ t: 'pong' }); } catch {} return; }
      if (msg.t === 'pong') return;
      if (msg.t === 'welcome') {
        clearTimeout(this.openTimer);
        this.status('guest');
        this.opts.onWelcome?.(msg.state, msg.you ?? 1, msg.hostName || 'ホスト');
      } else if (msg.t === 'state') {
        this.opts.onState?.(msg.state, msg.events || []);
      } else if (msg.t === 'full') {
        this.status('notfound', '満員');
        this.opts.onGuestFailed?.('このルームは満員です。');
      } else if (msg.t === 'notice') {
        this.opts.onNotice?.(msg.message || '');
      }
    });
    conn.on('close', () => {
      this._stopHeartbeat();
      if (this.conn === conn) {
        this.conn = null;
        this.status('guest-left');
        this.opts.onGuestLeft?.();
      }
    });
    conn.on('error', () => {});
  }

  sendAction(action) {
    if (!this.conn || !this.conn.open) return false;
    try { this.conn.send({ t: 'action', action }); return true; } catch { return false; }
  }

  requestRematch() {
    if (!this.conn || !this.conn.open) return false;
    try { this.conn.send({ t: 'rematch' }); return true; } catch { return false; }
  }

  sendNotice(message) {
    if (!this.conn || !this.conn.open) return false;
    try { this.conn.send({ t: 'notice', message }); return true; } catch { return false; }
  }

  sendState(state, events = [], welcome = false) {
    if (!this.conn || !this.conn.open) return false;
    try {
      this.conn.send(welcome
        ? { t: 'welcome', state, events, you: 1, hostName: state.players[0]?.name || 'ホスト' }
        : { t: 'state', state, events });
      return true;
    } catch { return false; }
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }

  _destroyPeer() {
    clearTimeout(this.openTimer);
    this._stopHeartbeat();
    if (this.conn) { try { this.conn.close(); } catch {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch {} this.peer = null; }
  }

  destroy() {
    this.destroyed = true;
    this._destroyPeer();
  }
}

export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(6);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += alphabet[(arr[i] || Math.floor(Math.random() * 1e9)) % alphabet.length];
  return out;
}

export function roomLink(code) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}
