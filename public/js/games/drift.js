import { createScene, createCarMesh } from '../lib/three-setup.js';

// Module state
let _destroyed = false;
let _unsubs = [];
let _ctx = null;
let _sceneCtx = null; // { scene, camera, renderer, startLoop, dispose, THREE }

// 3D objects
let _myCar = null;
let _oppCar = null;
let _coinMeshes = []; // array of THREE.Mesh
let _arenaDisc = null;
let _edgeRing = null;

// HUD elements
let _myCoinsEl = null;
let _oppCoinsEl = null;
let _controlsEl = null;

// Game state from server
let _players = [];
let _coins = [];
let _elapsed = 0;
let _arenaRadius = 40;

// Input tracking
let _dragStartX = 0;
let _isDragging = false;
let _steerValue = 0;
let _steerInterval = null;

// Stun flash
let _myStunTimer = 0;
let _oppStunTimer = 0;
let _myOrigColor = 0x06B6D4;
let _oppOrigColor = 0xD946EF;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function buildArena(THREE, scene) {
  // Ground disc
  const discGeo = new THREE.CircleGeometry(_arenaRadius, 64);
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x111128,
    roughness: 0.9,
    metalness: 0.1,
  });
  _arenaDisc = new THREE.Mesh(discGeo, discMat);
  _arenaDisc.rotation.x = -Math.PI / 2;
  _arenaDisc.receiveShadow = true;
  scene.add(_arenaDisc);

  // Glowing edge ring
  const ringGeo = new THREE.TorusGeometry(_arenaRadius, 0.3, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x6366F1,
    emissive: 0x6366F1,
    emissiveIntensity: 0.8,
    roughness: 0.2,
  });
  _edgeRing = new THREE.Mesh(ringGeo, ringMat);
  _edgeRing.rotation.x = -Math.PI / 2;
  _edgeRing.position.y = 0.15;
  scene.add(_edgeRing);

  // Grid lines on the arena for visual texture
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a1a40, transparent: true, opacity: 0.4 });
  for (let i = -_arenaRadius + 5; i < _arenaRadius; i += 5) {
    // Horizontal lines
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-_arenaRadius, 0.01, i),
      new THREE.Vector3(_arenaRadius, 0.01, i),
    ]);
    scene.add(new THREE.Line(hGeo, gridMat));
    // Vertical lines
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i, 0.01, -_arenaRadius),
      new THREE.Vector3(i, 0.01, _arenaRadius),
    ]);
    scene.add(new THREE.Line(vGeo, gridMat));
  }
}

function createCoinMesh(THREE, x, y) {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xFFD700,
    emissive: 0xFFAA00,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.5, y);
  mesh.castShadow = true;
  return mesh;
}

function syncCoins(THREE, scene) {
  // Build a set of current coin positions as keys
  const newCoinKeys = new Set(_coins.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`));

  // Remove coins that no longer exist
  const toKeep = [];
  for (const cm of _coinMeshes) {
    const key = `${cm.userData.cx.toFixed(2)},${cm.userData.cy.toFixed(2)}`;
    if (newCoinKeys.has(key)) {
      toKeep.push(cm);
    } else {
      scene.remove(cm);
      cm.geometry.dispose();
      cm.material.dispose();
    }
  }

  // Build set of existing coin keys
  const existingKeys = new Set(toKeep.map(cm => `${cm.userData.cx.toFixed(2)},${cm.userData.cy.toFixed(2)}`));

  // Add new coins
  for (const c of _coins) {
    const key = `${c.x.toFixed(2)},${c.y.toFixed(2)}`;
    if (!existingKeys.has(key)) {
      const mesh = createCoinMesh(THREE, c.x, c.y);
      mesh.userData.cx = c.x;
      mesh.userData.cy = c.y;
      scene.add(mesh);
      toKeep.push(mesh);
    }
  }

  _coinMeshes = toKeep;
}

function updateCamera(camera) {
  if (!_players.length || !_ctx) return;
  const me = _players[_ctx.seat - 1];
  if (!me) return;

  const targetX = me.x - Math.sin(me.angle) * 15;
  const targetZ = me.y - Math.cos(me.angle) * 15;
  const targetY = 12;

  // Smooth follow
  camera.position.x += (targetX - camera.position.x) * 0.1;
  camera.position.y += (targetY - camera.position.y) * 0.1;
  camera.position.z += (targetZ - camera.position.z) * 0.1;
  camera.lookAt(me.x, 0, me.y);
}

function setCarColor(car, THREE, color) {
  // The body is the first child of the group
  if (car && car.children[0]) {
    car.children[0].material.color.setHex(color);
    car.children[0].material.emissive.setHex(color);
    car.children[0].material.emissiveIntensity = 0.3;
  }
}

function updateHUD() {
  if (_destroyed || !_ctx || !_players.length) return;
  const mySeat = _ctx.seat;
  const oppSeat = mySeat === 1 ? 2 : 1;
  const me = _players[mySeat - 1];
  const opp = _players[oppSeat - 1];

  if (_myCoinsEl && me) {
    _myCoinsEl.textContent = '\uD83E\uDE99 ' + (me.coins || 0);
  }
  if (_oppCoinsEl && opp) {
    _oppCoinsEl.textContent = '\uD83E\uDE99 ' + (opp.coins || 0);
  }

  // Timer
  if (_ctx.timerEl) {
    const remaining = Math.max(0, 30 - Math.floor(_elapsed));
    _ctx.timerEl.textContent = String(remaining);
    _ctx.timerEl.className = 'timer' + (remaining <= 10 ? ' urgent' : '');
  }
}

function setupInput(renderer) {
  const canvas = renderer.domElement;

  // Touch/mouse drag for steering
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _isDragging = true;
    _dragStartX = e.touches[0].clientX;
    _steerValue = 0;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!_isDragging) return;
    const dx = e.touches[0].clientX - _dragStartX;
    _steerValue = clamp(dx / 50, -1, 1);
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    _isDragging = false;
    _steerValue = 0;
    sendSteer(0);
  });

  canvas.addEventListener('mousedown', (e) => {
    _isDragging = true;
    _dragStartX = e.clientX;
    _steerValue = 0;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!_isDragging) return;
    const dx = e.clientX - _dragStartX;
    _steerValue = clamp(dx / 50, -1, 1);
  });

  canvas.addEventListener('mouseup', () => {
    _isDragging = false;
    _steerValue = 0;
    sendSteer(0);
  });

  canvas.addEventListener('mouseleave', () => {
    if (_isDragging) {
      _isDragging = false;
      _steerValue = 0;
      sendSteer(0);
    }
  });

  // Continuous steer send at 20Hz
  _steerInterval = setInterval(() => {
    if (_destroyed) return;
    if (_isDragging && _steerValue !== 0) {
      sendSteer(_steerValue);
    }
  }, 50);
}

function sendSteer(angle) {
  if (_ctx && _ctx.ws) {
    _ctx.ws.send({ type: 'steer', angle });
  }
}

function setupButtonSteering(container) {
  _controlsEl = document.createElement('div');
  _controlsEl.style.cssText = 'display:flex;justify-content:center;gap:16px;padding:8px 0;';

  const btnStyle = 'flex:1;max-width:140px;padding:12px 0;font-size:18px;font-weight:bold;border:none;border-radius:10px;color:#fff;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;';

  const leftBtn = document.createElement('button');
  leftBtn.textContent = '\u25C0 \u05E9\u05DE\u05D0\u05DC\u05D4';
  leftBtn.style.cssText = btnStyle + 'background:rgba(99,102,241,0.3);';

  const rightBtn = document.createElement('button');
  rightBtn.textContent = '\u05D9\u05DE\u05D9\u05E0\u05D4 \u25B6';
  rightBtn.style.cssText = btnStyle + 'background:rgba(99,102,241,0.3);';

  // Left button handlers
  let leftHeld = false;
  const startLeft = (e) => { e.preventDefault(); leftHeld = true; sendSteer(-1); };
  const stopLeft = (e) => { e.preventDefault(); leftHeld = false; sendSteer(0); };
  leftBtn.addEventListener('touchstart', startLeft, { passive: false });
  leftBtn.addEventListener('touchend', stopLeft, { passive: false });
  leftBtn.addEventListener('touchcancel', stopLeft, { passive: false });
  leftBtn.addEventListener('mousedown', startLeft);
  leftBtn.addEventListener('mouseup', stopLeft);
  leftBtn.addEventListener('mouseleave', () => { if (leftHeld) stopLeft(new Event('x')); });

  // Right button handlers
  let rightHeld = false;
  const startRight = (e) => { e.preventDefault(); rightHeld = true; sendSteer(1); };
  const stopRight = (e) => { e.preventDefault(); rightHeld = false; sendSteer(0); };
  rightBtn.addEventListener('touchstart', startRight, { passive: false });
  rightBtn.addEventListener('touchend', stopRight, { passive: false });
  rightBtn.addEventListener('touchcancel', stopRight, { passive: false });
  rightBtn.addEventListener('mousedown', startRight);
  rightBtn.addEventListener('mouseup', stopRight);
  rightBtn.addEventListener('mouseleave', () => { if (rightHeld) stopRight(new Event('x')); });

  _controlsEl.appendChild(leftBtn);
  _controlsEl.appendChild(rightBtn);
  container.appendChild(_controlsEl);
}

function buildHUD(container) {
  const hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;padding:4px 12px;font-size:18px;font-weight:bold;';

  _myCoinsEl = document.createElement('span');
  _myCoinsEl.style.cssText = 'color:#06B6D4;text-shadow:0 0 10px rgba(6,182,212,0.5);';
  _myCoinsEl.textContent = '\uD83E\uDE99 0';

  _oppCoinsEl = document.createElement('span');
  _oppCoinsEl.style.cssText = 'color:#D946EF;text-shadow:0 0 10px rgba(217,70,239,0.5);';
  _oppCoinsEl.textContent = '\uD83E\uDE99 0';

  hud.appendChild(_myCoinsEl);
  hud.appendChild(_oppCoinsEl);
  container.insertBefore(hud, container.firstChild);
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _coinMeshes = [];
  _steerValue = 0;
  _isDragging = false;
  _myStunTimer = 0;
  _oppStunTimer = 0;

  // Hide turn indicator (not used for drift)
  ctx.turnText.style.display = 'none';

  // Initial state
  if (ctx.state) {
    _players = ctx.state.players || [];
    _coins = ctx.state.coins || [];
    _arenaRadius = ctx.state.arenaRadius || 40;
  }

  // Container for canvas
  const canvasContainer = document.createElement('div');
  canvasContainer.style.cssText = 'width:100%;height:300px;position:relative;border-radius:12px;overflow:hidden;';
  ctx.area.appendChild(canvasContainer);

  // Create Three.js scene (disable default ground, we build our own)
  _sceneCtx = createScene(canvasContainer, {
    ground: false,
    bgColor: 0x070714,
    camY: 12,
    camZ: 15,
  });

  if (!_sceneCtx) {
    const errMsg = document.createElement('p');
    errMsg.style.cssText = 'color:red;text-align:center;padding:20px;';
    errMsg.textContent = 'Three.js not loaded';
    canvasContainer.appendChild(errMsg);
    return;
  }

  const { scene, camera, renderer, startLoop, THREE } = _sceneCtx;

  // Build arena
  buildArena(THREE, scene);

  // Create cars
  _myCar = createCarMesh(THREE, _myOrigColor);
  _myCar.children[0].material.emissive = new THREE.Color(_myOrigColor);
  _myCar.children[0].material.emissiveIntensity = 0.2;
  scene.add(_myCar);

  _oppCar = createCarMesh(THREE, _oppOrigColor);
  _oppCar.children[0].material.emissive = new THREE.Color(_oppOrigColor);
  _oppCar.children[0].material.emissiveIntensity = 0.2;
  scene.add(_oppCar);

  // Initial coins
  syncCoins(THREE, scene);

  // Position cars from initial state
  if (_players.length >= 2) {
    const me = _players[ctx.seat - 1];
    const opp = _players[ctx.seat === 1 ? 1 : 0];
    if (me) {
      _myCar.position.set(me.x, 0.3, me.y);
      _myCar.rotation.y = -me.angle;
    }
    if (opp) {
      _oppCar.position.set(opp.x, 0.3, opp.y);
      _oppCar.rotation.y = -opp.angle;
    }
  }

  // Add a point light that follows my car for dramatic effect
  const carLight = new THREE.PointLight(0x06B6D4, 0.5, 15);
  carLight.position.set(0, 3, 0);
  _myCar.add(carLight);

  // HUD
  buildHUD(ctx.area);

  // Steer buttons
  setupButtonSteering(ctx.area);

  // Input (drag on canvas)
  setupInput(renderer);

  // Render loop
  startLoop(() => {
    if (_destroyed) return;

    const mySeat = ctx.seat;
    const oppSeat = mySeat === 1 ? 2 : 1;

    // Update car positions from state
    if (_players.length >= 2) {
      const me = _players[mySeat - 1];
      const opp = _players[oppSeat - 1];

      if (me && _myCar) {
        _myCar.position.set(me.x, 0.3, me.y);
        _myCar.rotation.y = -me.angle;

        // Stun flash
        if (me.stunned && _myStunTimer <= 0) {
          _myStunTimer = 30; // frames of flash
        }
      }
      if (opp && _oppCar) {
        _oppCar.position.set(opp.x, 0.3, opp.y);
        _oppCar.rotation.y = -opp.angle;

        if (opp.stunned && _oppStunTimer <= 0) {
          _oppStunTimer = 30;
        }
      }
    }

    // Stun flash effect
    if (_myStunTimer > 0) {
      _myStunTimer--;
      const flash = _myStunTimer % 6 < 3;
      setCarColor(_myCar, THREE, flash ? 0xFF0000 : _myOrigColor);
      if (_myStunTimer <= 0) {
        setCarColor(_myCar, THREE, _myOrigColor);
      }
    }

    if (_oppStunTimer > 0) {
      _oppStunTimer--;
      const flash = _oppStunTimer % 6 < 3;
      setCarColor(_oppCar, THREE, flash ? 0xFF0000 : _oppOrigColor);
      if (_oppStunTimer <= 0) {
        setCarColor(_oppCar, THREE, _oppOrigColor);
      }
    }

    // Spin coins
    for (const cm of _coinMeshes) {
      cm.rotation.y += 0.04;
    }

    // Pulse the edge ring
    if (_edgeRing) {
      const pulse = 0.5 + 0.3 * Math.sin(Date.now() * 0.003);
      _edgeRing.material.emissiveIntensity = pulse;
    }

    // Camera follow
    updateCamera(camera);
  });

  // Listen for server state updates
  _unsubs.push(ctx.ws.on('race_state', (msg) => {
    if (_destroyed) return;
    _players = msg.players || [];
    _coins = msg.coins || [];
    _elapsed = msg.elapsed || 0;

    syncCoins(_sceneCtx.THREE, _sceneCtx.scene);
    updateHUD();
  }));
}

export function destroy() {
  _destroyed = true;

  if (_steerInterval) {
    clearInterval(_steerInterval);
    _steerInterval = null;
  }

  for (const unsub of _unsubs) unsub();
  _unsubs = [];

  // Dispose coin meshes
  for (const cm of _coinMeshes) {
    if (cm.geometry) cm.geometry.dispose();
    if (cm.material) cm.material.dispose();
  }
  _coinMeshes = [];

  // Dispose scene
  if (_sceneCtx) {
    _sceneCtx.dispose();
    _sceneCtx = null;
  }

  _myCar = null;
  _oppCar = null;
  _arenaDisc = null;
  _edgeRing = null;
  _myCoinsEl = null;
  _oppCoinsEl = null;
  _controlsEl = null;
  _ctx = null;
}

export default { init, destroy };
