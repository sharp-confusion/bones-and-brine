/* Bones & Brine — renders the Blender-made pirate parts (models/pirates.glb) with three.js.
   Portraits are drawn once per look + pose into an image and cached, so the table stays fast on phones. */
// Loaded as a normal script (not a module file) so it also works when index.html is opened
// straight from disk; three.js itself comes from the CDN through the import map in index.html.
(() => {
const SCRIPT_BASE = (document.currentScript && document.currentScript.src) || location.href;
let THREE, GLTFLoader, DRACOLoader;

const HAT_CLIP = { tricorn: 1.97, bicorne: 1.99, bandana: 1.9, admiral: 1.97 };   // hair is trimmed under hats
const SHIRT = '#efe6d2';

// What is on the table / in the hands for each pose
const POSES = {
  rest:   ['table', 'arms_rest', 'cup_down'],
  lift:   ['table', 'arms_lift', 'cup_lift', 'dice_table'],
  drink:  ['table', 'arms_drink', 'cup_down', 'held_drink'],
  rum:    ['table', 'arms_drink', 'cup_down', 'held_rum'],
  smokes: ['table', 'arms_smoke', 'cup_down', 'held_cigarette'],
  cigar:  ['table', 'arms_rest', 'cup_down', 'held_cigar'],
  steak:  ['table', 'arms_eat', 'cup_side', 'held_plate', 'held_fork']
};
// A pose can also be an explicit part list: 'parts:table,arms_rest,cup_down,table_drink'
const poseParts = pose => !pose ? [] : pose.startsWith('parts:') ? pose.slice(6).split(',') : (POSES[pose] || []);
const RAISED = new Set(['arms_drink', 'arms_smoke', 'arms_eat', 'arms_holddrink', 'arms_cigarhand', 'arms_lift']);
const MOUTH = [0.0, -0.62, 1.29];   // Blender space
const TABLE_W = 288, TABLE_H = 256, FACE = 256;

function shade(hex, amt) { return new THREE.Color(hex).multiplyScalar(1 - amt); }

function toonGradient() {
  const data = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function makeOutline() {
  const m = new THREE.MeshBasicMaterial({ color: 0x1a0f08, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.014;');
  };
  return m;
}

class Pirates {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.parts = {};
    this.mats = {};
    const grad = toonGradient();
    const outline = makeOutline();
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 99);
    const cache = new Map();
    const toon = src => {
      if (cache.has(src)) return cache.get(src);
      const m = new THREE.MeshToonMaterial({
        color: src.color.clone(), gradientMap: grad, side: THREE.DoubleSide,
        emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
        emissiveIntensity: src.emissiveIntensity ?? 1,
        transparent: src.transparent, opacity: src.opacity, depthWrite: !src.transparent
      });
      m.name = src.name;
      if (src.name === 'Hair') m.clippingPlanes = [this.clip];
      this.mats[src.name] = m;
      cache.set(src, m);
      return m;
    };
    gltf.scene.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material); });
    gltf.scene.children.slice().forEach(o => {
      this.parts[o.name] = o;
      const meshes = [];
      o.traverse(m => { if (m.isMesh) meshes.push(m); });
      meshes.forEach(m => {
        const hull = new THREE.Mesh(m.geometry, outline);   // glass gets an outline too, so it reads on the table
        hull.raycast = () => {};
        m.add(hull);
      });
      this.root.add(o);
    });
  }

  names(prefix) {
    return Object.keys(this.parts).filter(n => n.startsWith(prefix + '_')).map(n => n.slice(prefix.length + 1));
  }

  apply(look, pose) {
    const want = new Set(['base_' + look.base, 'top_' + look.top]);
    if (look.hair && look.hair !== 'bald') want.add('hair_' + look.hair);
    if (look.hat && look.hat !== 'none') want.add('hat_' + look.hat);
    if (look.trinket && look.trinket !== 'none') want.add('trinket_' + look.trinket);
    (look.cosmetics || []).forEach(c => want.add('cos_' + c));
    const parts = poseParts(pose).map(n => look.cup === 'gold' ? n.replace(/^cup_/, 'cupgold_') : n);
    parts.forEach(n => want.add(n));
    // the parrot sits on the right shoulder, so it hops off while that arm is raised
    if (parts.some(n => RAISED.has(n))) want.delete('trinket_parrot');
    for (const [n, o] of Object.entries(this.parts)) o.visible = want.has(n);
    const set = (name, col) => { if (this.mats[name]) this.mats[name].color.copy(col); };
    set('Skin', new THREE.Color(look.skin));
    set('SkinShade', shade(look.skin, 0.22));
    set('Hair', new THREE.Color(look.hairColor));
    set('Cloth', new THREE.Color(look.topColor));
    set('Sleeve', new THREE.Color(look.top === 'vest' ? SHIRT : look.top === 'striped' ? shade(look.topColor, 0) : look.topColor));
    set('Hat', new THREE.Color(look.hatColor));
    this.clip.constant = HAT_CLIP[look.hat] ?? 99;
  }

  showOnly(name) { for (const [n, o] of Object.entries(this.parts)) o.visible = n === name; }
}

function makeStage(width, height, canvas) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a3440, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.4); rim.position.set(4, 3, -5); scene.add(rim);
  const cam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 50);
  return { renderer, scene, cam };
}

// Blender (x, y, z) -> glTF/three (x, z, -y)
const b2t = ([x, y, z]) => new THREE.Vector3(x, z, -y);

function frame(cam, kind) {
  if (kind === 'face') {            // head and shoulders, for lists and small badges
    cam.left = -1.08; cam.right = 1.08; cam.top = 1.1; cam.bottom = -1.06;
    cam.position.set(0.7, 1.85, 7); cam.lookAt(0, 1.55, 0);
  } else if (kind === 'table') {    // pirate sitting at the table with arms, cup and props
    cam.left = -1.62; cam.right = 1.62; cam.top = 1.64; cam.bottom = -1.24;
    cam.position.set(0.6, 3.3, 7); cam.lookAt(0, 1.05, 0.35);
  } else if (kind === 'locker') {   // Captain's Locker: seated at the table, square view
    cam.left = -1.55; cam.right = 1.55; cam.top = 1.68; cam.bottom = -1.42;
    cam.position.set(0.5, 3.0, 7); cam.lookAt(0, 1.1, 0.35);
  } else {                          // the whole bust
    cam.left = -1.42; cam.right = 1.42; cam.top = 1.45; cam.bottom = -1.39;
    cam.position.set(0.9, 1.95, 7); cam.lookAt(0, 1.28, 0);
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

async function init() {
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  ({ DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js'));
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  let gltf;
  if (window.PIRATES_GLB_B64) {
    // models/pirates.js embeds the model, so it loads even from a double-clicked index.html (file://)
    const bin = atob(window.PIRATES_GLB_B64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    gltf = await loader.parseAsync(buf.buffer, '');
    delete window.PIRATES_GLB_B64;
  } else {
    gltf = await loader.loadAsync(new URL('../models/pirates.glb', SCRIPT_BASE).href);
  }
  const P = new Pirates(gltf);
  const stage = makeStage(FACE, FACE);
  stage.scene.add(P.root);
  const cache = new Map();

  function shoot(w, h) {
    stage.renderer.setSize(w, h, false);
    stage.renderer.render(stage.scene, stage.cam);
    return stage.renderer.domElement.toDataURL('image/png');
  }

  /** Portrait image (data URL). pose: 'face' (default) or a table pose such as rest, lift, drink, smokes. */
  function portrait(look, pose = 'face') {
    const key = pose + JSON.stringify(look);
    if (cache.has(key)) return cache.get(key);
    const table = pose !== 'face';
    P.apply(look, table ? pose : null);
    P.root.rotation.y = table ? -0.12 : -0.18;
    frame(stage.cam, table ? 'table' : 'face');
    const url = table ? shoot(TABLE_W, TABLE_H) : shoot(FACE, FACE);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, url);
    return url;
  }

  /** Where something sits on a table portrait, as fractions of its width/height.
      what: 'mouth', or a part name whose glowing ember (or any material) to find, e.g. 'hand_cigarette_M'. */
  const anchorCache = {};
  function anchor(what, matName = 'Ember') {
    const key = what + '|' + matName;
    if (key in anchorCache) return anchorCache[key];
    frame(stage.cam, 'table');
    P.root.rotation.y = -0.12;
    P.root.updateMatrixWorld(true);
    let world = null;
    if (what === 'mouth') world = b2t(MOUTH).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.12);
    else {
      const o = P.parts[what];
      if (o) {
        const box = new THREE.Box3();
        o.traverse(m => { if (m.isMesh && [].concat(m.material).some(x => x.name === matName)) box.expandByObject(m); });
        if (!box.isEmpty()) world = box.getCenter(new THREE.Vector3());
      }
    }
    if (!world) return (anchorCache[key] = null);
    const p = world.project(stage.cam);
    return (anchorCache[key] = { x: (p.x + 1) / 2, y: (1 - p.y) / 2 });
  }

  const propCache = new Map();
  function prop(name) {
    if (propCache.has(name)) return propCache.get(name);
    P.showOnly('prop_' + name);
    P.root.rotation.y = -0.5;
    const c = stage.cam;
    c.left = -0.55; c.right = 0.55; c.top = 0.55; c.bottom = -0.55;
    c.position.set(0, 1.6, 6); c.lookAt(0, 0, 0); c.updateProjectionMatrix();
    const url = shoot(FACE, FACE);
    propCache.set(name, url);
    return url;
  }

  /** Live, drag-to-spin preview for the Captain's Locker. */
  function viewer(container, getLook) {
    const canvas = document.createElement('canvas');
    canvas.className = 'avatar-live';
    container.innerHTML = '';
    container.appendChild(canvas);
    const size = Math.min(320, container.clientWidth || 260);
    const v = makeStage(size * 2, size * 2, canvas);
    canvas.style.width = canvas.style.height = size + 'px';
    let rot = -0.3, vel = 0, dragging = false, lastX = 0, alive = true, idle = 0;
    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; vel = (e.clientX - lastX) * 0.012; rot += vel; lastX = e.clientX; idle = 0; });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    function loop() {
      if (!alive || !canvas.isConnected) { v.renderer.dispose(); return; }
      if (!dragging) { vel *= 0.92; rot += vel; idle++; if (idle > 120) rot += Math.sin(Date.now() / 1400) * 0.003; }
      v.scene.add(P.root);
      P.apply(getLook(), 'rest');
      P.root.rotation.y = rot;
      frame(v.cam, 'locker');
      v.renderer.render(v.scene, v.cam);
      stage.scene.add(P.root);
      requestAnimationFrame(loop);
    }
    loop();
    return { stop() { alive = false; } };
  }

  return { portrait, prop, viewer, anchor, poses: Object.keys(POSES), parts: k => P.names(k), TABLE_W, TABLE_H };
}

init().then(api => {
  window.Avatar3D = Object.assign(api, { ready: true });
  window.dispatchEvent(new Event('avatar3d-ready'));
}).catch(err => {
  console.warn('3D pirates unavailable, using drawn portraits:', err);
  window.dispatchEvent(new Event('avatar3d-failed'));
});
})();
