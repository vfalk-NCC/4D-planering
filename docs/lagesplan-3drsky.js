/* Renderingsmotorn – fysikaliskt baserad himmel och miljöbelysning (egen kod, inga extra bibliotek).
   Himlen räknas i linjärt HDR: enkelspridning (Rayleigh + Mie) med luftmassa efter Kasten–Young, solens transmission genom atmosfären
   (röd sol vid horisonten), soldisk och moln (fraktalt brus på ett molnlager, rör sig med tiden i filmen). Samma himmel
   → bakgrund i bilden och → miljökarta (PMREM) som ytorna reflekterar och som ger dem himlens färg.
   Prefix l3sk. Används av l3rnRender (lagesplan-3drender.js). */

const l3sk = { envKey: "", env: null, pm: null, mat: null };

const L3SK_COMMON = `
  uniform vec3 uSun; uniform float uTurb, uCloud, uTime, uDisc, uHaze, uWet; uniform vec3 uGround;
  varying vec3 vDir;
  const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6); const float HR = 8000.0, HM = 1200.0;
  float airmass(float mu) { mu = max(mu, 0.0); return 1.0 / (mu + 0.15 * pow(93.885 - degrees(acos(clamp(mu, 0.0, 1.0))), -1.253)); }
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  /* himmelsfärg i riktning d (linjärt, solen = ca 1 på en yta vinkelrät mot solen i klart väder) */
  vec3 skyAbove(vec3 d, bool withDisc) {
    float mu = max(d.z, 0.0), sunMu = max(uSun.z, 0.0);
    float betaM = 21e-6 * (0.35 + 0.5 * uTurb) , am = airmass(mu + 0.012);
    vec3 ext = BR * HR + vec3(betaM * HM);
    vec3 tauV = ext * am, tauSun = ext * airmass(sunMu + 0.004);
    vec3 tSun = exp(-tauSun);
    float cosT = dot(d, uSun), g = 0.76;
    float pR = 3.0 / (16.0 * 3.14159265) * (1.0 + cosT * cosT);
    float pM = (1.0 - g * g) / (4.0 * 3.14159265 * pow(1.0 + g * g - 2.0 * g * cosT, 1.5));
    vec3 betaMv = vec3(betaM);
    vec3 scat = (BR * pR + betaMv * pM) / (BR + betaMv);
    vec3 Lin = 17.0 * tSun * scat * (1.0 - exp(-tauV));                       // spridd ljus längs synlinjen
    Lin += vec3(0.012, 0.016, 0.026) * (1.0 - tSun) * (0.4 + 0.6 * mu);         // flerspridning: blå himmel även när solen står lågt
    Lin *= mix(vec3(1.0), vec3(1.35, 0.78, 0.5), pow(1.0 - sunMu, 4.0) * (1.0 - mu * 0.6));      // lågt solläge: varmare horisont
    vec3 col = Lin;
    if (withDisc && uDisc > 0.0 && d.z > -0.02) {                               // soldisk
      float k = smoothstep(0.99985, 0.99995, cosT); col += uDisc * 20.0 * tSun * k * exp(-tauV * 0.5);
    }
    // moln: ett lager på fast höjd, fraktalt brus, täckning uCloud, lysta av solen
    if (uCloud > 0.0 && d.z > 0.015) {
      vec2 p = d.xy / (d.z + 0.15) * 1.9 + vec2(uTime * 0.012, uTime * 0.005);
      float n = fbm(p) * 0.65 + 0.35 * fbm(p * 3.1 + 7.0), cov = mix(0.78, 0.30, uCloud);
      float dens = smoothstep(cov, cov + 0.20, n) * smoothstep(0.015, 0.14, d.z);
      float lit = clamp(0.55 + 0.45 * uSun.z + 0.25 * max(cosT, 0.0), 0.2, 1.4);
      vec3 cl = (0.55 + 0.75 * lit) * (0.35 + 0.65 * tSun) * mix(vec3(1.0), vec3(0.55, 0.58, 0.64), clamp(uCloud * 1.3 - 0.35, 0.0, 1.0));
      cl *= 0.9 + 0.1 * vnoise(p * 6.0); col = mix(col, cl * (0.55 + 0.25 * sunMu), dens * (0.55 + 0.45 * uCloud));
    }
    return col;
  }
  vec3 skyRad(vec3 d, bool withDisc) {
    if (d.z > 0.0) return skyAbove(d, withDisc);
    float sunMu = max(uSun.z, 0.0);
    vec3 hor = skyAbove(normalize(vec3(d.xy, 0.0) + vec3(0.0, 0.0, 0.004)), false);          // under horisonten: mark i dis
    vec3 tSun = exp(-(BR * HR + vec3(21e-6 * HM)) * airmass(sunMu + 0.004));
    return mix(hor, uGround * (0.3 + 0.55 * sunMu) * (0.4 + 0.6 * tSun), smoothstep(0.0, -0.2, d.z));
  }`;
const L3SK_VERT = "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const L3SK_FRAG = L3SK_COMMON + "void main() { vec3 c = skyRad(normalize(vDir), true); c = mix(c, vec3(dot(c, vec3(0.3, 0.55, 0.15))) * vec3(0.9, 0.95, 1.0), uHaze * 0.5); gl_FragColor = vec4(c, 1.0); }";
const L3SK_FRAG_ENV = L3SK_COMMON + "void main() { vec3 c = skyRad(normalize(vDir), false); gl_FragColor = vec4(c, 1.0); }";

function l3skUniforms(E, sunDir, time) {
  return { uSun: { value: sunDir.clone().normalize() }, uTurb: { value: 0.35 + (E.haze || 0) * 0.8 + (E.clouds || 0) * 0.3 }, uCloud: { value: E.clouds || 0 }, uTime: { value: time || 0 }, uDisc: { value: E.clouds > 0.6 ? 0 : 1 - (E.clouds || 0) * 1.4 }, uHaze: { value: E.haze || 0 }, uWet: { value: E.wet || 0 }, uGround: { value: new THREE.Vector3(0.30, 0.34, 0.24) } };
}
/* Himmelsmesh att lägga i scenen som bakgrund (följer kameran, ritas först). */
function l3skMesh(E, sunDir, time, radius) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ uniforms: l3skUniforms(E, sunDir, time), vertexShader: L3SK_VERT, fragmentShader: L3SK_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  m.scale.setScalar(radius); m.renderOrder = -1000; m.frustumCulled = false; m.userData.noHit = true; m.userData.l3skSky = true; m.raycast = () => {};
  return m;
}
/* Miljökarta (PMREM) av samma himmel utan soldisk; cachas på solläge och väder. */
function l3skEnv(r, E, sunDir, time) {
  const key = [sunDir.x.toFixed(2), sunDir.y.toFixed(2), sunDir.z.toFixed(2), (E.clouds || 0).toFixed(2), (E.haze || 0).toFixed(2), Math.round((time || 0) / 8)].join("|");
  if (l3sk.env && l3sk.envKey === key) return l3sk.env;
  if (!l3sk.pm) l3sk.pm = new THREE.PMREMGenerator(r);
  const sc = new THREE.Scene(), m = new THREE.Mesh(new THREE.SphereGeometry(50, 40, 24), new THREE.ShaderMaterial({ uniforms: l3skUniforms(E, sunDir, time), vertexShader: L3SK_VERT, fragmentShader: L3SK_FRAG_ENV, side: THREE.BackSide, depthWrite: false, fog: false }));
  sc.add(m); const prev = l3sk.env; l3sk.env = l3sk.pm.fromScene(sc, 0.0).texture; l3sk.envKey = key; if (prev) prev.dispose(); m.geometry.dispose(); m.material.dispose(); return l3sk.env;
}
function l3skDispose() { if (l3sk.env) { l3sk.env.dispose(); l3sk.env = null; l3sk.envKey = ""; } if (l3sk.pm) { l3sk.pm.dispose(); l3sk.pm = null; } }
