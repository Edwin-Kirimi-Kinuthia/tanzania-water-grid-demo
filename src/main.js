import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ═══════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  terrain: { width: 300, depth: 300, segments: 128, maxHeight: 35 },
  colors: {
    lake:      0x00B4D8,
    dam:       0xFF6D00,
    canal:     0x00E676,
    treatment: 0x7B2FF7,
    pump:      0xF9A825,
    pipes:     0xE040FB,
    homes:     0xFF6B6B,
    water:     0x006994,
    terrain:   0x2D5016,
    sky:       0x87CEEB,
  },
  // World positions for each infrastructure component
  positions: {
    lake:      { x: -100, z: -20 },
    dam:       { x: -65,  z: -15 },
    canal:     { x: -35,  z:  0  },
    treatment: { x:   0,  z:  15 },
    pump:      { x:  40,  z:  30 },
    pipes:     { x:  70,  z:  40 },
    homes:     { x: 105,  z:  45 },
  }
};

// Component metadata for info cards
const COMPONENT_DATA = {
  lake: {
    icon: '\u{1F30A}', name: 'Water Source (Lake)',
    desc: 'The natural freshwater lake serves as the primary intake point for the water grid. Water is drawn through screened intakes to prevent debris and aquatic life from entering the system.',
    stats: { 'Capacity': '2.4B m\u00B3', 'Intake Rate': '850 m\u00B3/s', 'Elevation': '1,134m', 'Type': 'Natural Lake' }
  },
  dam: {
    icon: '\u{1F3D7}', name: 'Dam Structure',
    desc: 'A concrete gravity dam controls water release from the lake into the canal system. Spillways manage overflow during heavy rains, while intake gates regulate downstream flow.',
    stats: { 'Height': '48m', 'Length': '320m', 'Capacity': '180M m\u00B3', 'Type': 'Gravity Dam' }
  },
  canal: {
    icon: '\u{1F6A4}', name: 'Open Canal',
    desc: 'A lined open canal carries water by gravity from the dam through lower terrain. The trapezoidal cross-section is reinforced concrete to minimize seepage losses.',
    stats: { 'Length': '12 km', 'Flow Rate': '45 m\u00B3/s', 'Width': '8m', 'Type': 'Gravity-fed' }
  },
  treatment: {
    icon: '\u{1F3ED}', name: 'Water Treatment Plant',
    desc: 'Multi-stage treatment facility with coagulation, sedimentation, filtration, and chlorination. Ensures water meets WHO drinking standards before distribution.',
    stats: { 'Capacity': '120 ML/d', 'Stages': '4-stage', 'Standard': 'WHO Grade', 'Staff': '45 engineers' }
  },
  pump: {
    icon: '\u26A1', name: 'Pumping Station',
    desc: 'High-capacity multi-stage centrifugal pumps lift water over the terrain ridge. Powered by a dedicated electrical substation with backup diesel generators.',
    stats: { 'Lift Height': '85m', 'Power': '4.2 MW', 'Pumps': '6 \u00D7 MS', 'Backup': 'Diesel Gen' }
  },
  pipes: {
    icon: '\u{1F6A7}', name: 'Pressurized Pipeline',
    desc: 'Ductile iron pressurized pipeline carries treated water uphill from the pumping station to the residential destination. Cathodic protection prevents corrosion.',
    stats: { 'Diameter': '1.8m', 'Pressure': '12 bar', 'Material': 'Ductile Iron', 'Length': '18 km' }
  },
  homes: {
    icon: '\u{1F3E0}', name: 'Residential Destination',
    desc: 'The terminal distribution point serving a community of residential homes. Includes elevated storage tanks and a local distribution network with metered connections.',
    stats: { 'Homes Served': '12,400', 'Storage': '8,000 m\u00B3', 'Supply': '24/7', 'Connections': 'Metered' }
  }
};


// ═══════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════
let scene, camera, renderer, labelRenderer, controls;
let terrain, waterSurface, lakeWater;
let flowParticles = [];
let clock = new THREE.Clock();
let componentMeshes = {};
let labels3D = {};
let labelsVisible = true;
let swayingTrees = [];  // Trees that animate wind sway

// Clipping planes to contain imported models within the terrain bounds
// (only applied to Sketchfab model materials, not our own scene geometry)
const clipPlanes = [
  new THREE.Plane(new THREE.Vector3( 1,  0,  0), 148),   // left edge  (x > -148)
  new THREE.Plane(new THREE.Vector3(-1,  0,  0), 148),   // right edge (x < 148)
  new THREE.Plane(new THREE.Vector3( 0,  0,  1), 148),   // front edge (z > -148)
  new THREE.Plane(new THREE.Vector3( 0,  0, -1), 148),   // back edge  (z < 148)
];
let flowActive = true;
let isNight = false;
let sunLight, ambientLight, hemiLight;
let pipelinePath;
let tourRunning = false;
let tourProgress = 0;

// ═══════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════
function init() {
  updateLoadStatus('Creating scene');

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.0018);

  // Camera
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 2000);
  camera.position.set(0, 120, 200);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  // Only local clipping — applied per-material on imported models only
  // (so terrain, sky, water, placeholders are NOT clipped)
  renderer.localClippingEnabled = true;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // CSS2D Renderer for labels
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  document.getElementById('canvas-container').appendChild(labelRenderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 20;
  controls.maxDistance = 500;
  controls.target.set(0, 5, 15);

  // Lighting
  setupLighting();

  // Build scene
  updateLoadStatus('Generating terrain');
  createTerrain();

  updateLoadStatus('Creating water bodies');
  createLakeWater();

  updateLoadStatus('Building infrastructure');
  createInfrastructure();

  updateLoadStatus('Laying pipelines');
  createPipeline();
  createWaterTap();

  updateLoadStatus('Spawning water flow');
  createFlowParticles();

  updateLoadStatus('Adding labels');
  createLabels();

  updateLoadStatus('Drawing elevation profile');
  drawElevationProfile();

  // Skybox
  createSky();

  // Load Sketchfab models (async, non-blocking)
  loadModels();

  // Events
  window.addEventListener('resize', onResize);
  setupUI();

  // Start
  updateLoadStatus('Ready!');
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('fade-out');
  }, 600);

  animate();
}

function updateLoadStatus(msg) {
  const el = document.getElementById('load-status');
  if (el) el.textContent = msg;
}


// ═══════════════════════════════════════════════════════════
//  LIGHTING
// ═══════════════════════════════════════════════════════════
function setupLighting() {
  // Hemisphere light (sky/ground)
  hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3D6B1E, 0.6);
  scene.add(hemiLight);

  // Ambient
  ambientLight = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambientLight);

  // Sun (directional)
  sunLight = new THREE.DirectionalLight(0xFFE4B5, 1.8);
  sunLight.position.set(80, 120, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -180;
  sunLight.shadow.camera.right = 180;
  sunLight.shadow.camera.top = 180;
  sunLight.shadow.camera.bottom = -180;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);
}


// ═══════════════════════════════════════════════════════════
//  SKY
// ═══════════════════════════════════════════════════════════
function createSky() {
  const skyGeo = new THREE.SphereGeometry(800, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor:    { value: new THREE.Color(0x0077FF) },
      bottomColor: { value: new THREE.Color(0x87CEEB) },
      offset:      { value: 20 },
      exponent:    { value: 0.4 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}


// ═══════════════════════════════════════════════════════════
//  TERRAIN
// ═══════════════════════════════════════════════════════════
function createTerrain() {
  const { width, depth, segments, maxHeight } = CONFIG.terrain;
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getTerrainHeight(x, z);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  // Vertex-colored terrain
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const norm = Math.max(0, Math.min(1, y / maxHeight));
    let r, g, b;
    // Beach sand ring around the lake
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const dLake = Math.sqrt((px - CONFIG.positions.lake.x) ** 2 + (pz - CONFIG.positions.lake.z) ** 2);
    const isBeach = dLake > 48 && dLake < 66;

    if (isBeach && y < 3) {
      // Sandy beach around the lake
      r = 0.85; g = 0.78; b = 0.58;
    } else if (y < 0.5) {
      // Low / water edge: sandy
      r = 0.76; g = 0.70; b = 0.50;
    } else if (norm < 0.3) {
      // Low ground: lush green
      r = 0.15 + norm * 0.3;
      g = 0.45 + norm * 0.5;
      b = 0.08 + norm * 0.1;
    } else if (norm < 0.7) {
      // Mid: grass green to olive
      r = 0.25 + norm * 0.2;
      g = 0.50 + norm * 0.15;
      b = 0.12;
    } else {
      // High: rocky brown/grey
      r = 0.45 + norm * 0.2;
      g = 0.38 + norm * 0.15;
      b = 0.28 + norm * 0.15;
    }
    // Add subtle noise
    const noise = (Math.random() - 0.5) * 0.04;
    colors[i * 3]     = r + noise;
    colors[i * 3 + 1] = g + noise;
    colors[i * 3 + 2] = b + noise;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: false
  });

  terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  scene.add(terrain);
}

// Terrain height function — shapes the landscape
function getTerrainHeight(x, z) {
  const { maxHeight } = CONFIG.terrain;

  // Lake depression on the left — LARGER with gradual sandy shore
  const lakeX = CONFIG.positions.lake.x;
  const lakeZ = CONFIG.positions.lake.z;
  const distLake = Math.sqrt((x - lakeX) ** 2 + (z - lakeZ) ** 2);
  const lakeRadius = 58;
  const lakeBowl = distLake < lakeRadius ? -5.5 * (1 - distLake / lakeRadius) : 0;

  // General slope: rises from left to right
  const slope = ((x + 150) / 300) * maxHeight * 0.7;

  // Ridge / hill on the right side
  const ridgeDist = Math.abs(x - 70);
  const ridge = Math.max(0, (1 - ridgeDist / 40)) * maxHeight * 0.5;

  // Valley for canal path (a groove from dam to treatment plant)
  const canalZ = -15 + (x + 65) * (30 / 105);
  const distCanal = Math.abs(z - canalZ);
  const canalRange = x > -70 && x < 45;
  const canalGroove = (canalRange && distCanal < 10) ? -3 * (1 - distCanal / 10) : 0;

  // Rolling hills noise
  const n1 = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 4;
  const n2 = Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06 + 0.8) * 2;
  const n3 = Math.sin(x * 0.12 + 2.7) * Math.sin(z * 0.11 + 1.5) * 1;

  return Math.max(0, slope + lakeBowl + ridge + canalGroove + n1 + n2 + n3);
}

// Get height at a specific world XZ position (for placing objects)
function sampleTerrainHeight(x, z) {
  return getTerrainHeight(x, z);
}


// ═══════════════════════════════════════════════════════════
//  WATER BODIES
// ═══════════════════════════════════════════════════════════
function createLakeWater() {
  const lakeX = CONFIG.positions.lake.x;
  const lakeZ = CONFIG.positions.lake.z;
  const lakeR = 55; // Bigger lake radius

  // Lake surface
  const lakeGeo = new THREE.CircleGeometry(lakeR, 64);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x006994,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.3,
    thickness: 2
  });
  lakeWater = new THREE.Mesh(lakeGeo, lakeMat);
  lakeWater.position.set(lakeX, 1.5, lakeZ);
  lakeWater.receiveShadow = true;
  scene.add(lakeWater);

  // Lake bed (darker disc below)
  const bedGeo = new THREE.CircleGeometry(lakeR, 64);
  bedGeo.rotateX(-Math.PI / 2);
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x1A3A2A, roughness: 1 });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.position.set(lakeX, -1, lakeZ);
  scene.add(bed);

  // ── Islands in the lake ──
  const islandDefs = [
    { ox: -12, oz: -15, r: 6, h: 2.5 },
    { ox:  10, oz:   8, r: 4, h: 1.8 },
    { ox: -25, oz:  12, r: 5, h: 2.0 },
  ];
  const islandMat = new THREE.MeshStandardMaterial({ color: 0x5A8A3A, roughness: 0.85 });
  const sandMat   = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.9 });
  islandDefs.forEach(isl => {
    const ix = lakeX + isl.ox;
    const iz = lakeZ + isl.oz;
    // Sandy base (wider, flat)
    const baseGeo = new THREE.CylinderGeometry(isl.r + 1.5, isl.r + 2, 0.6, 16);
    const base = new THREE.Mesh(baseGeo, sandMat);
    base.position.set(ix, 1.8, iz);
    base.castShadow = true;
    scene.add(base);
    // Green mound
    const moundGeo = new THREE.SphereGeometry(isl.r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const mound = new THREE.Mesh(moundGeo, islandMat);
    mound.position.set(ix, 2.0, iz);
    mound.scale.y = isl.h / isl.r;
    mound.castShadow = true;
    scene.add(mound);
    // Palm tree on each island
    const palmGroup = createPalmTree();
    palmGroup.position.set(ix, 2.0 + isl.h * 0.5, iz);
    palmGroup.scale.setScalar(0.8 + Math.random() * 0.4);
    scene.add(palmGroup);
    swayingTrees.push(palmGroup);
  });

  // ── Beach people ──
  createBeachPeople(lakeX, lakeZ, lakeR);

  // Canal water strip (from dam to treatment)
  const canalPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-62, 3, -14),
    new THREE.Vector3(-45, 4, -8),
    new THREE.Vector3(-25, 5.5, 2),
    new THREE.Vector3(-5, 7, 12),
  ]);
  const canalWaterGeo = new THREE.TubeGeometry(canalPath, 40, 2.5, 8, false);
  const canalWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0088AA,
    transparent: true,
    opacity: 0.7,
    roughness: 0.15,
    metalness: 0.05,
  });
  const canalWaterMesh = new THREE.Mesh(canalWaterGeo, canalWaterMat);
  scene.add(canalWaterMesh);
}


// ═══════════════════════════════════════════════════════════
//  INFRASTRUCTURE (Placeholders)
// ═══════════════════════════════════════════════════════════
function createInfrastructure() {
  // ── Dam ──
  const damGroup = new THREE.Group();
  // Main wall
  const damWallGeo = new THREE.BoxGeometry(6, 14, 35);
  const damWallMat = new THREE.MeshStandardMaterial({ color: 0xA0A0A0, roughness: 0.6 });
  const damWall = new THREE.Mesh(damWallGeo, damWallMat);
  damWall.castShadow = true;
  damWall.receiveShadow = true;
  damGroup.add(damWall);
  // Buttresses
  for (let i = -2; i <= 2; i++) {
    const buttGeo = new THREE.BoxGeometry(10, 12, 2);
    const butt = new THREE.Mesh(buttGeo, damWallMat);
    butt.position.set(2, -1, i * 7);
    butt.castShadow = true;
    damGroup.add(butt);
  }
  // Top railing
  const railGeo = new THREE.BoxGeometry(3, 1.5, 37);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC });
  const rail = new THREE.Mesh(railGeo, railMat);
  rail.position.y = 7.5;
  damGroup.add(rail);

  const damPos = CONFIG.positions.dam;
  const damY = sampleTerrainHeight(damPos.x, damPos.z);
  damGroup.position.set(damPos.x, damY + 2, damPos.z);
  damGroup.rotation.y = 0.15;
  scene.add(damGroup);
  componentMeshes.dam = damGroup;

  // ── Canal Structure (banks) ──
  const canalGroup = new THREE.Group();
  const bankPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-60, 4, -13),
    new THREE.Vector3(-45, 5, -7),
    new THREE.Vector3(-25, 6.5, 3),
    new THREE.Vector3(-5, 8, 13),
  ]);
  // Left bank
  const bankOffsets = [-4, 4];
  bankOffsets.forEach(off => {
    const pts = [];
    for (let t = 0; t <= 1; t += 0.02) {
      const p = bankPath.getPoint(t);
      const tangent = bankPath.getTangent(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      pts.push(new THREE.Vector3(p.x + normal.x * off, p.y + 1, p.z + normal.z * off));
    }
    const bankCurve = new THREE.CatmullRomCurve3(pts);
    const bankGeo = new THREE.TubeGeometry(bankCurve, 40, 0.8, 6, false);
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9 });
    const bankMesh = new THREE.Mesh(bankGeo, bankMat);
    bankMesh.castShadow = true;
    canalGroup.add(bankMesh);
  });
  scene.add(canalGroup);
  componentMeshes.canal = canalGroup;

  // ── Water Treatment Plant ──
  const treatGroup = new THREE.Group();
  // Main building
  const treatBldgGeo = new THREE.BoxGeometry(16, 8, 12);
  const treatBldgMat = new THREE.MeshStandardMaterial({ color: 0xD0D0D0, roughness: 0.4, metalness: 0.2 });
  const treatBldg = new THREE.Mesh(treatBldgGeo, treatBldgMat);
  treatBldg.castShadow = true;
  treatBldg.receiveShadow = true;
  treatGroup.add(treatBldg);
  // Settling tanks (cylinders)
  for (let i = -1; i <= 1; i++) {
    const tankGeo = new THREE.CylinderGeometry(3.5, 3.5, 3, 24);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x5588AA, roughness: 0.3, metalness: 0.4 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(-2, -2, i * 8);
    tank.castShadow = true;
    treatGroup.add(tank);
  }
  // Roof detail
  const roofGeo = new THREE.BoxGeometry(17, 0.5, 13);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x445566 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 4.2;
  treatGroup.add(roof);

  const treatPos = CONFIG.positions.treatment;
  const treatY = sampleTerrainHeight(treatPos.x, treatPos.z);
  treatGroup.position.set(treatPos.x, treatY + 4, treatPos.z);
  scene.add(treatGroup);
  componentMeshes.treatment = treatGroup;

  // ── Pumping Station ──
  const pumpGroup = new THREE.Group();
  // Building
  const pumpBldgGeo = new THREE.BoxGeometry(10, 10, 8);
  const pumpBldgMat = new THREE.MeshStandardMaterial({ color: 0xCC8800, roughness: 0.5, metalness: 0.3 });
  const pumpBldg = new THREE.Mesh(pumpBldgGeo, pumpBldgMat);
  pumpBldg.castShadow = true;
  pumpBldg.receiveShadow = true;
  pumpGroup.add(pumpBldg);
  // Motor housing (cylinders on top)
  for (let i = -1; i <= 1; i += 2) {
    const motorGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 16);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.3, metalness: 0.6 });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(0, 7, i * 2.5);
    motor.castShadow = true;
    pumpGroup.add(motor);
  }
  // Pipe connectors
  const connGeo = new THREE.CylinderGeometry(1.2, 1.2, 14, 12);
  connGeo.rotateZ(Math.PI / 2);
  const connMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.4, metalness: 0.5 });
  const conn = new THREE.Mesh(connGeo, connMat);
  conn.position.set(0, 2, 0);
  pumpGroup.add(conn);

  const pumpPos = CONFIG.positions.pump;
  const pumpY = sampleTerrainHeight(pumpPos.x, pumpPos.z);
  pumpGroup.position.set(pumpPos.x, pumpY + 5, pumpPos.z);
  scene.add(pumpGroup);
  componentMeshes.pump = pumpGroup;

  // ── Homes (Destination) ──
  const homesGroup = new THREE.Group();
  const homePositions = [
    [0, 0], [8, 0], [16, 0], [-4, 8], [4, 8], [12, 8], [20, 8],
    [0, 16], [8, 16], [16, 16], [-4, -8], [4, -8], [12, -8]
  ];
  homePositions.forEach(([hx, hz]) => {
    const houseGroup = new THREE.Group();
    // Walls
    const wallGeo = new THREE.BoxGeometry(4, 3.5, 4);
    const wallColor = [0xE8D8C0, 0xD4C4A8, 0xF0E0C8, 0xC8B898][Math.floor(Math.random() * 4)];
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8 });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    houseGroup.add(walls);
    // Roof
    const roofGeo2 = new THREE.ConeGeometry(3.5, 2.5, 4);
    const roofColor = [0xB22222, 0x8B4513, 0xA0522D, 0xCD853F][Math.floor(Math.random() * 4)];
    const roofMat2 = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 });
    const roofMesh = new THREE.Mesh(roofGeo2, roofMat2);
    roofMesh.position.y = 3;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true;
    houseGroup.add(roofMesh);
    houseGroup.position.set(hx, 0, hz);
    homesGroup.add(houseGroup);
  });
  // Water tower
  const towerGeo = new THREE.CylinderGeometry(2, 1.5, 12, 12);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x6699AA, roughness: 0.3, metalness: 0.4 });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.set(-10, 6, 0);
  tower.castShadow = true;
  homesGroup.add(tower);
  const tankTopGeo = new THREE.CylinderGeometry(3, 2, 4, 12);
  const tankTop = new THREE.Mesh(tankTopGeo, towerMat);
  tankTop.position.set(-10, 13, 0);
  tankTop.castShadow = true;
  homesGroup.add(tankTop);

  const homesPos = CONFIG.positions.homes;
  const homesY = sampleTerrainHeight(homesPos.x, homesPos.z);
  homesGroup.position.set(homesPos.x, homesY + 1.8, homesPos.z);
  scene.add(homesGroup);
  componentMeshes.homes = homesGroup;


  // ── Garden with sprinkler between the houses ──
  const gardenX = homesPos.x + 5;
  const gardenZ = homesPos.z + 12;
  const gardenY = sampleTerrainHeight(gardenX, gardenZ);
  const gardenGroup = new THREE.Group();

  // Green garden lawn (large circular patch)
  const lawnGeo = new THREE.CircleGeometry(12, 24);
  lawnGeo.rotateX(-Math.PI / 2);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x3DA535, roughness: 0.9 });
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.position.y = 0.15;
  lawn.receiveShadow = true;
  gardenGroup.add(lawn);

  // Flower beds (colorful patches around the garden)
  const flowerColors = [0xFF4488, 0xFFDD00, 0xFF6600, 0xCC44FF, 0xFF3333, 0xFFAA00];
  for (let f = 0; f < 10; f++) {
    const fAngle = (f / 10) * Math.PI * 2;
    const fDist = 5 + Math.random() * 5;
    const fx = Math.cos(fAngle) * fDist;
    const fz = Math.sin(fAngle) * fDist;
    // Flower cluster (small colored spheres)
    for (let p = 0; p < 4; p++) {
      const petalGeo = new THREE.SphereGeometry(0.5 + Math.random() * 0.3, 6, 6);
      const petalMat = new THREE.MeshStandardMaterial({
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        roughness: 0.7
      });
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.position.set(fx + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.5, fz + (Math.random() - 0.5) * 1.5);
      petal.castShadow = true;
      gardenGroup.add(petal);
    }
    // Green stem/leaf under flowers
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 4);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(fx, 0.4, fz);
    gardenGroup.add(stem);
  }

  // Central sprinkler
  const sprinklerGroup = new THREE.Group();
  // Sprinkler pole
  const sPoleGeo = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
  const sPoleMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.6 });
  const sPole = new THREE.Mesh(sPoleGeo, sPoleMat);
  sPole.position.y = 2;
  sPole.castShadow = true;
  sprinklerGroup.add(sPole);

  // Sprinkler head (rotating arms)
  const sHeadGeo = new THREE.CylinderGeometry(0.6, 0.3, 0.5, 8);
  const sHeadMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
  const sHead = new THREE.Mesh(sHeadGeo, sHeadMat);
  sHead.position.y = 4.2;
  sprinklerGroup.add(sHead);

  // Sprinkler arms (cross shape)
  for (let a = 0; a < 4; a++) {
    const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 6);
    armGeo.rotateZ(Math.PI / 2);
    const arm = new THREE.Mesh(armGeo, sPoleMat);
    arm.position.y = 4.3;
    arm.rotation.y = (a / 4) * Math.PI;
    sprinklerGroup.add(arm);
  }

  // Sprinkler water spray (arching droplets)
  const sprayMat = new THREE.MeshStandardMaterial({
    color: 0x66CCFF, transparent: true, opacity: 0.5,
    emissive: 0x0088CC, emissiveIntensity: 0.2
  });
  for (let s = 0; s < 24; s++) {
    const sAngle = (s / 24) * Math.PI * 2;
    const sDist = 2 + Math.random() * 5;
    const sHeight = 4.5 - (sDist - 2) * 0.5; // Arc downward
    const dropGeo2 = new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 4, 4);
    const drop2 = new THREE.Mesh(dropGeo2, sprayMat);
    drop2.position.set(
      Math.cos(sAngle) * sDist,
      Math.max(0.5, sHeight + Math.random() * 0.5),
      Math.sin(sAngle) * sDist
    );
    sprinklerGroup.add(drop2);
  }

  sprinklerGroup.position.set(0, 0, 0);
  gardenGroup.add(sprinklerGroup);

  // Garden fence (low border)
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85 });
  for (let fa = 0; fa < 20; fa++) {
    const fAngle2 = (fa / 20) * Math.PI * 2;
    const postGeo = new THREE.BoxGeometry(0.3, 1.5, 0.3);
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(Math.cos(fAngle2) * 12.5, 0.75, Math.sin(fAngle2) * 12.5);
    post.castShadow = true;
    gardenGroup.add(post);
  }

  gardenGroup.position.set(gardenX, gardenY + 0.1, gardenZ);
  scene.add(gardenGroup);

  // ── Lake shore reeds (ring around the bigger lake) ──
  const lakeGroup = new THREE.Group();
  for (let a = 0; a < Math.PI * 2; a += 0.25) {
    const rx = Math.cos(a) * 53 + CONFIG.positions.lake.x;
    const rz = Math.sin(a) * 53 + CONFIG.positions.lake.z;
    // Cluster of 2-4 reeds per point
    const count = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < count; j++) {
      const ox = (Math.random() - 0.5) * 2;
      const oz = (Math.random() - 0.5) * 2;
      const reedH = 2 + Math.random() * 2.5;
      const reedGeo = new THREE.CylinderGeometry(0.08, 0.15, reedH, 5);
      const reedMat = new THREE.MeshStandardMaterial({ color: 0x4A7A3A });
      const reed = new THREE.Mesh(reedGeo, reedMat);
      reed.position.set(rx + ox, 2 + reedH * 0.3, rz + oz);
      reed.rotation.x = (Math.random() - 0.5) * 0.15;
      reed.rotation.z = (Math.random() - 0.5) * 0.15;
      lakeGroup.add(reed);
    }
  }
  scene.add(lakeGroup);
  componentMeshes.lake = lakeGroup;

  // Store lake water for target ref
  componentMeshes.lakeWater = lakeWater;
}


// ═══════════════════════════════════════════════════════════
//  PIPELINE (connecting pipes from treatment → pump → homes)
// ═══════════════════════════════════════════════════════════
function createPipeline() {
  // Full route path from lake to homes
  const routePoints = [];
  const segments = [
    { key: 'dam',       pos: CONFIG.positions.dam,       yOff: 5 },
    { key: 'treatment', pos: CONFIG.positions.treatment,  yOff: 6 },
    { key: 'pump',      pos: CONFIG.positions.pump,       yOff: 4 },
    { key: 'homes',     pos: CONFIG.positions.homes,      yOff: 4 },
  ];

  // Start from dam outlet area
  const startX = CONFIG.positions.dam.x + 5;
  const startZ = CONFIG.positions.dam.z;
  routePoints.push(new THREE.Vector3(startX, sampleTerrainHeight(startX, startZ) + 4, startZ));

  // Intermediate points from treatment to pump to homes
  segments.forEach(seg => {
    const y = sampleTerrainHeight(seg.pos.x, seg.pos.z) + seg.yOff;
    routePoints.push(new THREE.Vector3(seg.pos.x, y, seg.pos.z));
  });

  // Extend pipe to the rooftop water tank (108, 46)
  const homesRoofY = sampleTerrainHeight(105, 45) + 1.8 + 23; // building roof
  routePoints.push(new THREE.Vector3(108, homesRoofY + 7, 46)); // tank inlet height

  pipelinePath = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0.3);

  // Split pipeline into two colored segments:
  // BLUE section (gravity-fed: treatment → pump)
  const gravityPoints = [];
  for (let t = 0.25; t <= 0.55; t += 0.01) {
    gravityPoints.push(pipelinePath.getPoint(t));
  }
  const gravityCurve = new THREE.CatmullRomCurve3(gravityPoints);
  const gravityGeo = new THREE.TubeGeometry(gravityCurve, 40, 1.0, 12, false);
  const gravityMat = new THREE.MeshStandardMaterial({
    color: 0x4488BB,
    roughness: 0.25,
    metalness: 0.6
  });
  const gravityPipe = new THREE.Mesh(gravityGeo, gravityMat);
  gravityPipe.castShadow = true;
  scene.add(gravityPipe);

  // ORANGE section (pumped uphill: pump → homes)
  const pumpedPoints = [];
  for (let t = 0.54; t <= 1; t += 0.01) {
    pumpedPoints.push(pipelinePath.getPoint(t));
  }
  const pumpedCurve = new THREE.CatmullRomCurve3(pumpedPoints);
  const pumpedGeo = new THREE.TubeGeometry(pumpedCurve, 50, 1.0, 12, false);
  const pumpedMat = new THREE.MeshStandardMaterial({
    color: 0xDD7700,
    roughness: 0.25,
    metalness: 0.6
  });
  const pumpedPipe = new THREE.Mesh(pumpedGeo, pumpedMat);
  pumpedPipe.castShadow = true;
  scene.add(pumpedPipe);

  // Group both pipe segments for the component reference
  const pipeGroup = new THREE.Group();
  pipeGroup.add(gravityPipe);
  pipeGroup.add(pumpedPipe);
  componentMeshes.pipes = pipeGroup;

  // Clean closed pipes — no rings, no flanges. Just smooth tubes with pylons.

  // Pipe supports / pylons under elevated sections
  for (let t = 0.35; t <= 0.95; t += 0.12) {
    const pos = pipelinePath.getPoint(t);
    const groundY = sampleTerrainHeight(pos.x, pos.z);
    const pipeY = pos.y;
    if (pipeY - groundY > 2) {
      const height = pipeY - groundY;
      const pylonGeo = new THREE.BoxGeometry(0.8, height, 0.8);
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 });
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(pos.x, groundY + height / 2, pos.z);
      pylon.castShadow = true;
      scene.add(pylon);
    }
  }
}


// ═══════════════════════════════════════════════════════════
//  WATER STORAGE TANK (receives water at pipe terminus)
// ═══════════════════════════════════════════════════════════
function createWaterTap() {
  // Water storage tank sitting ON the building roof.
  // Building center: (105, 45), model height ~23 units (19.3 * scale 1.2),
  // building base Y = terrainHeight(105,45) + 1.8
  const homesTerrainY = sampleTerrainHeight(105, 45);
  const roofY = homesTerrainY + 1.8 + 23; // approximate roof height

  // Position near center of the building roof
  const tankX = 108;
  const tankZ = 46;

  const tankGroup = new THREE.Group();

  // ── Short support legs (sitting on the roof) ──
  const legH = 4;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.6 });
  const legPositions = [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]];
  legPositions.forEach(([lx, lz]) => {
    const legGeo = new THREE.CylinderGeometry(0.5, 0.6, legH, 8);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, legH / 2, lz);
    leg.castShadow = true;
    tankGroup.add(leg);
  });

  // ── Main tank body (large blue cylinder) ──
  const tankBodyH = 10;
  const tankR = 6;
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x2277AA, roughness: 0.4, metalness: 0.3 });
  const tankBodyGeo = new THREE.CylinderGeometry(tankR, tankR, tankBodyH, 24);
  const tankBody = new THREE.Mesh(tankBodyGeo, tankMat);
  tankBody.position.y = legH + tankBodyH / 2;
  tankBody.castShadow = true;
  tankBody.receiveShadow = true;
  tankGroup.add(tankBody);

  // ── Tank bottom plate ──
  const bottomGeo = new THREE.CylinderGeometry(tankR + 0.3, tankR + 0.3, 0.6, 24);
  const bottomMat = new THREE.MeshStandardMaterial({ color: 0x3388BB, roughness: 0.3, metalness: 0.4 });
  const bottom = new THREE.Mesh(bottomGeo, bottomMat);
  bottom.position.y = legH;
  bottom.castShadow = true;
  tankGroup.add(bottom);

  // ── Domed roof ──
  const domeGeo = new THREE.SphereGeometry(tankR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x2288BB, roughness: 0.35, metalness: 0.3 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = legH + tankBodyH;
  dome.castShadow = true;
  tankGroup.add(dome);

  // ── White band around tank ──
  const bandGeo = new THREE.CylinderGeometry(tankR + 0.15, tankR + 0.15, 2, 24, 1, true);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.6, side: THREE.DoubleSide });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.y = legH + tankBodyH * 0.55;
  tankGroup.add(band);

  // ── Inlet pipe stub (where pipeline connects) ──
  const inletGeo = new THREE.CylinderGeometry(1.0, 1.0, 8, 12);
  inletGeo.rotateZ(Math.PI / 2);
  const inletMat = new THREE.MeshStandardMaterial({ color: 0xDD7700, roughness: 0.3, metalness: 0.6 });
  const inlet = new THREE.Mesh(inletGeo, inletMat);
  inlet.position.set(-tankR - 4, legH + 3, 0);
  inlet.castShadow = true;
  tankGroup.add(inlet);

  tankGroup.position.set(tankX, roofY, tankZ);
  scene.add(tankGroup);
}


// ═══════════════════════════════════════════════════════════
//  WATER FLOW PARTICLES
// ═══════════════════════════════════════════════════════════
function createFlowParticles() {
  if (!pipelinePath) return;
  const particleCount = 600;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const offsets = new Float32Array(particleCount); // t-offset along path

  for (let i = 0; i < particleCount; i++) {
    offsets[i] = Math.random();
    const p = pipelinePath.getPoint(offsets[i]);
    positions[i * 3] = p.x + (Math.random() - 0.5) * 1.5;
    positions[i * 3 + 1] = p.y + (Math.random() - 0.5) * 1.5;
    positions[i * 3 + 2] = p.z + (Math.random() - 0.5) * 1.5;

    // Color gradient: BLUE for gravity-fed, ORANGE/AMBER for pumped uphill
    const t = offsets[i];
    if (t < 0.4) {
      // Gravity-fed section (lake → dam → canal → treatment): cool blue
      colors[i * 3]     = 0.0;
      colors[i * 3 + 1] = 0.45 + t * 0.8;
      colors[i * 3 + 2] = 1.0;
    } else if (t < 0.55) {
      // Transition zone (treatment → pump): blue fading to orange
      const blend = (t - 0.4) / 0.15;
      colors[i * 3]     = blend * 1.0;
      colors[i * 3 + 1] = 0.7 - blend * 0.25;
      colors[i * 3 + 2] = 1.0 - blend * 0.8;
    } else {
      // Pumped uphill section (pump → pipeline → homes): vivid orange/amber
      const progress = (t - 0.55) / 0.45;
      colors[i * 3]     = 1.0;
      colors[i * 3 + 1] = 0.45 + progress * 0.2;
      colors[i * 3 + 2] = 0.0 + progress * 0.15;
    }

    sizes[i] = 1.5 + Math.random() * 2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // Custom shader for round, glowing particles
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() }
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (80.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.2, 0.5, d);
        gl_FragColor = vec4(vColor, alpha * 0.8);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  flowParticles.push({ mesh: points, offsets, speed: 0.04 });

  // Lake shimmer particles
  const lakeParticleCount = 200;
  const lakeGeo = new THREE.BufferGeometry();
  const lakePos = new Float32Array(lakeParticleCount * 3);
  const lakeSizes = new Float32Array(lakeParticleCount);
  const lakeCol = new Float32Array(lakeParticleCount * 3);
  for (let i = 0; i < lakeParticleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 52;  // bigger lake
    lakePos[i * 3] = Math.cos(angle) * radius + CONFIG.positions.lake.x;
    lakePos[i * 3 + 1] = 2 + Math.random() * 0.5;
    lakePos[i * 3 + 2] = Math.sin(angle) * radius + CONFIG.positions.lake.z;
    lakeSizes[i] = 1 + Math.random() * 1.5;
    lakeCol[i * 3] = 0.3;
    lakeCol[i * 3 + 1] = 0.7 + Math.random() * 0.3;
    lakeCol[i * 3 + 2] = 1.0;
  }
  lakeGeo.setAttribute('position', new THREE.BufferAttribute(lakePos, 3));
  lakeGeo.setAttribute('size', new THREE.BufferAttribute(lakeSizes, 1));
  lakeGeo.setAttribute('color', new THREE.BufferAttribute(lakeCol, 3));
  const lakePts = new THREE.Points(lakeGeo, mat.clone());
  scene.add(lakePts);
}


// ═══════════════════════════════════════════════════════════
//  PALM TREE (for islands and beach — swaying)
// ═══════════════════════════════════════════════════════════
function createPalmTree() {
  const tree = new THREE.Group();
  // Curved trunk
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.3, 2, 0.1),
    new THREE.Vector3(0.1, 4.5, -0.2),
    new THREE.Vector3(-0.2, 6.5, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 12, 0.25, 8, false);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  tree.add(trunk);

  // Palm fronds (6 leaves radiating out)
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const frondShape = new THREE.Shape();
    frondShape.moveTo(0, 0);
    frondShape.quadraticCurveTo(1.5, 0.6, 4, -0.5);
    frondShape.quadraticCurveTo(1.5, -0.2, 0, 0);
    const frondGeo = new THREE.ShapeGeometry(frondShape);
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.set(-0.2, 6.3, 0);
    frond.rotation.set(-0.4, angle, 0);
    frond.castShadow = true;
    tree.add(frond);
  }
  // Coconuts
  const cocoMat = new THREE.MeshStandardMaterial({ color: 0x5C3317 });
  for (let i = 0; i < 3; i++) {
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), cocoMat);
    coco.position.set(-0.2 + (Math.random() - 0.5) * 0.5, 6.0, (Math.random() - 0.5) * 0.5);
    tree.add(coco);
  }
  return tree;
}


// ═══════════════════════════════════════════════════════════
//  BEACH PEOPLE (relaxing near the lake)
// ═══════════════════════════════════════════════════════════
function createBeachPeople(lakeX, lakeZ, lakeR) {
  const skinColors = [0xD2956A, 0x8D5524, 0xC68642, 0xF1C27D, 0x6B3E26];
  const clothColors = [0xFF4444, 0x4488FF, 0xFFCC00, 0x44CC44, 0xFF88CC, 0xFFFFFF, 0xFF6600];

  // People sitting/lying on the beach
  const beachSpots = [];
  for (let i = 0; i < 14; i++) {
    const angle = -Math.PI * 0.3 + Math.random() * Math.PI * 1.4; // around the shore
    const dist = lakeR + 2 + Math.random() * 8;
    beachSpots.push({ angle, dist });
  }

  beachSpots.forEach((spot, idx) => {
    const bx = lakeX + Math.cos(spot.angle) * spot.dist;
    const bz = lakeZ + Math.sin(spot.angle) * spot.dist;
    const by = sampleTerrainHeight(bx, bz);
    if (by < 0) return;

    const person = new THREE.Group();
    const skinColor = skinColors[Math.floor(Math.random() * skinColors.length)];
    const clothColor = clothColors[Math.floor(Math.random() * clothColors.length)];
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
    const clothMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.7 });

    if (idx % 3 === 0) {
      // Standing person
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), skinMat);
      head.position.y = 1.55;
      head.castShadow = true;
      person.add(head);
      // Body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8), clothMat);
      body.position.y = 1.0;
      body.castShadow = true;
      person.add(body);
      // Legs
      const legMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.8 });
      for (let s = -1; s <= 1; s += 2) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), legMat);
        leg.position.set(s * 0.1, 0.3, 0);
        person.add(leg);
      }
    } else if (idx % 3 === 1) {
      // Sitting person
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), skinMat);
      head.position.y = 0.9;
      head.castShadow = true;
      person.add(head);
      // Torso (leaning back slightly)
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.55, 8), clothMat);
      torso.position.y = 0.55;
      torso.rotation.x = -0.3;
      torso.castShadow = true;
      person.add(torso);
      // Legs out
      const legMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.6, 6), legMat);
      legs.position.set(0, 0.15, 0.25);
      legs.rotation.x = Math.PI / 2.5;
      person.add(legs);
    } else {
      // Lying person (sunbathing)
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skinMat);
      head.position.set(0, 0.2, -0.4);
      person.add(head);
      // Body lying flat
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.9, 8), clothMat);
      body.position.y = 0.15;
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      person.add(body);
      // Beach towel
      const towelColor = [0xFF4466, 0x44AAFF, 0xFFDD44][Math.floor(Math.random() * 3)];
      const towelGeo = new THREE.PlaneGeometry(0.8, 1.2);
      const towelMat = new THREE.MeshStandardMaterial({ color: towelColor, roughness: 0.95, side: THREE.DoubleSide });
      const towel = new THREE.Mesh(towelGeo, towelMat);
      towel.rotation.x = -Math.PI / 2;
      towel.position.y = 0.02;
      person.add(towel);
    }

    // Face the person toward the lake
    const toLake = Math.atan2(lakeZ - bz, lakeX - bx);
    person.rotation.y = toLake + (Math.random() - 0.5) * 0.6;
    person.position.set(bx, by + 0.05, bz);
    person.scale.setScalar(1.0 + Math.random() * 0.3);
    scene.add(person);
  });

  // Beach umbrellas
  const umbrellaColors = [0xFF4444, 0x4488FF, 0xFFCC00, 0xFF8800];
  for (let i = 0; i < 4; i++) {
    const angle = -Math.PI * 0.1 + (i / 4) * Math.PI * 1.2;
    const dist = lakeR + 4 + Math.random() * 5;
    const ux = lakeX + Math.cos(angle) * dist;
    const uz = lakeZ + Math.sin(angle) * dist;
    const uy = sampleTerrainHeight(ux, uz);
    if (uy < 0) continue;

    const umbrella = new THREE.Group();
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 })
    );
    pole.position.y = 1.5;
    umbrella.add(pole);
    // Canopy
    const canopyGeo = new THREE.ConeGeometry(1.8, 0.6, 12, 1, true);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: umbrellaColors[i],
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 2.9;
    canopy.castShadow = true;
    umbrella.add(canopy);

    umbrella.position.set(ux, uy, uz);
    scene.add(umbrella);
  }

  // Beach palm trees (swaying)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = lakeR + 6 + Math.random() * 10;
    const tx = lakeX + Math.cos(angle) * dist;
    const tz = lakeZ + Math.sin(angle) * dist;
    const ty = sampleTerrainHeight(tx, tz);
    if (ty < 0.5) continue;

    const palm = createPalmTree();
    palm.position.set(tx, ty, tz);
    palm.scale.setScalar(0.9 + Math.random() * 0.5);
    scene.add(palm);
    swayingTrees.push(palm);
  }
}


// ═══════════════════════════════════════════════════════════
//  3D LABELS
// ═══════════════════════════════════════════════════════════
function createLabels() {
  const labelDefs = [
    { key: 'lake', text: 'WATER SOURCE (LAKE)', cls: '', yOff: 10 },
    { key: 'dam', text: 'DAM', cls: 'label-dam', yOff: 16 },
    { key: 'canal', text: 'OPEN CANAL', cls: 'label-canal', yOff: 8 },
    { key: 'treatment', text: 'TREATMENT PLANT', cls: 'label-treatment', yOff: 14 },
    { key: 'pump', text: 'PUMPING STATION', cls: 'label-pump', yOff: 16 },
    { key: 'pipes', text: 'PRESSURIZED PIPELINE', cls: 'label-pipes', yOff: 8 },
    { key: 'homes', text: 'DESTINATION (HOMES)', cls: 'label-homes', yOff: 12 },
  ];

  labelDefs.forEach(def => {
    const div = document.createElement('div');
    div.className = `label-3d ${def.cls}`;
    div.textContent = def.text;
    const labelObj = new CSS2DObject(div);

    const pos = CONFIG.positions[def.key];
    const y = sampleTerrainHeight(pos.x, pos.z) + def.yOff;
    labelObj.position.set(pos.x, y, pos.z);
    scene.add(labelObj);
    labels3D[def.key] = labelObj;
  });
}


// ═══════════════════════════════════════════════════════════
//  LOAD SKETCHFAB MODELS (replace placeholders if found)
// ═══════════════════════════════════════════════════════════
function loadModels() {
  const loader = new GLTFLoader();

  // Models with actual glTF files (extracted from Sketchfab ZIPs)
  // Dimensions measured from gltf accessor bounds:
  //   Dam:   4.6 x 1.3 x 0.3   → scale ~8 to fit ~35 unit span
  //   Canal: 39.6 x 13.7 x 25.1 → scale ~1.5 to fit canal segment
  //   Homes: 61.0 x 54.6 x 19.3 → scale ~0.45 for ~28 unit footprint
  //   Lake:  494 x 972 x 45.7   → scale ~0.08 to fit ~76 unit lake area
  const modelDefs = [
    {
      key: 'dam',
      file: 'dam/scene.gltf',
      scale: 8,
      yOff: 7,
      rotY: Math.PI / 2 + 0.15,
    },
    {
      key: 'canal',
      file: 'canal/scene.gltf',
      scale: 1.4,
      yOff: 2,
      rotY: Math.PI * 0.6,
    },
    {
      key: 'homes',
      file: 'homes/scene.gltf',
      scale: 1.2,         // Scaled UP — larger than treatment plant
      yOff: 1.8,
      rotY: 0,
    },
    {
      key: 'lake',
      file: 'lake/scene.gltf',
      scale: 0.08,
      yOff: 1,
      rotY: 0,
    },
  ];

  // Track loaded model count for status
  let loaded = 0;
  const total = modelDefs.length;

  modelDefs.forEach(def => {
    loader.load(
      `/models/${def.file}`,
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(def.scale);

        // Apply rotation
        if (def.rotY) model.rotation.y = def.rotY;

        // Apply clipping planes to every mesh material in the model
        // This cleanly cuts off any geometry extending beyond the terrain
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach(mat => {
                mat.clippingPlanes = clipPlanes;
                mat.clipShadows = true;
              });
            }
          }
        });

        // Position at the component location
        const pos = CONFIG.positions[def.key];
        const y = sampleTerrainHeight(pos.x, pos.z) + def.yOff;
        model.position.set(pos.x, y, pos.z);

        // Remove placeholder, add real model
        if (componentMeshes[def.key]) {
          scene.remove(componentMeshes[def.key]);
        }
        scene.add(model);
        componentMeshes[def.key] = model;

        loaded++;
        console.log(`Loaded model [${loaded}/${total}]: ${def.file}`);
      },
      (progress) => {
        if (progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          console.log(`Loading ${def.key}: ${pct}%`);
        }
      },
      (error) => {
        console.warn(`Could not load ${def.file}, keeping placeholder:`, error.message);
      }
    );
  });

  // Pump, Tank, Treatment: no glTF available — keep enhanced placeholders
  // (waterpump.zip had only reference images, tank zip had only textures,
  //  treatment was a .max file not loadable in Three.js)
  console.log('Pump, Tank & Treatment: using built-in placeholders (no glTF models available)');
}


// ═══════════════════════════════════════════════════════════
//  ELEVATION PROFILE CHART
// ═══════════════════════════════════════════════════════════
function drawElevationProfile() {
  const canvas = document.getElementById('elevationChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Sample elevation from lake to homes
  const samples = 100;
  const elevations = [];
  const keys = ['lake', 'dam', 'canal', 'treatment', 'pump', 'pipes', 'homes'];

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    // Interpolate x,z from lake to homes
    const startX = CONFIG.positions.lake.x;
    const startZ = CONFIG.positions.lake.z;
    const endX = CONFIG.positions.homes.x;
    const endZ = CONFIG.positions.homes.z;
    const x = startX + (endX - startX) * t;
    const z = startZ + (endZ - startZ) * t;
    elevations.push(sampleTerrainHeight(x, z));
  }

  const maxElev = Math.max(...elevations);
  const minElev = Math.min(...elevations);

  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let y = 10; y < h; y += 15) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Elevation fill
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, 'rgba(0,180,216,0.4)');
  gradient.addColorStop(0.3, 'rgba(0,230,118,0.4)');
  gradient.addColorStop(0.5, 'rgba(123,47,247,0.4)');
  gradient.addColorStop(0.7, 'rgba(249,168,37,0.4)');
  gradient.addColorStop(1, 'rgba(255,107,107,0.4)');

  ctx.beginPath();
  ctx.moveTo(0, h);
  elevations.forEach((elev, i) => {
    const x = (i / (samples - 1)) * w;
    const y = h - ((elev - minElev) / (maxElev - minElev + 1)) * (h - 10) - 5;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Elevation line
  ctx.beginPath();
  elevations.forEach((elev, i) => {
    const x = (i / (samples - 1)) * w;
    const y = h - ((elev - minElev) / (maxElev - minElev + 1)) * (h - 10) - 5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
  lineGrad.addColorStop(0, '#00B4D8');
  lineGrad.addColorStop(0.3, '#00E676');
  lineGrad.addColorStop(0.5, '#7B2FF7');
  lineGrad.addColorStop(0.7, '#F9A825');
  lineGrad.addColorStop(1, '#FF6B6B');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Component markers
  const markerPositions = [0, 0.17, 0.33, 0.49, 0.68, 0.83, 1.0];
  const markerColors = ['#00B4D8', '#FF6D00', '#00E676', '#7B2FF7', '#F9A825', '#E040FB', '#FF6B6B'];
  const markerLabels = ['L', 'D', 'C', 'T', 'P', '|', 'H'];
  markerPositions.forEach((mt, idx) => {
    const si = Math.floor(mt * (samples - 1));
    const mx = mt * w;
    const my = h - ((elevations[si] - minElev) / (maxElev - minElev + 1)) * (h - 10) - 5;
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fillStyle = markerColors[idx];
    ctx.fill();
    ctx.font = 'bold 8px Inter';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(markerLabels[idx], mx, my - 8);
  });
}


// ═══════════════════════════════════════════════════════════
//  UI INTERACTIONS
// ═══════════════════════════════════════════════════════════
function setupUI() {
  // Component buttons → fly to
  document.querySelectorAll('.component-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;

      // Highlight active
      document.querySelectorAll('.component-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Fly camera to component
      flyTo(target);

      // Show info card
      showInfoCard(target);
    });
  });

  // Toggle flow
  document.getElementById('btn-toggle-flow').addEventListener('click', function() {
    flowActive = !flowActive;
    this.classList.toggle('active');
    flowParticles.forEach(fp => { fp.mesh.visible = flowActive; });
  });

  // Toggle labels
  document.getElementById('btn-toggle-labels').addEventListener('click', function() {
    labelsVisible = !labelsVisible;
    this.classList.toggle('active');
    Object.values(labels3D).forEach(l => { l.visible = labelsVisible; });
  });

  // Day/Night
  document.getElementById('btn-day-night').addEventListener('click', function() {
    isNight = !isNight;
    this.classList.toggle('active');
    if (isNight) {
      sunLight.intensity = 0.3;
      sunLight.color.setHex(0x4466AA);
      ambientLight.intensity = 0.15;
      hemiLight.intensity = 0.15;
      scene.fog.color.setHex(0x0A1628);
      renderer.toneMappingExposure = 0.5;
    } else {
      sunLight.intensity = 1.8;
      sunLight.color.setHex(0xFFE4B5);
      ambientLight.intensity = 0.4;
      hemiLight.intensity = 0.6;
      scene.fog.color.setHex(0x87CEEB);
      renderer.toneMappingExposure = 1.2;
    }
  });

  // Reset camera
  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    animateCamera(
      new THREE.Vector3(0, 120, 200),
      new THREE.Vector3(0, 5, 15),
      1500
    );
    // Clear active states
    document.querySelectorAll('.component-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('info-card').classList.add('hidden');
  });

  // Info card close
  document.getElementById('info-close').addEventListener('click', () => {
    document.getElementById('info-card').classList.add('hidden');
  });

  // Guided tour
  document.getElementById('btn-tour').addEventListener('click', startGuidedTour);
}

function flyTo(key) {
  const pos = CONFIG.positions[key];
  if (!pos) return;
  const y = sampleTerrainHeight(pos.x, pos.z);
  const targetPos = new THREE.Vector3(pos.x, y + 5, pos.z);
  const camOffset = new THREE.Vector3(pos.x + 30, y + 40, pos.z + 40);
  animateCamera(camOffset, targetPos, 1200);
}

function animateCamera(newCamPos, newTarget, duration) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();

  function update() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic

    camera.position.lerpVectors(startPos, newCamPos, ease);
    controls.target.lerpVectors(startTarget, newTarget, ease);
    controls.update();

    if (t < 1) requestAnimationFrame(update);
  }
  update();
}

function showInfoCard(key) {
  const data = COMPONENT_DATA[key];
  if (!data) return;
  document.getElementById('info-icon').textContent = data.icon;
  document.getElementById('info-title').textContent = data.name;
  document.getElementById('info-desc').textContent = data.desc;

  const statsEl = document.getElementById('info-stats');
  statsEl.innerHTML = '';
  Object.entries(data.stats).forEach(([label, value]) => {
    const div = document.createElement('div');
    div.className = 'info-stat';
    div.innerHTML = `<div class="info-stat-value">${value}</div><div class="info-stat-label">${label}</div>`;
    statsEl.appendChild(div);
  });

  document.getElementById('info-card').classList.remove('hidden');
}


// ═══════════════════════════════════════════════════════════
//  GUIDED TOUR
// ═══════════════════════════════════════════════════════════
function startGuidedTour() {
  if (tourRunning) return;
  tourRunning = true;
  const btn = document.getElementById('btn-tour');
  btn.disabled = true;
  btn.innerHTML = '<span>&#x1F3AC;</span> Tour in progress...';

  const stops = ['lake', 'dam', 'canal', 'treatment', 'pump', 'pipes', 'homes'];
  let idx = 0;

  function nextStop() {
    if (idx >= stops.length) {
      tourRunning = false;
      btn.disabled = false;
      btn.innerHTML = '<span>&#x1F3AC;</span> Start Guided Tour';
      // Return to overview
      animateCamera(
        new THREE.Vector3(0, 120, 200),
        new THREE.Vector3(0, 5, 15),
        1500
      );
      document.getElementById('info-card').classList.add('hidden');
      document.querySelectorAll('.component-btn').forEach(b => b.classList.remove('active'));
      return;
    }

    const key = stops[idx];
    // Highlight sidebar button
    document.querySelectorAll('.component-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.target === key);
    });
    flyTo(key);
    showInfoCard(key);
    idx++;
    setTimeout(nextStop, 3500);
  }

  nextStop();
}


// ═══════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Update controls
  controls.update();

  // Animate water flow particles
  if (flowActive && pipelinePath) {
    flowParticles.forEach(fp => {
      const positions = fp.mesh.geometry.attributes.position;
      const count = positions.count;
      for (let i = 0; i < count; i++) {
        fp.offsets[i] += fp.speed * delta;
        if (fp.offsets[i] > 1) fp.offsets[i] -= 1;

        const t = fp.offsets[i];
        const p = pipelinePath.getPoint(t);
        // Add slight wavering
        const wave = Math.sin(elapsed * 3 + i * 0.1) * 0.3;
        positions.setXYZ(i, p.x + wave, p.y + wave * 0.5, p.z + wave);
      }
      positions.needsUpdate = true;
      fp.mesh.material.uniforms.uTime.value = elapsed;
    });
  }

  // Animate lake water
  if (lakeWater) {
    lakeWater.position.y = 1.5 + Math.sin(elapsed * 0.5) * 0.15;
    lakeWater.material.opacity = 0.75 + Math.sin(elapsed * 0.8) * 0.05;
  }

  // Sway trees in the wind
  swayingTrees.forEach((tree, i) => {
    const phase = i * 0.7;  // Different phase per tree
    tree.rotation.x = Math.sin(elapsed * 0.8 + phase) * 0.015;
    tree.rotation.z = Math.cos(elapsed * 0.6 + phase) * 0.02;
  });

  // Render
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}


// ═══════════════════════════════════════════════════════════
//  VEGETATION (trees / bushes for visual richness)
// ═══════════════════════════════════════════════════════════
function addVegetation() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 });
  const leafColors = [0x228B22, 0x2E8B57, 0x3CB371, 0x006400, 0x32CD32];

  for (let i = 0; i < 150; i++) {
    const x = (Math.random() - 0.5) * CONFIG.terrain.width * 0.9;
    const z = (Math.random() - 0.5) * CONFIG.terrain.depth * 0.9;
    const y = sampleTerrainHeight(x, z);

    // Skip if in lake (bigger radius now), canal, or too low
    const distLake = Math.sqrt((x - CONFIG.positions.lake.x) ** 2 + (z - CONFIG.positions.lake.z) ** 2);
    if (distLake < 68) continue;  // larger exclusion for bigger lake + beach
    if (y < 1) continue;

    // Skip if too close to infrastructure
    let tooClose = false;
    Object.values(CONFIG.positions).forEach(p => {
      if (Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2) < 18) tooClose = true;
    });
    if (tooClose) continue;

    const treeGroup = new THREE.Group();
    const trunkH = 2 + Math.random() * 3;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, trunkH, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    // Canopy (2-3 spheres)
    const canopyCount = 2 + Math.floor(Math.random() * 2);
    for (let c = 0; c < canopyCount; c++) {
      const radius = 1.2 + Math.random() * 1.5;
      const canopyGeo = new THREE.SphereGeometry(radius, 8, 8);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: leafColors[Math.floor(Math.random() * leafColors.length)],
        roughness: 0.85
      });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(
        (Math.random() - 0.5) * 1.2,
        trunkH + radius * 0.5 + c * 0.8,
        (Math.random() - 0.5) * 1.2
      );
      canopy.castShadow = true;
      treeGroup.add(canopy);
    }

    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(0.7 + Math.random() * 0.6);
    scene.add(treeGroup);
    swayingTrees.push(treeGroup);  // All trees sway in the wind
  }
}


// ═══════════════════════════════════════════════════════════
//  DECORATIVE ELEMENTS
// ═══════════════════════════════════════════════════════════
function addDecorations() {
  // Rocks scattered around
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * CONFIG.terrain.width * 0.85;
    const z = (Math.random() - 0.5) * CONFIG.terrain.depth * 0.85;
    const y = sampleTerrainHeight(x, z);
    if (y < 1) continue;

    const distLake = Math.sqrt((x - CONFIG.positions.lake.x) ** 2 + (z - CONFIG.positions.lake.z) ** 2);
    if (distLake < 65) continue;  // bigger lake

    const rockGeo = new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.5, 0);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, y + 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  }

  // Direction arrow markers along pipeline — blue for gravity, orange for pumped
  if (pipelinePath) {
    const gravityArrowMat = new THREE.MeshStandardMaterial({ color: 0x00B4D8, emissive: 0x00B4D8, emissiveIntensity: 0.5 });
    const pumpedArrowMat  = new THREE.MeshStandardMaterial({ color: 0xFF8C00, emissive: 0xFF8C00, emissiveIntensity: 0.5 });
    for (let t = 0.05; t <= 0.95; t += 0.1) {
      const pos = pipelinePath.getPoint(t);
      const tangent = pipelinePath.getTangent(t);
      const arrowGeo = new THREE.ConeGeometry(0.6, 1.5, 6);
      // Use orange arrows for pumped (uphill) section, blue for gravity-fed
      const mat = t >= 0.5 ? pumpedArrowMat : gravityArrowMat;
      const arrow = new THREE.Mesh(arrowGeo, mat);
      arrow.position.copy(pos);
      arrow.position.y += 3;
      const lookTarget = pos.clone().add(tangent);
      arrow.lookAt(lookTarget);
      arrow.rotateX(Math.PI / 2);
      scene.add(arrow);
    }
  }
}


// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════
init();
addVegetation();
addDecorations();
