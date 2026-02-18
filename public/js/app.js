import { HomeScreen } from './screens/home.js';
import { WaitingScreen } from './screens/waiting.js';
import { GameScreen } from './screens/game.js';
import { ResultScreen } from './screens/result.js';
import { showToast } from './lib/toast.js';
import { promptModal } from './lib/modal.js';
import { vibrate } from './lib/haptics.js';
import { buttonClick } from './lib/sounds.js';

// -- WebSocket Manager --
class WS {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${proto}//${location.host}`);

      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };

      this.ws.onerror = (e) => {
        this.connected = false;
        reject(e);
      };

      this.ws.onclose = () => {
        this.connected = false;
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this._dispatch(msg);
      };
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }

  offAll() {
    this.listeners.clear();
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  _dispatch(msg) {
    const type = msg.type;
    const set = this.listeners.get(type);
    if (set) {
      for (const fn of set) fn(msg);
    }
    // Also dispatch to wildcard listeners
    const wild = this.listeners.get('*');
    if (wild) {
      for (const fn of wild) fn(msg);
    }
  }
}

// -- Screen Manager --
class ScreenManager {
  constructor(container) {
    this.container = container;
    this.currentScreen = null;
    this.ws = new WS();
  }

  show(ScreenClass, props = {}) {
    const oldScreen = this.currentScreen;

    // Create new screen first (DUEL.ME pattern)
    const screen = new ScreenClass(this, props);
    this.currentScreen = screen;

    const el = screen.render();
    el.classList.add('screen');
    this.container.appendChild(el);

    // Destroy old screen after animation
    if (oldScreen && oldScreen.el) {
      oldScreen.el.classList.add('screen-exit');
      setTimeout(() => {
        oldScreen.destroy();
        if (oldScreen.el && oldScreen.el.parentNode) {
          oldScreen.el.parentNode.removeChild(oldScreen.el);
        }
      }, 250);
    }
  }

  getPlayerName() {
    return localStorage.getItem('ga_name') || '';
  }

  setPlayerName(name) {
    localStorage.setItem('ga_name', name);
  }
}

// -- Init --
const app = document.getElementById('app');
const manager = new ScreenManager(app);

// Delegated button click haptic + sound
app.addEventListener('click', (e) => {
  if (e.target.closest('.btn')) {
    vibrate('tap');
    buttonClick();
  }
}, true);

// Check for ?code= in URL -> auto-join
const urlParams = new URLSearchParams(location.search);
const inviteCode = urlParams.get('code');

if (inviteCode && inviteCode.length === 4) {
  // Clean the URL without reloading
  history.replaceState(null, '', location.pathname);

  // Show home first, then auto-join
  manager.show(HomeScreen);

  (async () => {
    let name = manager.getPlayerName();
    if (!name) {
      name = await promptModal('\u05D4\u05E9\u05DD \u05E9\u05DC\u05DA:');
      if (!name || !name.trim()) {
        return; // User cancelled -- stay on home
      }
      name = name.trim().slice(0, 15);
      manager.setPlayerName(name);
    }

    try {
      await manager.ws.connect();

      const unsubErr = manager.ws.on('error', (msg) => {
        unsubErr();
        unsubJoin();
        showToast(msg.msg, 'error');
      });

      const unsubJoin = manager.ws.on('joined', (msg) => {
        unsubErr();
        unsubJoin();
        manager.show(WaitingScreen, {
          code: msg.code,
          gameType: msg.gameType,
          seat: msg.seat,
          name,
          joined: true,
          bet: msg.bet,
          creatorName: msg.creatorName,
        });
      });

      manager.ws.send({ type: 'join', code: inviteCode.toUpperCase(), name });
    } catch (e) {
      showToast('\u05E9\u05D2\u05D9\u05D0\u05EA \u05D7\u05D9\u05D1\u05D5\u05E8', 'error');
    }
  })();
} else {
  manager.show(HomeScreen);
}
