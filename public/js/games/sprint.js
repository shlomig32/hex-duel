import { createScene, createCarMesh } from '../lib/three-setup.js';

// ── Constants ──────────────────────────────────────────────
const LANE_WIDTH = 4;
const LANE_COUNT = 3;
const TRACK_WIDTH = LANE_WIDTH * LANE_COUNT;
const OBSTACLE_SIZE = 1;
const CAM_HEIGHT = 5;
const CAM_BACK = 8;
const CAM_LOOK_AHEAD = 10;
const LERP_FACTOR = 0.12;

// ── Module-level state ─────────────────────────────────────
let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// Three.js handles
let _sceneCtx = null;   // { scene, camera, renderer, startLoop, dispose, THREE }
let _myCar = null;
let _oppCar = null;
let _obstacleMeshes = [];
let _trackMesh = null;
let _dividerMeshes = [];

// DOM
let _progressBarMine = null;
let _progressBarOpp = null;
let _controlsDiv = null;
let _boostBtn = null;
let _flagEl = null;

// Server state
let _players = [
  { z: 0, lane: 1, boosts: 3, stunned: false, finished: false },
  { z: 0, lane: 1, boosts: 3, stunned: false, finished: false },
];
let _trackLength = 200;
let _elapsed = 0;

// ── Helpers ────────────────────────────────────────────────
function laneToX(lane) {
  return (lane - 1) * LANE_WIDTH;
}

function myIndex() {
  return (_ctx.seat || 1) - 1;
}

function oppIndex() {
  return myIndex() === 0 ? 1 : 0;
}

// ── Build 3D Scene ─────────────────────────────────────────
function buildTrack(scene, THREE) {
  // Main track surface
  const trackGeo = new THREE.PlaneGeometry(TRACK_WIDTH, _trackLength);
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a3e,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  _trackMesh = new THREE.Mesh(trackGeo, trackMat);
  _trackMesh.rotation.x = -Math.PI / 2;
  _trackMesh.position.set(0, 0.01, _trackLength / 2);
  _trackMesh.receiveShadow = true;
  scene.add(_trackMesh);

  // Lane dividers (two dashed-style lines)
  const dividerMat = new THREE.MeshStandardMaterial({ color: 0x3a3a6e, roughness: 0.8 });
  for (let i = 0; i < 2; i++) {
    const x = (i === 0) ? -LANE_WIDTH / 2 : LANE_WIDTH / 2;
    const segCount = Math.floor(_trackLength / 4);
    for (let s = 0; s < segCount; s++) {
      const dashGeo = new THREE.PlaneGeometry(0.15, 1.5);
      const dash = new THREE.Mesh(dashGeo, dividerMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, s * 4 + 1);
      scene.add(dash);
      _dividerMeshes.push(dash);
    }
  }

  // Start & finish lines
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  for (const zPos of [0, _trackLength]) {
    const lineGeo = new THREE.PlaneGeometry(TRACK_WIDTH, 0.4);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.03, zPos);
    scene.add(line);
  }

  // Finish checkered pattern (simple alternating cubes)
  const checkWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const checkBlack = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 2; row++) {
      const isWhite = (col + row) % 2 === 0;
      const cGeo = new THREE.PlaneGeometry(TRACK_WIDTH / 6, 0.5);
      const cMesh = new THREE.Mesh(cGeo, isWhite ? checkWhite : checkBlack);
      cMesh.rotation.x = -Math.PI / 2;
      cMesh.position.set(
        -TRACK_WIDTH / 2 + (col + 0.5) * (TRACK_WIDTH / 6),
        0.025,
        _trackLength + 0.5 + row * 0.5
      );
      scene.add(cMesh);
    }
  }
}

function buildObstacles(scene, THREE, obstacles) {
  // Clear old
  for (const m of _obstacleMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
  _obstacleMeshes = [];

  const obsGeo = new THREE.BoxGeometry(OBSTACLE_SIZE, OBSTACLE_SIZE, OBSTACLE_SIZE);
  const obsMat = new THREE.MeshStandardMaterial({ color: 0xee3333, roughness: 0.4, metalness: 0.2 });

  for (const obs of obstacles) {
    const mesh = new THREE.Mesh(obsGeo, obsMat);
    mesh.position.set(laneToX(obs.lane), OBSTACLE_SIZE / 2, obs.z);
    mesh.castShadow = true;
    scene.add(mesh);
    _obstacleMeshes.push(mesh);
  }
}

function buildCars(scene, THREE) {
  const myColor = 0x06b6d4;   // cyan
  const oppColor = 0xd946ef;  // magenta

  _myCar = createCarMesh(THREE, myColor);
  _oppCar = createCarMesh(THREE, oppColor);

  _myCar.position.set(laneToX(1), 0, 0);
  _oppCar.position.set(laneToX(1), 0, 0);

  scene.add(_myCar);
  scene.add(_oppCar);
}

// ── HUD / Controls ─────────────────────────────────────────
function buildHUD(area) {
  // Progress bars container at top
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    position: absolute; top: 8px; left: 8px; right: 8px; z-index: 10;
    display: flex; flex-direction: column; gap: 4px;
  `;

  // My progress bar
  const myBarOuter = document.createElement('div');
  myBarOuter.style.cssText = `
    height: 10px; background: rgba(0,0,0,0.4); border-radius: 5px; overflow: hidden;
    border: 1px solid rgba(6,182,212,0.3);
  `;
  _progressBarMine = document.createElement('div');
  _progressBarMine.style.cssText = `
    height: 100%; width: 0%; background: linear-gradient(90deg, #06B6D4, #22D3EE);
    border-radius: 5px; transition: width 0.1s ease-out;
  `;
  myBarOuter.appendChild(_progressBarMine);

  // Opponent progress bar
  const oppBarOuter = document.createElement('div');
  oppBarOuter.style.cssText = `
    height: 10px; background: rgba(0,0,0,0.4); border-radius: 5px; overflow: hidden;
    border: 1px solid rgba(217,70,239,0.3);
  `;
  _progressBarOpp = document.createElement('div');
  _progressBarOpp.style.cssText = `
    height: 100%; width: 0%; background: linear-gradient(90deg, #D946EF, #E879F9);
    border-radius: 5px; transition: width 0.1s ease-out;
  `;
  oppBarOuter.appendChild(_progressBarOpp);

  progressContainer.appendChild(myBarOuter);
  progressContainer.appendChild(oppBarOuter);
  area.appendChild(progressContainer);

  // Finished flag overlay (hidden initially)
  _flagEl = document.createElement('div');
  _flagEl.style.cssText = `
    display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 64px; z-index: 20; text-shadow: 0 0 20px rgba(0,0,0,0.8);
    animation: flag-pulse 0.6s ease-in-out infinite alternate;
  `;
  _flagEl.textContent = '\u{1F3C1}';
  area.appendChild(_flagEl);

  // Inject keyframe for flag pulse
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flag-pulse {
      from { transform: translate(-50%, -50%) scale(1); }
      to   { transform: translate(-50%, -50%) scale(1.15); }
    }
  `;
  area.appendChild(style);
}

function buildControls(area) {
  _controlsDiv = document.createElement('div');
  _controlsDiv.style.cssText = `
    display: flex; gap: 8px; justify-content: center; align-items: center;
    padding: 10px 8px; direction: rtl;
  `;

  // Lane buttons: RTL order (right button first in DOM for RTL)
  const lanes = [
    { label: '\u25C0 \u05E9\u05DE\u05D0\u05DC', lane: 0 },
    { label: '\u05D9\u05E9\u05E8', lane: 1 },
    { label: '\u05D9\u05DE\u05D9\u05DF \u25B6', lane: 2 },
  ];

  for (const { label, lane } of lanes) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      flex: 1; padding: 12px 4px; font-size: 15px; font-weight: 700;
      border: 1px solid rgba(148,163,184,0.2); border-radius: 10px;
      background: rgba(26,26,62,0.85); color: #E2E8F0;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s;
    `;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (_destroyed) return;
      _ctx.ws.send({ type: 'steer', lane });
      btn.style.background = 'rgba(6,182,212,0.3)';
      setTimeout(() => { btn.style.background = 'rgba(26,26,62,0.85)'; }, 120);
    });
    _controlsDiv.appendChild(btn);
  }

  // Boost button
  _boostBtn = document.createElement('button');
  _boostBtn.style.cssText = `
    padding: 12px 14px; font-size: 15px; font-weight: 700;
    border: 1px solid rgba(251,191,36,0.4); border-radius: 10px;
    background: rgba(251,191,36,0.15); color: #FBBF24;
    cursor: pointer; touch-action: manipulation;
    transition: background 0.15s; white-space: nowrap;
  `;
  updateBoostButton(3);
  _boostBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (_destroyed) return;
    _ctx.ws.send({ type: 'boost' });
    _boostBtn.style.background = 'rgba(251,191,36,0.35)';
    setTimeout(() => { _boostBtn.style.background = 'rgba(251,191,36,0.15)'; }, 120);
  });
  _controlsDiv.appendChild(_boostBtn);

  area.appendChild(_controlsDiv);
}

function updateBoostButton(boosts) {
  if (!_boostBtn) return;
  _boostBtn.textContent = '\u{1F680} \u05D1\u05D5\u05E1\u05D8 (' + boosts + ')';
  _boostBtn.style.opacity = boosts > 0 ? '1' : '0.4';
  _boostBtn.style.pointerEvents = boosts > 0 ? 'auto' : 'none';
}

// ── Render Loop Callback ───────────────────────────────────
function onFrame() {
  if (_destroyed || !_sceneCtx) return;

  const mi = myIndex();
  const oi = oppIndex();
  const myPlayer = _players[mi];
  const oppPlayer = _players[oi];

  if (!myPlayer || !oppPlayer) return;

  // Target car positions
  const myTargetX = laneToX(myPlayer.lane);
  const myTargetZ = myPlayer.z;
  const oppTargetX = laneToX(oppPlayer.lane);
  const oppTargetZ = oppPlayer.z;

  // Smooth interpolation for car positions
  if (_myCar) {
    _myCar.position.x += (myTargetX - _myCar.position.x) * LERP_FACTOR;
    _myCar.position.z += (myTargetZ - _myCar.position.z) * LERP_FACTOR;

    // Stunned tilt
    if (myPlayer.stunned) {
      _myCar.rotation.z += (0.5 - _myCar.rotation.z) * 0.15;
    } else {
      _myCar.rotation.z += (0 - _myCar.rotation.z) * 0.15;
    }
  }

  if (_oppCar) {
    _oppCar.position.x += (oppTargetX - _oppCar.position.x) * LERP_FACTOR;
    _oppCar.position.z += (oppTargetZ - _oppCar.position.z) * LERP_FACTOR;

    // Stunned tilt for opponent
    if (oppPlayer.stunned) {
      _oppCar.rotation.z += (0.5 - _oppCar.rotation.z) * 0.15;
    } else {
      _oppCar.rotation.z += (0 - _oppCar.rotation.z) * 0.15;
    }
  }

  // Camera follows my car smoothly
  const cam = _sceneCtx.camera;
  const camTargetX = _myCar ? _myCar.position.x : 0;
  const camTargetZ = (_myCar ? _myCar.position.z : 0) - CAM_BACK;
  cam.position.x += (camTargetX - cam.position.x) * LERP_FACTOR;
  cam.position.y += (CAM_HEIGHT - cam.position.y) * LERP_FACTOR;
  cam.position.z += (camTargetZ - cam.position.z) * LERP_FACTOR;
  cam.lookAt(
    _myCar ? _myCar.position.x : 0,
    0,
    (_myCar ? _myCar.position.z : 0) + CAM_LOOK_AHEAD
  );

  // Update fog to follow camera
  if (_sceneCtx.scene.fog) {
    _sceneCtx.scene.fog.near = cam.position.z + 10;
    _sceneCtx.scene.fog.far = cam.position.z + 80;
  }

  // Progress bars
  if (_progressBarMine) {
    const myPct = Math.min(100, (myPlayer.z / _trackLength) * 100);
    _progressBarMine.style.width = myPct + '%';
  }
  if (_progressBarOpp) {
    const oppPct = Math.min(100, (oppPlayer.z / _trackLength) * 100);
    _progressBarOpp.style.width = oppPct + '%';
  }

  // Boost button count
  updateBoostButton(myPlayer.boosts);

  // Finished flag
  if (_flagEl && myPlayer.finished) {
    _flagEl.style.display = 'block';
  }
}

// ── Server State Handler ───────────────────────────────────
function onRaceState(msg) {
  if (_destroyed) return;

  if (msg.players) {
    _players = msg.players;
  }
  if (msg.elapsed !== undefined) {
    _elapsed = msg.elapsed;
  }
}

// ── Init / Destroy ─────────────────────────────────────────
export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _obstacleMeshes = [];
  _dividerMeshes = [];

  // Hide turn text (not used for sprint)
  ctx.turnText.style.display = 'none';

  // Read initial state
  if (ctx.state) {
    if (ctx.state.players) _players = ctx.state.players;
    if (ctx.state.trackLength) _trackLength = ctx.state.trackLength;
  }

  // Container wrapper (needs relative positioning for HUD overlays)
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex; flex-direction: column; width: 100%; height: 100%;
  `;

  // 3D viewport container
  const viewport = document.createElement('div');
  viewport.style.cssText = `
    flex: 1; position: relative; min-height: 0; overflow: hidden;
  `;

  // Create Three.js scene (disable default ground, we build our own track)
  _sceneCtx = createScene(viewport, {
    bgColor: 0x080820,
    ground: false,
    camX: 0,
    camY: CAM_HEIGHT,
    camZ: -CAM_BACK,
  });

  if (!_sceneCtx) {
    const errMsg = document.createElement('p');
    errMsg.style.cssText = 'color:#f00;text-align:center;padding:2em;';
    errMsg.textContent = 'Three.js not loaded';
    viewport.appendChild(errMsg);
    ctx.area.appendChild(viewport);
    return;
  }

  const { scene, THREE } = _sceneCtx;

  // Extend fog range for the long track
  scene.fog.near = 20;
  scene.fog.far = 100;

  // Build the 3D world
  buildTrack(scene, THREE);
  buildCars(scene, THREE);

  // Obstacles from initial state
  if (ctx.state && ctx.state.obstacles) {
    buildObstacles(scene, THREE, ctx.state.obstacles);
  }

  // Add side rails / edge markers for visual flair
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2a5e, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const railX = side * (TRACK_WIDTH / 2 + 0.3);
    const segCount = Math.floor(_trackLength / 10);
    for (let s = 0; s < segCount; s++) {
      const postGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.set(railX, 0.3, s * 10);
      scene.add(post);
    }
  }

  wrapper.appendChild(viewport);

  // HUD overlay (progress bars, flag)
  buildHUD(viewport);

  // Controls beneath the 3D canvas
  buildControls(wrapper);

  ctx.area.appendChild(wrapper);
  ctx.area.style.padding = '0';
  ctx.area.style.flexDirection = 'column';

  // Start render loop
  _sceneCtx.startLoop(onFrame);

  // Listen for server race state updates
  _unsubs.push(ctx.ws.on('race_state', onRaceState));
}

export function destroy() {
  _destroyed = true;

  // Unsubscribe from WS events
  for (const unsub of _unsubs) unsub();
  _unsubs = [];

  // Dispose Three.js scene
  if (_sceneCtx) {
    _sceneCtx.dispose();
    _sceneCtx = null;
  }

  _myCar = null;
  _oppCar = null;
  _obstacleMeshes = [];
  _dividerMeshes = [];
  _trackMesh = null;
  _progressBarMine = null;
  _progressBarOpp = null;
  _controlsDiv = null;
  _boostBtn = null;
  _flagEl = null;
}

export default { init, destroy };
