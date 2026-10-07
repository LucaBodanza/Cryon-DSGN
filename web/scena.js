// CRYON DSGN — scena 3D: pittogramma Procryon estruso + campo di punti (stile copertina brochure)
import * as THREE from './vendor/three.module.min.js';
import { SVGLoader } from './vendor/SVGLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export async function avviaScena(canvas) {
  // Prestazioni: su schermi ad alta densità il costo vero è il numero di pixel. Quindi: niente antialias dove i pixel sono già fitti,
  // densità limitata e regolata da sola in base ai tempi misurati, scena ferma quando è coperta da un'altra schermata.
  const DPR_MAX = Math.min(devicePixelRatio || 1, 1.75);
  let DPR_MIN = Math.min(1, DPR_MAX), leggero = false, onLento = null;
  let dpr = Math.min(DPR_MAX, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(dpr);
  // scheda grafica: quelle integrate più vecchie partono direttamente in grafica leggera
  let gpu = '';
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); gpu = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { /* non disponibile */ }
  const gpuDebole = /SwiftShader|llvmpipe|Basic Render|Software/i.test(gpu) || (/Intel/i.test(gpu) && !/Iris\s*\(?R?\)?\s*Xe|Arc/i.test(gpu));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x161314);
  scene.fog = new THREE.Fog(0x161314, 14, 34);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.4, 13);

  // ---------------- pittogramma estruso (ogni tratto è un pezzo separato: si assemblano nell'intro)
  const svgTxt = await (await fetch('web/img/pittogramma.svg')).text();
  const data = new SVGLoader().parse(svgTxt);
  const gruppo = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xF29C1F, metalness: 0.6, roughness: 0.24, envMapIntensity: 1.25 });   // senza clearcoat: metà del lavoro per pixel
  const pezzi = [];
  const box = new THREE.Box3();
  for (const p of data.paths) {
    for (const sh of SVGLoader.createShapes(p)) {
      const g = new THREE.ExtrudeGeometry(sh, { depth: 70, bevelEnabled: true, bevelThickness: 6, bevelSize: 5, bevelSegments: 2, curveSegments: 8 });
      const m = new THREE.Mesh(g, mat);
      gruppo.add(m); pezzi.push(m);
    }
  }
  box.setFromObject(gruppo);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = 4.2 / Math.max(s.x, s.y);
  for (const m of pezzi) {
    m.geometry.translate(-c.x, -c.y, -35);
    m.geometry.computeBoundingBox();
    const cc = m.geometry.boundingBox.getCenter(new THREE.Vector3());
    m.userData.fine = new THREE.Vector3(0, 0, 0);
    m.userData.da = new THREE.Vector3(cc.x * 2.4, cc.y * 2.4, 900 + Math.random() * 500);
    m.userData.rot = (Math.random() - .5) * 2.2;
  }
  gruppo.scale.set(k, -k, k);           // l'SVG ha l'asse Y verso il basso
  const perno = new THREE.Group();
  perno.add(gruppo);
  scene.add(perno);

  // luci
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2); key.position.set(5, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5AA0E0, 1.1); rim.position.set(-6, -2, -4); scene.add(rim);      // luci direzionali: più leggere delle puntiformi
  const warm = new THREE.DirectionalLight(0xF29C1F, 0.9); warm.position.set(4, -4, 5); scene.add(warm);

  // ---------------- campo di punti (griglia ondulata)
  const NX = 150, NZ = 70, pos = new Float32Array(NX * NZ * 3);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const q = (i * NZ + j) * 3;
    pos[q] = (i - NX / 2) * 0.32; pos[q + 1] = -3.2; pos[q + 2] = -j * 0.32 + 6;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { t: { value: 0 }, col: { value: new THREE.Color(0x8a8384) }, acc: { value: new THREE.Color(0xF29C1F) }, mouse: { value: new THREE.Vector2() } },
    vertexShader: `uniform float t; uniform vec2 mouse; varying float vA; varying float vH;
      void main(){ vec3 p = position;
        float w = sin(p.x*.35 + t*.6)*.22 + cos(p.z*.42 - t*.45)*.22;
        float d = length(p.xz - vec2(mouse.x*10., -6.)); float r = exp(-d*d*.02)*.9;
        p.y += w + r; vH = r;
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = (2.6 + r*3.) * (12. / -mv.z); vA = smoothstep(34., 6., -mv.z); }`,
    fragmentShader: `uniform vec3 col; uniform vec3 acc; varying float vA; varying float vH;
      void main(){ vec2 c = gl_PointCoord-.5; if(dot(c,c)>.25) discard; gl_FragColor = vec4(mix(col, acc, clamp(vH*1.2,0.,1.)), vA*.75); }`
  });
  const punti = new THREE.Points(pg, pmat);
  scene.add(punti);

  // polvere fluttuante
  const NP = 500, pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = (Math.random() - .5) * 30; pp[i * 3 + 1] = (Math.random() - .3) * 14; pp[i * 3 + 2] = (Math.random() - .7) * 20; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const polvere = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x6f696a, size: 0.035, transparent: true, opacity: .7, depthWrite: false }));
  scene.add(polvere);

  // ---------------- stato e animazione
  const stato = { modo: 'intro', t0: performance.now(), mx: 0, my: 0, tx: 0, ty: 0, target: { x: 2.6, y: 0.9, z: 0, s: 1 }, cur: { x: 0, y: 0.6, z: 0, s: 1.25 } };
  const modi = {
    intro: { x: 0, y: 0.7, z: 0, s: 1.3 },
    home: { x: 3.9, y: 1.2, z: -1, s: .82 },
    catalogo: { x: 13, y: 6.5, z: -22, s: .3 },
    sfoglia: { x: 0, y: 6, z: -14, s: .3 },
    sotto: { x: 10, y: 5, z: -16, s: .3 },
  };
  addEventListener('pointermove', e => { stato.tx = e.clientX / innerWidth * 2 - 1; stato.ty = e.clientY / innerHeight * 2 - 1; });
  function ridimensiona() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', ridimensiona); ridimensiona();

  let pausa = false;
  const ease = x => 1 - Math.pow(1 - x, 4);
  // quanto lavora la scena in ogni schermata: piena in home, a metà ritmo nella scheda catalogo, ferma quando è coperta
  const RITMO = { intro: 1, home: 1, catalogo: 2, sfoglia: 0, sotto: 0 };
  let nFrame = 0, cambio = performance.now(), ultimo = 0, somma = 0, conta = 0, buone = 0, fermo = false;
  function adatta(dt) {              // densità di pixel adattiva: scende se i fotogrammi sono lenti, risale solo se restano veloci a lungo
    if (dt > 250) return;            // scheda tornata visibile, primo fotogramma: non conta
    somma += dt; conta++;
    if (conta < 24 && !(conta >= 6 && somma / conta > 45)) return;     // se va molto piano decido subito, senza aspettare
    const media = somma / conta; somma = 0; conta = 0;
    let nuovo = dpr;
    if (media > 30 && dpr <= DPR_MIN && !leggero && onLento) { onLento(); return; }      // già al minimo e ancora lenta: passo alla grafica leggera
    if (media > 45 && dpr > DPR_MIN) { nuovo = DPR_MIN; buone = 0; }
    else if (media > 21 && dpr > DPR_MIN) { nuovo = Math.max(DPR_MIN, dpr - 0.25); buone = 0; }
    else if (media < 12.5 && dpr < DPR_MAX) { if (++buone >= 4) { nuovo = Math.min(DPR_MAX, dpr + 0.25); buone = 0; } }
    else buone = 0;
    if (nuovo !== dpr) { dpr = nuovo; renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (pausa) return;
    let ritmo = RITMO[stato.modo] ?? 1;
    if (leggero && ritmo === 1 && stato.modo !== 'intro') ritmo = 2;      // grafica leggera: 30 fotogrammi al secondo bastano
    if (ritmo === 0 && now - cambio > 1600) {          // schermata che copre la scena: finita la transizione disegno un ultimo fotogramma e mi fermo
      if (fermo) return;
      fermo = true;
    } else fermo = false;
    nFrame++;
    if (ritmo === 2 && nFrame % 2) return;
    if (ultimo && !fermo) adatta((now - ultimo) / (ritmo === 2 ? 2 : 1));
    ultimo = now;
    const t = (now - stato.t0) / 1000;
    stato.mx += (stato.tx - stato.mx) * .04; stato.my += (stato.ty - stato.my) * .04;
    // assemblaggio dei pezzi nei primi 2,4 s
    const a = Math.min(1, Math.max(0, (t - 0.2) / 2.2));
    pezzi.forEach((m, i) => {
      const e = ease(Math.min(1, Math.max(0, a * 1.25 - i * 0.06)));
      m.position.lerpVectors(m.userData.da, m.userData.fine, e);
      m.rotation.z = m.userData.rot * (1 - e);
    });
    // schermi stretti o verticali (tablet): il simbolo si rimpicciolisce e si sposta per non coprire i testi
    const base = modi[stato.modo] || modi.home, asp = camera.aspect, f = Math.min(1, asp / 1.75);
    const tg = stato.modo === 'home' && asp < 1 ? { x: 1.5 * asp, y: -0.5, z: -2, s: 0.44 * asp }
      : (stato.modo === 'intro' ? { ...base, s: base.s * Math.max(0.5, f) } : { x: base.x * f, y: base.y + (stato.modo === 'home' ? (1 - f) * 0.8 : 0), z: base.z, s: base.s * (0.55 + 0.45 * f) });
    for (const kk of ['x', 'y', 'z', 's']) stato.cur[kk] += (tg[kk] - stato.cur[kk]) * .045;
    perno.position.set(stato.cur.x + stato.mx * .35, stato.cur.y - stato.my * .25 + Math.sin(t * .8) * .08, stato.cur.z);
    perno.scale.setScalar(stato.cur.s);
    perno.rotation.y = Math.sin(t * .35) * .45 + stato.mx * .35;
    perno.rotation.x = -.08 + stato.my * .12;
    pmat.uniforms.t.value = t; pmat.uniforms.mouse.value.set(stato.mx, stato.my);
    polvere.rotation.y = t * .01;
    camera.position.x = stato.mx * .4; camera.position.y = .4 - stato.my * .25; camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { pausa = document.hidden; });
  return {
    modo(m) { if (m !== stato.modo) { stato.modo = m; cambio = performance.now(); fermo = false; ultimo = 0; } },
    info() { return { dpr, fermo, modo: stato.modo, fotogrammi: nFrame, gpu, gpuDebole, leggero }; },
    gpuDebole,
    seLenta(f) { onLento = f; },
    leggero(v) {
      leggero = !!v; DPR_MIN = Math.min(leggero ? 0.75 : 1, DPR_MAX); buone = 0; somma = 0; conta = 0;
      dpr = leggero ? Math.min(dpr, 1) : Math.min(DPR_MAX, 1.5);
      renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); fermo = false;
    },
    pausa(v) { pausa = v; },
  };
}
