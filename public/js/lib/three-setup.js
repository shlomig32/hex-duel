/**
 * Shared Three.js scene setup for 3D games.
 * Three.js is loaded via CDN as a global (window.THREE).
 */

export function createScene(container, opts = {}) {
  const THREE = window.THREE;
  if (!THREE) {
    console.error('Three.js not loaded');
    return null;
  }

  const width = container.clientWidth || 360;
  const height = container.clientHeight || 400;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.bgColor || 0x0a0a1a);
  scene.fog = new THREE.Fog(opts.bgColor || 0x0a0a1a, 30, 80);

  // Camera
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
  camera.position.set(opts.camX || 0, opts.camY || 8, opts.camZ || 12);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 512;
  sun.shadow.mapSize.height = 512;
  scene.add(sun);

  // Ground plane
  if (opts.ground !== false) {
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: opts.groundColor || 0x1a1a2e,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Resize handler
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // Animation loop
  let animFrame = null;
  let running = true;

  function startLoop(callback) {
    function loop() {
      if (!running) return;
      animFrame = requestAnimationFrame(loop);
      if (callback) callback();
      renderer.render(scene, camera);
    }
    loop();
  }

  function dispose() {
    running = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return { scene, camera, renderer, startLoop, dispose, THREE };
}

/** Create a simple low-poly car mesh */
export function createCarMesh(THREE, color) {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.BoxGeometry(1.2, 0.5, 2.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1.0, 0.4, 1.2);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.5 });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.85, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const positions = [
    [-0.65, 0.25, 0.8], [0.65, 0.25, 0.8],
    [-0.65, 0.25, -0.8], [0.65, 0.25, -0.8],
  ];
  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
  }

  return group;
}
