import { createScene, createCarMesh } from '../lib/three-setup.js';

// Module-level variables
let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// Three.js references
let _sceneKit = null; // { scene, camera, renderer, startLoop, dispose, THREE }
let THREE = null;

// Game objects
let _myCar = null;
let _oppCar = null;
let _myShieldRing = null;
let _oppShieldRing = null;
let _walls = [];
let _powerupMeshes = new Map(); // key: "x,y" -> mesh
let _groundMesh = null;

// HUD elements
let _myHpEl = null;
let _oppHpEl = null;
let _controlsEl = null;

// State
let _players = [];
let _powerups = [];
let _elapsed = 0;
let _arenaSize = 60;
let _steerDir = 0; // -1, 0, 1

// Stun shake state
let _myStunTime = 0;
let _oppStunTime = 0;

// Boost particle systems
let _myBoostParticles = [];
let _oppBoostParticles = [];

// Touch steering state
let _touchStartX = 0;
let _isTouching = false;

// ── Setup ──

function buildArena(scene) {
  // Dark ground plane (replace default ground)
  const groundGeo = new THREE.PlaneGeometry(_arenaSize, _arenaSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x111122,
    roughness: 0.9,
  });
  _groundMesh = new THREE.Mesh(groundGeo, groundMat);
  _groundMesh.rotation.x = -Math.PI / 2;
  _groundMesh.position.y = 0.01;
  _groundMesh.receiveShadow = true;
  scene.add(_groundMesh);

  // Grid lines on ground
  const gridHelper = new THREE.GridHelper(_arenaSize, 20, 0x222244, 0x1a1a33);
  gridHelper.position.y = 0.02;
  scene.add(gridHelper);

  // Border walls (purple glow)
  const wallColor = 0x8B5CF6;
  const wallHeight = 2;
  const wallThickness = 0.4;
  const half = _arenaSize / 2;

  const wallDefs = [
    { w: _arenaSize + wallThickness, h: wallHeight, d: wallThickness, x: 0, z: -half },
    { w: _arenaSize + wallThickness, h: wallHeight, d: wallThickness, x: 0, z: half },
    { w: wallThickness, h: wallHeight, d: _arenaSize + wallThickness, x: -half, z: 0 },
    { w: wallThickness, h: wallHeight, d: _arenaSize + wallThickness, x: half, z: 0 },
  ];

  for (const def of wallDefs) {
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshStandardMaterial({
      color: wallColor,
      emissive: wallColor,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(def.x, def.h / 2, def.z);
    mesh.castShadow = true;
    scene.add(mesh);
    _walls.push(mesh);
  }
}

function createShieldRing() {
  const geo = new THREE.TorusGeometry(1.4, 0.08, 8, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    emissive: 0x3B82F6,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.5;
  mesh.visible = false;
  return mesh;
}

function createPowerupMesh(type) {
  const size = 0.6;
  const geo = new THREE.BoxGeometry(size, size, size);
  const color = type === 'shield' ? 0x3B82F6 : 0xF97316;
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  // Add a point light for glow effect
  const light = new THREE.PointLight(color, 0.5, 5);
  light.position.y = 0.5;
  mesh.add(light);

  return mesh;
}

function buildHUD() {
  // HP display
  const hudContainer = document.createElement('div');
  hudContainer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 12px;width:100%;box-sizing:border-box;';

  // My HP
  const myHpWrap = document.createElement('div');
  myHpWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
  const myLabel = document.createElement('span');
  myLabel.style.cssText = 'color:#06B6D4;font-size:13px;font-weight:bold;';
  myLabel.textContent = 'אני';
  _myHpEl = document.createElement('span');
  _myHpEl.style.cssText = 'font-size:16px;';
  _myHpEl.textContent = '\u2764\uFE0F\u2764\uFE0F\u2764\uFE0F';
  myHpWrap.appendChild(myLabel);
  myHpWrap.appendChild(_myHpEl);

  // Opponent HP
  const oppHpWrap = document.createElement('div');
  oppHpWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
  _oppHpEl = document.createElement('span');
  _oppHpEl.style.cssText = 'font-size:16px;';
  _oppHpEl.textContent = '\u2764\uFE0F\u2764\uFE0F\u2764\uFE0F';
  const oppLabel = document.createElement('span');
  oppLabel.style.cssText = 'color:#D946EF;font-size:13px;font-weight:bold;';
  oppLabel.textContent = 'יריב';
  oppHpWrap.appendChild(_oppHpEl);
  oppHpWrap.appendChild(oppLabel);

  hudContainer.appendChild(myHpWrap);
  hudContainer.appendChild(oppHpWrap);

  return hudContainer;
}

function buildControls() {
  _controlsEl = document.createElement('div');
  _controlsEl.style.cssText = 'display:flex;justify-content:center;gap:12px;padding:8px 0;width:100%;';

  const btnStyle = 'flex:1;max-width:100px;padding:12px 0;font-size:24px;border:none;border-radius:12px;cursor:pointer;touch-action:manipulation;user-select:none;';

  // Steer left
  const leftBtn = document.createElement('button');
  leftBtn.style.cssText = btnStyle + 'background:#1E293B;color:#06B6D4;';
  leftBtn.textContent = '\u25C0';
  leftBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setSteer(-1); });
  leftBtn.addEventListener('pointerup', (e) => { e.preventDefault(); setSteer(0); });
  leftBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); if (_steerDir === -1) setSteer(0); });

  // Brake
  const brakeBtn = document.createElement('button');
  brakeBtn.style.cssText = btnStyle + 'background:#7F1D1D;color:#FCA5A5;';
  brakeBtn.textContent = '\uD83D\uDED1 \u05D1\u05DC\u05DD';
  brakeBtn.style.fontSize = '16px';
  brakeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (_ctx && _ctx.ws) _ctx.ws.send({ type: 'brake', active: true });
  });
  brakeBtn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (_ctx && _ctx.ws) _ctx.ws.send({ type: 'brake', active: false });
  });
  brakeBtn.addEventListener('pointerleave', (e) => {
    e.preventDefault();
    if (_ctx && _ctx.ws) _ctx.ws.send({ type: 'brake', active: false });
  });

  // Steer right
  const rightBtn = document.createElement('button');
  rightBtn.style.cssText = btnStyle + 'background:#1E293B;color:#06B6D4;';
  rightBtn.textContent = '\u25B6';
  rightBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setSteer(1); });
  rightBtn.addEventListener('pointerup', (e) => { e.preventDefault(); setSteer(0); });
  rightBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); if (_steerDir === 1) setSteer(0); });

  _controlsEl.appendChild(leftBtn);
  _controlsEl.appendChild(brakeBtn);
  _controlsEl.appendChild(rightBtn);

  return _controlsEl;
}

function setSteer(dir) {
  if (_destroyed) return;
  _steerDir = dir;
  if (_ctx && _ctx.ws) {
    _ctx.ws.send({ type: 'steer', angle: dir });
  }
}

function setupTouchSteering(canvas) {
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _isTouching = true;
    _touchStartX = e.touches[0].clientX;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!_isTouching) return;
    const dx = e.touches[0].clientX - _touchStartX;
    const threshold = 20;
    if (dx < -threshold) {
      setSteer(-1);
    } else if (dx > threshold) {
      setSteer(1);
    } else {
      setSteer(0);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    _isTouching = false;
    setSteer(0);
  }, { passive: false });
}

// ── Update from server ──

function updateHp() {
  if (!_myHpEl || !_oppHpEl || !_players.length) return;
  const myIdx = _ctx.seat - 1;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const myHp = _players[myIdx]?.hp ?? 3;
  const oppHp = _players[oppIdx]?.hp ?? 3;
  _myHpEl.textContent = '\u2764\uFE0F'.repeat(Math.max(0, myHp));
  _oppHpEl.textContent = '\u2764\uFE0F'.repeat(Math.max(0, oppHp));
}

function updateCars() {
  if (!_players.length || !_myCar || !_oppCar) return;
  const myIdx = _ctx.seat - 1;
  const oppIdx = myIdx === 0 ? 1 : 0;

  const myP = _players[myIdx];
  const oppP = _players[oppIdx];

  if (myP) {
    _myCar.position.set(myP.x, 0, myP.y);
    _myCar.rotation.y = -myP.angle;

    // Shield ring
    _myShieldRing.visible = !!myP.shield;

    // Stun shake
    if (myP.stunned) {
      _myStunTime += 0.15;
      _myCar.position.x += Math.sin(_myStunTime * 30) * 0.15;
      _myCar.position.z += Math.cos(_myStunTime * 25) * 0.15;
    } else {
      _myStunTime = 0;
    }
  }

  if (oppP) {
    _oppCar.position.set(oppP.x, 0, oppP.y);
    _oppCar.rotation.y = -oppP.angle;

    // Shield ring
    _oppShieldRing.visible = !!oppP.shield;

    // Stun shake
    if (oppP.stunned) {
      _oppStunTime += 0.15;
      _oppCar.position.x += Math.sin(_oppStunTime * 30) * 0.15;
      _oppCar.position.z += Math.cos(_oppStunTime * 25) * 0.15;
    } else {
      _oppStunTime = 0;
    }
  }
}

function updateCamera() {
  if (!_sceneKit || !_players.length) return;
  const myIdx = _ctx.seat - 1;
  const myP = _players[myIdx];
  if (!myP) return;

  const camera = _sceneKit.camera;
  const targetX = myP.x - Math.sin(myP.angle) * 12;
  const targetZ = myP.y - Math.cos(myP.angle) * 12;

  // Smooth camera follow
  camera.position.x += (targetX - camera.position.x) * 0.1;
  camera.position.y += (8 - camera.position.y) * 0.1;
  camera.position.z += (targetZ - camera.position.z) * 0.1;
  camera.lookAt(myP.x, 0, myP.y);
}

function updatePowerups(serverPowerups) {
  if (!_sceneKit) return;
  const scene = _sceneKit.scene;

  // Build a set of current server powerup keys
  const serverKeys = new Set();
  for (const p of serverPowerups) {
    const key = p.x + ',' + p.y;
    serverKeys.add(key);

    if (!_powerupMeshes.has(key)) {
      // Add new powerup
      const mesh = createPowerupMesh(p.type);
      mesh.position.set(p.x, 1.2, p.y);
      mesh.userData.type = p.type;
      scene.add(mesh);
      _powerupMeshes.set(key, mesh);
    }
  }

  // Remove powerups no longer in server state
  for (const [key, mesh] of _powerupMeshes) {
    if (!serverKeys.has(key)) {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      _powerupMeshes.delete(key);
    }
  }
}

function animatePowerups(time) {
  for (const [, mesh] of _powerupMeshes) {
    // Bob up and down
    mesh.position.y = 1.2 + Math.sin(time * 2 + mesh.position.x) * 0.3;
    // Rotate slowly
    mesh.rotation.y += 0.02;
  }
}

function animateBoostTrail(car, particles, scene, isBoosted) {
  // Remove old particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.05;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    } else {
      p.mesh.material.opacity = p.life;
      p.mesh.scale.multiplyScalar(0.95);
    }
  }

  // Emit new particles if boosted
  if (isBoosted && car) {
    const geo = new THREE.SphereGeometry(0.15, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xF97316,
      transparent: true,
      opacity: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Place behind the car
    const behindX = car.position.x - Math.sin(-car.rotation.y) * 1.5;
    const behindZ = car.position.z - Math.cos(-car.rotation.y) * 1.5;
    mesh.position.set(
      behindX + (Math.random() - 0.5) * 0.5,
      0.3 + Math.random() * 0.4,
      behindZ + (Math.random() - 0.5) * 0.5
    );
    scene.add(mesh);
    particles.push({ mesh, life: 1.0 });
  }
}

// ── Lifecycle ──

let _frameTime = 0;

function renderLoop() {
  if (_destroyed || !_sceneKit) return;

  _frameTime += 0.016;

  updateCars();
  updateCamera();
  animatePowerups(_frameTime);

  const myIdx = _ctx.seat - 1;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const myBoosted = _players[myIdx]?.boosted;
  const oppBoosted = _players[oppIdx]?.boosted;

  animateBoostTrail(_myCar, _myBoostParticles, _sceneKit.scene, myBoosted);
  animateBoostTrail(_oppCar, _oppBoostParticles, _sceneKit.scene, oppBoosted);
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _powerupMeshes = new Map();
  _myBoostParticles = [];
  _oppBoostParticles = [];
  _steerDir = 0;
  _myStunTime = 0;
  _oppStunTime = 0;
  _frameTime = 0;
  _walls = [];

  // Hide turn indicator
  ctx.turnText.style.display = 'none';

  // Initialize state
  _players = ctx.state.players || [];
  _powerups = ctx.state.powerups || [];
  _arenaSize = ctx.state.arenaSize || 60;

  // Container layout
  ctx.area.style.display = 'flex';
  ctx.area.style.flexDirection = 'column';
  ctx.area.style.alignItems = 'center';
  ctx.area.style.padding = '0';
  ctx.area.style.gap = '0';

  // HUD
  const hud = buildHUD();
  ctx.area.appendChild(hud);

  // 3D canvas container
  const canvasContainer = document.createElement('div');
  canvasContainer.style.cssText = 'width:100%;flex:1;min-height:250px;position:relative;overflow:hidden;';
  ctx.area.appendChild(canvasContainer);

  // Create Three.js scene
  _sceneKit = createScene(canvasContainer, {
    bgColor: 0x0a0a1a,
    ground: false, // We build our own ground
    camY: 8,
    camZ: 12,
  });

  if (!_sceneKit) return;
  THREE = _sceneKit.THREE;

  // Build arena
  buildArena(_sceneKit.scene);

  // Create cars
  const myColor = 0x06B6D4;   // cyan
  const oppColor = 0xD946EF;  // magenta

  _myCar = createCarMesh(THREE, myColor);
  _oppCar = createCarMesh(THREE, oppColor);

  // Shield rings
  _myShieldRing = createShieldRing();
  _myCar.add(_myShieldRing);

  _oppShieldRing = createShieldRing();
  _oppCar.add(_oppShieldRing);

  _sceneKit.scene.add(_myCar);
  _sceneKit.scene.add(_oppCar);

  // Place initial powerups
  updatePowerups(_powerups);

  // Set initial car positions
  updateCars();
  updateHp();

  // Start render loop
  _sceneKit.startLoop(renderLoop);

  // Touch steering on canvas
  if (_sceneKit.renderer && _sceneKit.renderer.domElement) {
    setupTouchSteering(_sceneKit.renderer.domElement);
  }

  // Controls
  const controls = buildControls();
  ctx.area.appendChild(controls);

  // Listen for server state updates
  _unsubs.push(ctx.ws.on('derby_state', (msg) => {
    if (_destroyed) return;

    _players = msg.players || [];
    _elapsed = msg.elapsed || 0;

    // Update timer
    const remaining = Math.max(0, 45 - Math.floor(_elapsed));
    ctx.timerEl.textContent = remaining;
    ctx.timerEl.className = 'timer' + (remaining <= 10 ? ' urgent' : '');

    // Update powerups
    updatePowerups(msg.powerups || []);

    // Update HP display
    updateHp();
  }));
}

export function destroy() {
  _destroyed = true;

  // Unsubscribe ws listeners
  for (const unsub of _unsubs) unsub();
  _unsubs = [];

  // Clean up boost particles
  if (_sceneKit) {
    const scene = _sceneKit.scene;
    for (const p of _myBoostParticles) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    for (const p of _oppBoostParticles) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
  }
  _myBoostParticles = [];
  _oppBoostParticles = [];

  // Clean up powerup meshes
  if (_sceneKit) {
    for (const [, mesh] of _powerupMeshes) {
      _sceneKit.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
  }
  _powerupMeshes = new Map();

  // Dispose Three.js scene
  if (_sceneKit) {
    _sceneKit.dispose();
    _sceneKit = null;
  }

  THREE = null;
  _myCar = null;
  _oppCar = null;
  _myShieldRing = null;
  _oppShieldRing = null;
  _walls = [];
  _groundMesh = null;
  _myHpEl = null;
  _oppHpEl = null;
  _controlsEl = null;
  _players = [];
  _powerups = [];
  _ctx = null;
}

export default { init, destroy };
