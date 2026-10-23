//! IFC → trianglar. Hanterar de geometrityper som BIM-program oftast skriver ut:
//! extruderade profiler, triangulerade/polygonala ytnät, facetterade brep, mappade instanser och
//! (förenklat) booleska resultat. Övriga typer räknas i `skipped` och redovisas för användaren.
use crate::step::{Step, V};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

pub type P3 = [f64; 3];

#[derive(Clone, Copy)]
pub struct M { pub r: [[f64; 3]; 3], pub t: P3 }
impl M {
    pub fn ident() -> M { M { r: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], t: [0.0; 3] } }
    pub fn apply(&self, p: P3) -> P3 {
        [self.r[0][0] * p[0] + self.r[0][1] * p[1] + self.r[0][2] * p[2] + self.t[0],
         self.r[1][0] * p[0] + self.r[1][1] * p[1] + self.r[1][2] * p[2] + self.t[1],
         self.r[2][0] * p[0] + self.r[2][1] * p[1] + self.r[2][2] * p[2] + self.t[2]]
    }
    pub fn mul(&self, o: &M) -> M {
        let mut r = [[0.0; 3]; 3];
        for i in 0..3 { for j in 0..3 { r[i][j] = self.r[i][0] * o.r[0][j] + self.r[i][1] * o.r[1][j] + self.r[i][2] * o.r[2][j]; } }
        let t = self.apply(o.t);
        M { r, t }
    }
    /// Invers för styv transform (ortonormal rotation).
    pub fn inv_rigid(&self) -> M {
        let mut r = [[0.0; 3]; 3];
        for i in 0..3 { for j in 0..3 { r[i][j] = self.r[j][i]; } }
        let t = [-(r[0][0] * self.t[0] + r[0][1] * self.t[1] + r[0][2] * self.t[2]), -(r[1][0] * self.t[0] + r[1][1] * self.t[1] + r[1][2] * self.t[2]), -(r[2][0] * self.t[0] + r[2][1] * self.t[1] + r[2][2] * self.t[2])];
        M { r, t }
    }
}

fn nrm(v: P3) -> P3 { let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt(); if l < 1e-12 { v } else { [v[0] / l, v[1] / l, v[2] / l] } }
fn crs(a: P3, b: P3) -> P3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn dt(a: P3, b: P3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn sub(a: P3, b: P3) -> P3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
pub struct Prof { pub outer: Vec<[f64; 2]>, pub holes: Vec<Vec<[f64; 2]>> }
pub fn signed_area(p: &[[f64; 2]]) -> f64 { let n = p.len(); (0..n).map(|i| { let j = (i + 1) % n; p[i][0] * p[j][1] - p[j][0] * p[i][1] }).sum::<f64>() / 2.0 }

/// Cirkelbåge genom tre punkter (samplad).
pub fn arc3(p0: P3, p1: P3, p2: P3) -> Vec<P3> {
    let u = sub(p1, p0); let v = sub(p2, p0); let w = crs(u, v); let w2 = dt(w, w); if w2 < 1e-18 { return vec![p0, p2]; }
    let a = crs(v, w); let b = crs(w, u); let (uu, vv) = (dt(u, u), dt(v, v)); let c = [p0[0] + (uu * a[0] + vv * b[0]) / (2.0 * w2), p0[1] + (uu * a[1] + vv * b[1]) / (2.0 * w2), p0[2] + (uu * a[2] + vv * b[2]) / (2.0 * w2)];
    let r = dt(sub(p0, c), sub(p0, c)).sqrt(); let wn = nrm(w); let e1 = nrm(sub(p0, c)); let e2 = crs(wn, e1);
    let ang = |p: P3| { let d = sub(p, c); dt(d, e2).atan2(dt(d, e1)) }; let (t1, mut t2) = (ang(p1), ang(p2));
    if t2 > 0.0 { if !(t1 > 0.0 && t1 < t2) { t2 -= std::f64::consts::TAU; } } else if !(t1 < 0.0 && t1 > t2) { t2 += std::f64::consts::TAU; }
    let n = ((t2.abs() / (std::f64::consts::PI / 18.0)).ceil() as usize).max(2);
    (0..=n).map(|i| { let t = t2 * i as f64 / n as f64; [c[0] + r * (e1[0] * t.cos() + e2[0] * t.sin()), c[1] + r * (e1[1] * t.cos() + e2[1] * t.sin()), c[2] + r * (e1[2] * t.cos() + e2[2] * t.sin())] }).collect()
}

fn seg_cross(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    let cr = |p: [f64; 2], q: [f64; 2], r: [f64; 2]| (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if a == c || a == d || b == c || b == d { return false; }
    let (d1, d2, d3, d4) = (cr(a, b, c), cr(a, b, d), cr(c, d, a), cr(c, d, b)); ((d1 > 0.0) != (d2 > 0.0)) && ((d3 > 0.0) != (d4 > 0.0)) && d1 != 0.0 && d2 != 0.0 && d3 != 0.0 && d4 != 0.0
}

/// Triangulerar en kontur med hål: loops[0] = yttre (moturs), övriga = hål (medurs). Returnerar index i de sammanslagna punkterna (loops efter varandra).
pub fn triangulate_holes(loops: &[Vec<[f64; 2]>]) -> Vec<[usize; 3]> {
    if loops.len() == 1 { return ear_clip(&loops[0]); }
    let mut offs = vec![0usize]; for l in loops { offs.push(offs[offs.len() - 1] + l.len()); }
    let flat: Vec<[f64; 2]> = loops.iter().flatten().copied().collect(); let mut poly: Vec<usize> = (0..loops[0].len()).collect();
    let maxx = |l: &Vec<[f64; 2]>| l.iter().map(|p| p[0]).fold(f64::MIN, f64::max);
    let mut hs: Vec<usize> = (1..loops.len()).collect(); hs.sort_by(|a, b| maxx(&loops[*b]).partial_cmp(&maxx(&loops[*a])).unwrap_or(std::cmp::Ordering::Equal));
    for h in hs { let hl = &loops[h]; if hl.len() < 3 { continue; }
        let hi = (0..hl.len()).max_by(|a, b| hl[*a][0].partial_cmp(&hl[*b][0]).unwrap_or(std::cmp::Ordering::Equal)).unwrap(); let m = hl[hi];
        let mut cands: Vec<usize> = (0..poly.len()).collect(); cands.sort_by(|a, b| { let (pa, pb) = (flat[poly[*a]], flat[poly[*b]]); ((pa[0] - m[0]).powi(2) + (pa[1] - m[1]).powi(2)).partial_cmp(&((pb[0] - m[0]).powi(2) + (pb[1] - m[1]).powi(2))).unwrap_or(std::cmp::Ordering::Equal) });
        let mut chosen = cands[0];
        for &c in &cands { let v = flat[poly[c]]; let mut ok = true;
            for i in 0..poly.len() { let (e0, e1) = (flat[poly[i]], flat[poly[(i + 1) % poly.len()]]); if seg_cross(m, v, e0, e1) { ok = false; break; } }
            if ok { for i in 0..hl.len() { if seg_cross(m, v, hl[i], hl[(i + 1) % hl.len()]) { ok = false; break; } } }
            if ok { chosen = c; break; } }
        let mut np: Vec<usize> = poly[..=chosen].to_vec(); for k in 0..=hl.len() { np.push(offs[h] + (hi + k) % hl.len()); } np.push(poly[chosen]); np.extend_from_slice(&poly[chosen + 1..]); poly = np; }
    let pts: Vec<[f64; 2]> = poly.iter().map(|&i| flat[i]).collect(); ear_clip(&pts).into_iter().map(|t| [poly[t[0]], poly[t[1]], poly[t[2]]]).collect()
}


/// Triangulerar en (eventuellt konkav) polygon i 2D.
pub fn ear_clip(p: &[[f64; 2]]) -> Vec<[usize; 3]> {
    let n = p.len(); if n < 3 { return vec![]; }
    if n == 3 { return vec![[0, 1, 2]]; }
    let area: f64 = (0..n).map(|i| { let j = (i + 1) % n; p[i][0] * p[j][1] - p[j][0] * p[i][1] }).sum();
    let ccw = area > 0.0;
    let mut idx: Vec<usize> = (0..n).collect(); let mut out = Vec::new(); let mut guard = 0usize;
    let cr = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    while idx.len() > 3 && guard < n * n + 8 {
        guard += 1; let m = idx.len(); let mut found = false;
        for i in 0..m {
            let (a, b, c) = (idx[(i + m - 1) % m], idx[i], idx[(i + 1) % m]);
            let k = cr(p[a], p[b], p[c]);
            if (ccw && k <= 1e-14) || (!ccw && k >= -1e-14) { continue; }
            let mut ok = true;
            for &j in &idx { if j == a || j == b || j == c { continue; }
                let q = p[j]; if q == p[a] || q == p[b] || q == p[c] { continue; }
                let (d1, d2, d3) = (cr(p[a], p[b], q), cr(p[b], p[c], q), cr(p[c], p[a], q));
                let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0; let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
                if !(neg && pos) { ok = false; break; } }
            if ok { out.push([a, b, c]); idx.remove(i); found = true; break; }
        }
        if !found { break; }
    }
    if idx.len() >= 3 { for k in 1..idx.len() - 1 { out.push([idx[0], idx[k], idx[k + 1]]); } }
    out
}

pub struct Built {
    pub opaque: Vec<u8>, // 20 byte/hörn: pos f32x3, färg u8x4, objekt u32
    pub transp: Vec<u8>,
    pub objs: Vec<RawObj>,
    pub origin: Option<P3>,
    pub skipped: HashMap<String, u32>,
    pub scale: f64,
}
pub struct RawObj { pub id: u32, pub tris: u32, pub bmin: [f32; 3], pub bmax: [f32; 3] }

struct B<'a> {
    s: &'a Step, scale: f64,
    cache: RefCell<HashMap<u32, Rc<Vec<V>>>>, place: HashMap<u32, M>,
    colors: HashMap<u32, [u8; 4]>, cur: [u8; 4], cur_obj: u32,
    origin: Option<P3>, opaque: Vec<u8>, transp: Vec<u8>, skipped: HashMap<String, u32>,
    bmin: [f32; 3], bmax: [f32; 3], tris: u32, angle: f64,
}

fn push_v(buf: &mut Vec<u8>, p: [f32; 3], c: [u8; 4], id: u32) {
    for k in 0..3 { buf.extend_from_slice(&p[k].to_le_bytes()); }
    buf.extend_from_slice(&c); buf.extend_from_slice(&id.to_le_bytes());
}

impl<'a> B<'a> {
    fn a(&self, id: u32) -> Rc<Vec<V>> {
        if let Some(v) = self.cache.borrow().get(&id) { return v.clone(); }
        let v = Rc::new(self.s.args(id)); self.cache.borrow_mut().insert(id, v.clone()); v
    }
    fn point(&self, id: u32) -> P3 {
        let a = self.s.args(id); let l = a.get(0).map(|v| v.list()).unwrap_or(&[]);
        let g = |i: usize| l.get(i).and_then(|v| v.num()).unwrap_or(0.0) * self.scale;
        [g(0), g(1), g(2)]
    }
    fn dir(&self, id: u32) -> P3 { let a = self.a(id); let l = a.get(0).map(|v| v.list()).unwrap_or(&[]); let g = |i: usize| l.get(i).and_then(|v| v.num()).unwrap_or(0.0); [g(0), g(1), g(2)] }
    fn axis3(&self, id: u32) -> M {
        let t = self.s.type_of(id);
        let a = self.a(id);
        if t == "IFCAXIS2PLACEMENT2D" {
            let loc = a.get(0).and_then(|v| v.rf()).map(|r| self.point(r)).unwrap_or([0.0; 3]);
            let x = a.get(1).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([1.0, 0.0, 0.0]);
            let x = nrm([x[0], x[1], 0.0]); let y = [-x[1], x[0], 0.0];
            return M { r: [[x[0], y[0], 0.0], [x[1], y[1], 0.0], [0.0, 0.0, 1.0]], t: loc };
        }
        if t != "IFCAXIS2PLACEMENT3D" { return M::ident(); }
        let loc = a.get(0).and_then(|v| v.rf()).map(|r| self.point(r)).unwrap_or([0.0; 3]);
        let z = nrm(a.get(1).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([0.0, 0.0, 1.0]));
        let mut x = a.get(2).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([1.0, 0.0, 0.0]);
        if dt(nrm(x), z).abs() > 0.9999 { x = if z[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] }; }
        let d = dt(x, z); let x = nrm([x[0] - z[0] * d, x[1] - z[1] * d, x[2] - z[2] * d]); let y = crs(z, x);
        M { r: [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]], t: loc }
    }
    fn placement(&mut self, id: u32, depth: u32) -> M {
        if let Some(m) = self.place.get(&id) { return *m; }
        if depth > 64 { return M::ident(); }
        let a = self.a(id);
        let rel = a.get(1).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident);
        let m = match a.get(0).and_then(|v| v.rf()) { Some(p) if self.s.type_of(p) == "IFCLOCALPLACEMENT" => self.placement(p, depth + 1).mul(&rel), _ => rel };
        self.place.insert(id, m); m
    }
    fn cto3d(&self, id: u32) -> M {
        let a = self.a(id);
        let d = |i: usize, def: P3| a.get(i).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or(def);
        let x = nrm(d(0, [1.0, 0.0, 0.0])); let yy = d(1, [0.0, 1.0, 0.0]);
        let o = a.get(2).and_then(|v| v.rf()).map(|r| self.point(r)).unwrap_or([0.0; 3]);
        let s = a.get(3).and_then(|v| v.num()).unwrap_or(1.0);
        let z = nrm(a.get(4).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or_else(|| crs(x, nrm(yy))));
        let y = crs(z, x);
        let s2 = a.get(5).and_then(|v| v.num()).unwrap_or(s); let s3 = a.get(6).and_then(|v| v.num()).unwrap_or(s);
        M { r: [[x[0] * s, y[0] * s2, z[0] * s3], [x[1] * s, y[1] * s2, z[1] * s3], [x[2] * s, y[2] * s2, z[2] * s3]], t: o }
    }

    fn vert(&mut self, p: P3) -> [f32; 3] {
        let o = *self.origin.get_or_insert([(p[0] / 100.0).round() * 100.0, (p[1] / 100.0).round() * 100.0, (p[2] / 100.0).round() * 100.0]);
        [(p[0] - o[0]) as f32, (p[1] - o[1]) as f32, (p[2] - o[2]) as f32]
    }
    fn tri(&mut self, a: P3, b: P3, c: P3) {
        let n = crs([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
        if dt(n, n) < 1e-14 { return; }
        let (va, vb, vc) = (self.vert(a), self.vert(b), self.vert(c));
        let col = self.cur; let id = self.cur_obj;
        let buf = if col[3] < 255 { &mut self.transp } else { &mut self.opaque };
        push_v(buf, va, col, id); push_v(buf, vb, col, id); push_v(buf, vc, col, id);
        for v in [va, vb, vc] { for k in 0..3 { if v[k] < self.bmin[k] { self.bmin[k] = v[k]; } if v[k] > self.bmax[k] { self.bmax[k] = v[k]; } } }
        self.tris += 1;
    }
    fn poly(&mut self, pts: &[P3]) {
        let n = pts.len(); if n < 3 { return; }
        if n == 3 { self.tri(pts[0], pts[1], pts[2]); return; }
        let mut nn = [0.0; 3];
        for i in 0..n { let (p, q) = (pts[i], pts[(i + 1) % n]); nn[0] += (p[1] - q[1]) * (p[2] + q[2]); nn[1] += (p[2] - q[2]) * (p[0] + q[0]); nn[2] += (p[0] - q[0]) * (p[1] + q[1]); }
        let ax = if nn[0].abs() >= nn[1].abs() && nn[0].abs() >= nn[2].abs() { 0 } else if nn[1].abs() >= nn[2].abs() { 1 } else { 2 };
        let (u, v) = match ax { 0 => (1, 2), 1 => (2, 0), _ => (0, 1) };
        let p2: Vec<[f64; 2]> = pts.iter().map(|p| [p[u], p[v]]).collect();
        for t in ear_clip(&p2) { self.tri(pts[t[0]], pts[t[1]], pts[t[2]]); }
    }
    fn skip(&mut self, ty: &str) { *self.skipped.entry(ty.to_string()).or_insert(0) += 1; }

    /// Kurva (2D eller 3D) → punkter i kurvans eget system (z = 0 för 2D). Linjer, polylinjer, polykurvor, cirkelbågar och sammansatta kurvor.
    fn sample_curve(&mut self, id: u32, depth: u32) -> Vec<P3> {
        if depth > 6 { return vec![]; }
        let ty = self.s.type_of(id).to_string(); let a = self.a(id); let sc = self.scale;
        match ty.as_str() {
            "IFCPOLYLINE" => a.get(0).map(|v| v.refs()).unwrap_or_default().iter().map(|&r| self.point(r)).collect(),
            "IFCINDEXEDPOLYCURVE" => {
                let pts: Vec<P3> = match a.get(0).and_then(|v| v.rf()) { Some(pl) => { let pa = self.a(pl); pa.get(0).map(|v| v.list().iter().map(|q| { let l = q.list(); let g = |i: usize| l.get(i).and_then(|x| x.num()).unwrap_or(0.0) * sc; [g(0), g(1), g(2)] }).collect()).unwrap_or_default() } None => vec![] };
                let segs = a.get(1).map(|v| v.list().to_vec()).unwrap_or_default();
                if segs.is_empty() { return pts; }
                let mut out: Vec<P3> = Vec::new();
                for sg in segs { if let V::Typed(t, args) = sg { let ix: Vec<usize> = args.get(0).map(|v| v.list().iter().filter_map(|x| x.num()).map(|n| n as usize).collect()).unwrap_or_default();
                    let get = |k: usize| pts.get(k.wrapping_sub(1)).copied();
                    if t == "IFCARCINDEX" && ix.len() == 3 { if let (Some(p0), Some(p1), Some(p2)) = (get(ix[0]), get(ix[1]), get(ix[2])) { out.extend(arc3(p0, p1, p2)); } }
                    else { for k in ix { if let Some(p) = get(k) { if out.last().map(|q| *q != p).unwrap_or(true) { out.push(p); } } } } } }
                out
            }
            "IFCCOMPOSITECURVE" => { let mut out: Vec<P3> = Vec::new(); for seg in a.get(0).map(|v| v.refs()).unwrap_or_default() { let sa = self.a(seg); let same = !matches!(sa.get(1), Some(V::Enum(e)) if e == "F"); let mut pts = match sa.get(2).and_then(|v| v.rf()) { Some(c) => self.sample_curve(c, depth + 1), None => vec![] }; if !same { pts.reverse(); } for p in pts { if out.last().map(|q| (q[0] - p[0]).abs() + (q[1] - p[1]).abs() + (q[2] - p[2]).abs() > 1e-9).unwrap_or(true) { out.push(p); } } } out }
            "IFCTRIMMEDCURVE" => {
                let basis = match a.get(0).and_then(|v| v.rf()) { Some(b) => b, None => return vec![] }; let bt = self.s.type_of(basis).to_string(); let ba = self.a(basis);
                let sense = !matches!(a.get(3), Some(V::Enum(e)) if e == "F");
                let trim = |v: Option<&V>| -> (Option<f64>, Option<P3>) { let mut par = None; let mut pt = None; if let Some(V::List(l)) = v { for it in l { match it { V::Typed(_, x) => { if let Some(n) = x.get(0).and_then(|z| z.num()) { par = Some(n); } } V::Ref(r) => { pt = Some(self.point(*r)); } _ => {} } } } (par, pt) };
                let (t1, t2) = (trim(a.get(1)), trim(a.get(2)));
                if bt == "IFCCIRCLE" {
                    let m = ba.get(0).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident); let r = ba.get(1).and_then(|v| v.num()).unwrap_or(0.0) * sc; let inv = m.inv_rigid();
                    let ang = |t: &(Option<f64>, Option<P3>)| -> f64 { match (t.0, t.1) { (Some(p), _) => p * self.angle, (None, Some(q)) => { let l = inv.apply(q); l[1].atan2(l[0]) } _ => 0.0 } };
                    let (mut s0, mut e0) = (ang(&t1), ang(&t2)); if sense { while e0 <= s0 { e0 += std::f64::consts::TAU; } } else { while e0 >= s0 { e0 -= std::f64::consts::TAU; } }
                    let n = (((e0 - s0).abs() / (std::f64::consts::PI / 18.0)).ceil() as usize).max(2); s0 = s0.min(1e9);
                    (0..=n).map(|i| { let t = s0 + (e0 - s0) * i as f64 / n as f64; m.apply([r * t.cos(), r * t.sin(), 0.0]) }).collect()
                } else if bt == "IFCLINE" {
                    let p0 = ba.get(0).and_then(|v| v.rf()).map(|r| self.point(r)).unwrap_or([0.0; 3]); let (d, mag) = match ba.get(1).and_then(|v| v.rf()) { Some(vr) => { let va = self.a(vr); (va.get(0).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([1.0, 0.0, 0.0]), va.get(1).and_then(|v| v.num()).unwrap_or(1.0) * sc) } None => ([1.0, 0.0, 0.0], 1.0) };
                    let d = nrm(d); let pt_of = |t: &(Option<f64>, Option<P3>)| -> P3 { match (t.0, t.1) { (_, Some(q)) => q, (Some(p), _) => [p0[0] + d[0] * p * mag, p0[1] + d[1] * p * mag, p0[2] + d[2] * p * mag], _ => p0 } };
                    let (x, y) = (pt_of(&t1), pt_of(&t2)); if sense { vec![x, y] } else { vec![y, x] }
                } else { self.skip(&bt); vec![] }
            }
            "IFCLINE" | "IFCCIRCLE" | "IFCELLIPSE" => { self.skip(&ty); vec![] }
            _ => { self.skip(&ty); vec![] }
        }
    }
    fn curve2d(&mut self, id: u32) -> Option<Vec<[f64; 2]>> {
        let mut pts: Vec<[f64; 2]> = self.sample_curve(id, 0).iter().map(|p| [p[0], p[1]]).collect();
        if pts.len() > 1 && (pts[0][0] - pts[pts.len() - 1][0]).abs() + (pts[0][1] - pts[pts.len() - 1][1]).abs() < 1e-9 { pts.pop(); }
        if pts.len() < 3 { None } else { Some(pts) }
    }
    /// Profiler: en yttre kontur med eventuella hål (alla i 2D, efter profilens placering).
    fn profile(&mut self, id: u32, depth: u32) -> Vec<Prof> {
        if depth > 4 { return vec![]; }
        let ty = self.s.type_of(id).to_string(); let a = self.a(id); let sc = self.scale;
        let num = |i: usize| a.get(i).and_then(|v| v.num()).unwrap_or(0.0) * sc;
        let has = |i: usize| a.get(i).and_then(|v| v.num()).is_some();
        let circ = |r: f64| -> Vec<[f64; 2]> { (0..28).map(|i| { let t = i as f64 * std::f64::consts::TAU / 28.0; [r * t.cos(), r * t.sin()] }).collect() };
        let mut hole: Option<Vec<[f64; 2]>> = None;
        let raw: Vec<[f64; 2]> = match ty.as_str() {
            "IFCRECTANGLEPROFILEDEF" | "IFCROUNDEDRECTANGLEPROFILEDEF" => { let (x, y) = (num(3) / 2.0, num(4) / 2.0); vec![[-x, -y], [x, -y], [x, y], [-x, y]] }
            "IFCRECTANGLEHOLLOWPROFILEDEF" => { let (x, y, t) = (num(3) / 2.0, num(4) / 2.0, num(5)); if t > 0.0 && x > t && y > t { hole = Some(vec![[-x + t, -y + t], [-x + t, y - t], [x - t, y - t], [x - t, -y + t]]); } vec![[-x, -y], [x, -y], [x, y], [-x, y]] }
            "IFCCIRCLEPROFILEDEF" => circ(num(3)),
            "IFCCIRCLEHOLLOWPROFILEDEF" => { let (r, t) = (num(3), num(4)); if t > 0.0 && r > t { let mut h = circ(r - t); h.reverse(); hole = Some(h); } circ(r) }
            "IFCELLIPSEPROFILEDEF" => { let (rx, ry) = (num(3), num(4)); (0..28).map(|i| { let t = i as f64 * std::f64::consts::TAU / 28.0; [rx * t.cos(), ry * t.sin()] }).collect() }
            "IFCISHAPEPROFILEDEF" => { let (w, h, tw, tf) = (num(3) / 2.0, num(4) / 2.0, num(5) / 2.0, num(6)); vec![[-w, -h], [w, -h], [w, -h + tf], [tw, -h + tf], [tw, h - tf], [w, h - tf], [w, h], [-w, h], [-w, h - tf], [-tw, h - tf], [-tw, -h + tf], [-w, -h + tf]] }
            "IFCASYMMETRICISHAPEPROFILEDEF" => { let (bw, d, tw, tf, tw2, tf2) = (num(3), num(4), num(5) / 2.0, num(6), if has(7) { num(7) } else { num(3) }, if has(8) { num(8) } else { num(6) }); let (w1, w2, h) = (bw / 2.0, tw2 / 2.0, d / 2.0); vec![[-w1, -h], [w1, -h], [w1, -h + tf], [tw, -h + tf], [tw, h - tf2], [w2, h - tf2], [w2, h], [-w2, h], [-w2, h - tf2], [-tw, h - tf2], [-tw, -h + tf], [-w1, -h + tf]] }
            "IFCLSHAPEPROFILEDEF" => { let (d, w, t) = (num(3), if has(4) { num(4) } else { num(3) }, num(5)); vec![[0.0, 0.0], [w, 0.0], [w, t], [t, t], [t, d], [0.0, d]] }
            "IFCTSHAPEPROFILEDEF" => { let (d, fw, tw, tf) = (num(3), num(4) / 2.0, num(5) / 2.0, num(6)); vec![[-fw, d / 2.0], [-fw, d / 2.0 - tf], [-tw, d / 2.0 - tf], [-tw, -d / 2.0], [tw, -d / 2.0], [tw, d / 2.0 - tf], [fw, d / 2.0 - tf], [fw, d / 2.0]] }
            "IFCUSHAPEPROFILEDEF" => { let (d, fw, tw, tf) = (num(3) / 2.0, num(4) / 2.0, num(5), num(6)); vec![[-fw, -d], [fw, -d], [fw, -d + tf], [-fw + tw, -d + tf], [-fw + tw, d - tf], [fw, d - tf], [fw, d], [-fw, d]] }
            "IFCCSHAPEPROFILEDEF" => { let (d, w, t, g) = (num(3) / 2.0, num(4) / 2.0, num(5), num(6)); vec![[-w, -d], [w, -d], [w, -d + g], [w - t, -d + g], [w - t, -d + t], [-w + t, -d + t], [-w + t, d - t], [w - t, d - t], [w - t, d - g], [w, d - g], [w, d], [-w, d]] }
            "IFCZSHAPEPROFILEDEF" => { let (d, fw, tw, tf) = (num(3) / 2.0, num(4), num(5) / 2.0, num(6)); vec![[-tw, -d], [fw, -d], [fw, -d + tf], [tw, -d + tf], [tw, d], [-fw, d], [-fw, d - tf], [-tw, d - tf]] }
            "IFCTRAPEZIUMPROFILEDEF" => { let (b, t, h, off) = (num(3), num(4), num(5), num(6)); vec![[-b / 2.0, -h / 2.0], [b / 2.0, -h / 2.0], [off + t - b / 2.0 + (b - t) / 2.0 - (b - t) / 2.0 + t / 2.0 - t / 2.0, h / 2.0], [off - b / 2.0 + (b - t) / 2.0 * 0.0, h / 2.0]] }
            "IFCARBITRARYCLOSEDPROFILEDEF" => { let c = match a.get(2).and_then(|v| v.rf()).and_then(|r| self.curve2d(r)) { Some(c) => c, None => return vec![] }; return vec![Prof { outer: c, holes: vec![] }]; }
            "IFCARBITRARYPROFILEDEFWITHVOIDS" => { let c = match a.get(2).and_then(|v| v.rf()).and_then(|r| self.curve2d(r)) { Some(c) => c, None => return vec![] }; let holes: Vec<Vec<[f64; 2]>> = a.get(3).map(|v| v.refs()).unwrap_or_default().iter().filter_map(|&r| self.curve2d(r)).collect(); return vec![Prof { outer: c, holes }]; }
            "IFCCOMPOSITEPROFILEDEF" => { let mut out = Vec::new(); for r in a.get(2).map(|v| v.refs()).unwrap_or_default() { out.extend(self.profile(r, depth + 1)); } return out; }
            "IFCDERIVEDPROFILEDEF" => {
                let parent = match a.get(2).and_then(|v| v.rf()) { Some(p) => p, None => return vec![] }; let mut ps = self.profile(parent, depth + 1);
                if let Some(op) = a.get(3).and_then(|v| v.rf()) { let oa = self.a(op); let d2 = |i: usize, def: [f64; 2]| oa.get(i).and_then(|v| v.rf()).map(|r| { let d = self.dir(r); [d[0], d[1]] }).unwrap_or(def); let x = d2(0, [1.0, 0.0]); let y = d2(1, [-x[1], x[0]]); let o = oa.get(2).and_then(|v| v.rf()).map(|r| self.point(r)).unwrap_or([0.0; 3]); let k = oa.get(3).and_then(|v| v.num()).unwrap_or(1.0);
                    let f = |p: &[f64; 2]| [(x[0] * p[0] + y[0] * p[1]) * k + o[0], (x[1] * p[0] + y[1] * p[1]) * k + o[1]]; for p in ps.iter_mut() { p.outer = p.outer.iter().map(f).collect(); p.holes = p.holes.iter().map(|h| h.iter().map(f).collect()).collect(); } }
                return ps;
            }
            _ => { self.skip(&ty); return vec![]; }
        };
        let m = a.get(2).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident); let f = |p: &[f64; 2]| { let q = m.apply([p[0], p[1], 0.0]); [q[0], q[1]] };
        vec![Prof { outer: raw.iter().map(f).collect(), holes: hole.into_iter().map(|h| h.iter().map(f).collect()).collect() }]
    }

    fn extruded(&mut self, id: u32, m: &M) {
        let a = self.a(id);
        let profs = match a.get(0).and_then(|v| v.rf()) { Some(r) => self.profile(r, 0), None => return };
        let pos = a.get(1).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident);
        let dir = a.get(2).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([0.0, 0.0, 1.0]);
        let depth = a.get(3).and_then(|v| v.num()).unwrap_or(0.0) * self.scale;
        let d = [dir[0] * depth, dir[1] * depth, dir[2] * depth]; let mw = m.mul(&pos); let flip = d[2] < 0.0;
        for pr in profs {
            let mut outer = pr.outer; if outer.len() < 3 { continue; } if signed_area(&outer) < 0.0 { outer.reverse(); }
            let mut loops: Vec<Vec<[f64; 2]>> = vec![outer]; for h in pr.holes { let mut h = h; if h.len() >= 3 { if signed_area(&h) > 0.0 { h.reverse(); } loops.push(h); } }
            let flat: Vec<[f64; 2]> = loops.iter().flatten().copied().collect(); let tris = triangulate_holes(&loops);
            let bot: Vec<P3> = flat.iter().map(|p| mw.apply([p[0], p[1], 0.0])).collect(); let top: Vec<P3> = flat.iter().map(|p| mw.apply([p[0] + d[0], p[1] + d[1], d[2]])).collect();
            for t in tris { if !flip { self.tri(bot[t[0]], bot[t[2]], bot[t[1]]); self.tri(top[t[0]], top[t[1]], top[t[2]]); } else { self.tri(bot[t[0]], bot[t[1]], bot[t[2]]); self.tri(top[t[0]], top[t[2]], top[t[1]]); } }
            let mut off = 0usize; for l in &loops { let n = l.len(); for i in 0..n { let j = (i + 1) % n; let (bi, bj, ti, tj) = (bot[off + i], bot[off + j], top[off + i], top[off + j]); if !flip { self.tri(bi, bj, tj); self.tri(bi, tj, ti); } else { self.tri(bi, tj, bj); self.tri(bi, ti, tj); } } off += n; }
        }
    }
    /// Roterad profil kring en axel.
    fn revolved(&mut self, id: u32, m: &M) {
        let a = self.a(id); let profs = match a.get(0).and_then(|v| v.rf()) { Some(r) => self.profile(r, 0), None => return };
        let pos = a.get(1).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident); let mw = m.mul(&pos);
        let (ap, ad) = match a.get(2).and_then(|v| v.rf()) { Some(r) => { let aa = self.a(r); (aa.get(0).and_then(|v| v.rf()).map(|q| self.point(q)).unwrap_or([0.0; 3]), nrm(aa.get(1).and_then(|v| v.rf()).map(|q| self.dir(q)).unwrap_or([0.0, 0.0, 1.0]))) } None => ([0.0; 3], [0.0, 0.0, 1.0]) };
        let ang = a.get(3).and_then(|v| v.num()).unwrap_or(360.0) * self.angle; let steps = ((ang.abs() / (std::f64::consts::PI / 12.0)).ceil() as usize).max(2);
        let rot = |p: P3, t: f64| -> P3 { let v = [p[0] - ap[0], p[1] - ap[1], p[2] - ap[2]]; let (c, s) = (t.cos(), t.sin()); let k = crs(ad, v); let d = dt(ad, v); [ap[0] + v[0] * c + k[0] * s + ad[0] * d * (1.0 - c), ap[1] + v[1] * c + k[1] * s + ad[1] * d * (1.0 - c), ap[2] + v[2] * c + k[2] * s + ad[2] * d * (1.0 - c)] };
        for pr in profs { let n = pr.outer.len(); if n < 3 { continue; } let ring: Vec<P3> = pr.outer.iter().map(|p| [p[0], p[1], 0.0]).collect();
            for k in 0..steps { let (t0, t1) = (ang * k as f64 / steps as f64, ang * (k + 1) as f64 / steps as f64); for i in 0..n { let j = (i + 1) % n; let (a0, b0, a1, b1) = (mw.apply(rot(ring[i], t0)), mw.apply(rot(ring[j], t0)), mw.apply(rot(ring[i], t1)), mw.apply(rot(ring[j], t1))); self.tri(a0, b0, b1); self.tri(a0, b1, a1); } } }
    }
    /// Rör/armering: cirkelprofil längs en kurva.
    fn sweep_disk(&mut self, id: u32, m: &M) {
        let a = self.a(id); let curve = match a.get(0).and_then(|v| v.rf()) { Some(c) => c, None => return }; let r = a.get(1).and_then(|v| v.num()).unwrap_or(0.0) * self.scale; if r <= 0.0 { return; }
        let pts: Vec<P3> = self.sample_curve(curve, 0).iter().map(|p| m.apply(*p)).collect(); if pts.len() < 2 { return; }
        let seg = 10usize; let mut prev_n: Option<P3> = None; let mut rings: Vec<Vec<P3>> = Vec::new();
        for i in 0..pts.len() { let t = if i == 0 { sub(pts[1], pts[0]) } else if i == pts.len() - 1 { sub(pts[i], pts[i - 1]) } else { let u = nrm(sub(pts[i], pts[i - 1])); let w = nrm(sub(pts[i + 1], pts[i])); nrm([u[0] + w[0], u[1] + w[1], u[2] + w[2]]) }; let t = nrm(t);
            let mut n = prev_n.unwrap_or_else(|| if t[2].abs() < 0.9 { crs(t, [0.0, 0.0, 1.0]) } else { crs(t, [1.0, 0.0, 0.0]) }); let d = dt(n, t); n = nrm([n[0] - t[0] * d, n[1] - t[1] * d, n[2] - t[2] * d]); prev_n = Some(n); let b = crs(t, n);
            rings.push((0..seg).map(|k| { let ph = k as f64 * std::f64::consts::TAU / seg as f64; let (c, s) = (ph.cos() * r, ph.sin() * r); [pts[i][0] + n[0] * c + b[0] * s, pts[i][1] + n[1] * c + b[1] * s, pts[i][2] + n[2] * c + b[2] * s] }).collect()); }
        for i in 0..rings.len() - 1 { for k in 0..seg { let j = (k + 1) % seg; self.tri(rings[i][k], rings[i][j], rings[i + 1][j]); self.tri(rings[i][k], rings[i + 1][j], rings[i + 1][k]); } }
    }
    fn csg_primitive(&mut self, id: u32, m: &M) {
        let ty = self.s.type_of(id).to_string(); let a = self.a(id); let pos = a.get(0).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident); let mw = m.mul(&pos); let sc = self.scale;
        match ty.as_str() {
            "IFCBLOCK" => { let (x, y, z) = (a.get(1).and_then(|v| v.num()).unwrap_or(0.0) * sc, a.get(2).and_then(|v| v.num()).unwrap_or(0.0) * sc, a.get(3).and_then(|v| v.num()).unwrap_or(0.0) * sc); let c = |i: usize| mw.apply([if i & 1 != 0 { x } else { 0.0 }, if i & 2 != 0 { y } else { 0.0 }, if i & 4 != 0 { z } else { 0.0 }]);
                for f in [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]] { self.tri(c(f[0]), c(f[1]), c(f[2])); self.tri(c(f[0]), c(f[2]), c(f[3])); } }
            "IFCRIGHTCIRCULARCYLINDER" => { let (h, r) = (a.get(1).and_then(|v| v.num()).unwrap_or(0.0) * sc, a.get(2).and_then(|v| v.num()).unwrap_or(0.0) * sc); let n = 24; let p = |i: usize, z: f64| mw.apply([r * (i as f64 * std::f64::consts::TAU / n as f64).cos(), r * (i as f64 * std::f64::consts::TAU / n as f64).sin(), z]);
                for i in 0..n { let j = (i + 1) % n; self.tri(p(i, 0.0), p(j, 0.0), p(j, h)); self.tri(p(i, 0.0), p(j, h), p(i, h)); self.tri(mw.apply([0.0, 0.0, 0.0]), p(j, 0.0), p(i, 0.0)); self.tri(mw.apply([0.0, 0.0, h]), p(i, h), p(j, h)); } }
            _ => self.skip(&ty),
        }
    }
    fn pointlist3(&self, id: u32) -> Vec<P3> {
        let a = self.a(id);
        a.get(0).map(|v| v.list()).unwrap_or(&[]).iter().map(|v| { let l = v.list(); let g = |i: usize| l.get(i).and_then(|x| x.num()).unwrap_or(0.0) * self.scale; [g(0), g(1), g(2)] }).collect()
    }
    fn faceset(&mut self, id: u32, m: &M, polygonal: bool) {
        let a = self.s.args(id);
        let cp = match a.get(0).and_then(|v| v.rf()) { Some(c) => c, None => return };
        let pts: Vec<P3> = self.pointlist3(cp).iter().map(|p| m.apply(*p)).collect();
        if !polygonal {
            for f in a.get(3).map(|v| v.list()).unwrap_or(&[]) { let l = f.list(); if l.len() < 3 { continue; }
                let g = |i: usize| l[i].num().map(|n| n as usize).and_then(|n| pts.get(n.wrapping_sub(1)).copied());
                if let (Some(x), Some(y), Some(z)) = (g(0), g(1), g(2)) { self.tri(x, y, z); } }
        } else {
            for r in a.get(2).map(|v| v.refs()).unwrap_or_default() {
                let fty = self.s.type_of(r).to_string(); let fa = self.s.args(r); let get = |v: &V| -> Vec<P3> { v.list().iter().filter_map(|x| x.num()).filter_map(|n| pts.get((n as usize).wrapping_sub(1)).copied()).collect() };
                let outer = fa.get(0).map(|v| get(v)).unwrap_or_default();
                if fty == "IFCINDEXEDPOLYGONALFACEWITHVOIDS" { let holes: Vec<Vec<P3>> = fa.get(1).map(|v| v.list().iter().map(|h| get(h)).collect()).unwrap_or_default(); self.poly_holes(&outer, &holes); } else { self.poly(&outer); }
            }
        }
    }
    /// Polygon med hål i 3D (projiceras till bästa plan).
    fn poly_holes(&mut self, outer: &[P3], holes: &[Vec<P3>]) {
        if holes.is_empty() { return self.poly(outer); }
        let mut nn = [0.0; 3]; let n = outer.len(); if n < 3 { return; }
        for i in 0..n { let (p, q) = (outer[i], outer[(i + 1) % n]); nn[0] += (p[1] - q[1]) * (p[2] + q[2]); nn[1] += (p[2] - q[2]) * (p[0] + q[0]); nn[2] += (p[0] - q[0]) * (p[1] + q[1]); }
        let ax = if nn[0].abs() >= nn[1].abs() && nn[0].abs() >= nn[2].abs() { 0 } else if nn[1].abs() >= nn[2].abs() { 1 } else { 2 }; let (u, v) = match ax { 0 => (1, 2), 1 => (2, 0), _ => (0, 1) };
        let sgn = if nn[ax] >= 0.0 { 1.0 } else { -1.0 };
        let mut loops: Vec<Vec<[f64; 2]>> = vec![outer.iter().map(|p| [p[u], p[v]]).collect()]; let mut all: Vec<P3> = outer.to_vec();
        if sgn * signed_area(&loops[0]) < 0.0 { }
        // orientera: ytterkontur moturs i projektionen, hål medurs
        let mut o2 = loops[0].clone(); let mut o3 = outer.to_vec(); if signed_area(&o2) < 0.0 { o2.reverse(); o3.reverse(); } loops[0] = o2; all = o3;
        for h in holes { if h.len() < 3 { continue; } let mut h2: Vec<[f64; 2]> = h.iter().map(|p| [p[u], p[v]]).collect(); let mut h3 = h.clone(); if signed_area(&h2) > 0.0 { h2.reverse(); h3.reverse(); } loops.push(h2); all.extend(h3); }
        for t in triangulate_holes(&loops) { self.tri(all[t[0]], all[t[1]], all[t[2]]); }
    }
    fn shell(&mut self, id: u32, m: &M) {
        let a = self.a(id);
        for f in a.get(0).map(|v| v.refs()).unwrap_or_default() {
            let fty = self.s.type_of(f).to_string(); let fa = self.a(f); let bounds = fa.get(0).map(|v| v.refs()).unwrap_or_default();
            if fty == "IFCADVANCEDFACE" || fty == "IFCFACESURFACE" && false { self.advanced_face(&bounds, m); continue; }
            let mut loops: Vec<Vec<P3>> = Vec::new(); let mut outer_ix = 0usize;
            for (k, b) in bounds.iter().enumerate() { let ba = self.a(*b); if self.s.type_of(*b) == "IFCFACEOUTERBOUND" { outer_ix = k; }
                if let Some(l) = ba.get(0).and_then(|v| v.rf()) { let la = self.a(l); let mut poly: Vec<P3> = la.get(0).map(|v| v.refs()).unwrap_or_default().iter().map(|&r| m.apply(self.point(r))).collect(); if matches!(ba.get(1), Some(V::Enum(e)) if e == "F") { poly.reverse(); } loops.push(poly); } }
            if loops.is_empty() { continue; } let outer = loops.remove(outer_ix.min(loops.len() - 1)); self.poly_holes(&outer, &loops);
        }
    }
    fn advanced_face(&mut self, bounds: &[u32], m: &M) {
        let mut loops: Vec<Vec<P3>> = Vec::new(); let mut outer_ix = 0usize;
        for (k, &b) in bounds.iter().enumerate() { if self.s.type_of(b) == "IFCFACEOUTERBOUND" { outer_ix = k; } let ba = self.a(b); let l = match ba.get(0).and_then(|v| v.rf()) { Some(l) => l, None => continue }; let la = self.a(l); let mut poly: Vec<P3> = Vec::new();
            for oe in la.get(0).map(|v| v.refs()).unwrap_or_default() { let oa = self.a(oe); let edge = match oa.get(2).and_then(|v| v.rf()) { Some(e) => e, None => continue }; let ea = self.a(edge); let orient = !matches!(oa.get(3), Some(V::Enum(e)) if e == "F"); let same = !matches!(ea.get(3), Some(V::Enum(e)) if e == "F");
                let vtx = |r: Option<u32>| -> Option<P3> { let r = r?; let va = self.a(r); va.get(0).and_then(|v| v.rf()).map(|p| self.point(p)) }; let (sv, ev) = (vtx(ea.get(0).and_then(|v| v.rf())), vtx(ea.get(1).and_then(|v| v.rf()))); let fwd = orient == same;
                if let Some(p) = if fwd { sv } else { ev } { let p = m.apply(p); if poly.last().map(|q| *q != p).unwrap_or(true) { poly.push(p); } } }
            if poly.len() >= 3 { loops.push(poly); } }
        if loops.is_empty() { return; } let outer = loops.remove(outer_ix.min(loops.len() - 1)); self.poly_holes(&outer, &loops);
    }
    fn item(&mut self, id: u32, m: &M, depth: u32) {
        if depth > 8 { return; }
        let saved = self.cur; if let Some(c) = self.colors.get(&id) { self.cur = *c; }
        let ty = self.s.type_of(id).to_string();
        match ty.as_str() {
            "IFCEXTRUDEDAREASOLID" | "IFCEXTRUDEDAREASOLIDTAPERED" => self.extruded(id, m),
            "IFCTRIANGULATEDFACESET" => self.faceset(id, m, false),
            "IFCPOLYGONALFACESET" => self.faceset(id, m, true),
            "IFCREVOLVEDAREASOLID" => self.revolved(id, m),
            "IFCSWEPTDISKSOLID" => self.sweep_disk(id, m),
            "IFCCSGSOLID" => { let a = self.a(id); if let Some(r) = a.get(0).and_then(|v| v.rf()) { self.csg_primitive(r, m); } }
            "IFCBLOCK" | "IFCRIGHTCIRCULARCYLINDER" => self.csg_primitive(id, m),
            "IFCADVANCEDBREP" | "IFCADVANCEDBREPWITHVOIDS" | "IFCFACETEDBREP" | "IFCFACETEDBREPWITHVOIDS" => { let a = self.a(id); if let Some(o) = a.get(0).and_then(|v| v.rf()) { self.shell(o, m); } }
            "IFCSHELLBASEDSURFACEMODEL" => { let a = self.a(id); for s in a.get(0).map(|v| v.refs()).unwrap_or_default() { self.shell(s, m); } }
            "IFCFACEBASEDSURFACEMODEL" => { let a = self.a(id); for s in a.get(0).map(|v| v.refs()).unwrap_or_default() { let sa = self.a(s); for fs in sa.get(0).map(|v| v.refs()).unwrap_or_default() { self.shell(fs, m); } } }
            "IFCMAPPEDITEM" => {
                let a = self.a(id);
                let src = a.get(0).and_then(|v| v.rf()); let tgt = a.get(1).and_then(|v| v.rf());
                if let Some(src) = src {
                    let sa = self.a(src);
                    let origin = sa.get(0).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident);
                    let t = tgt.map(|r| self.cto3d(r)).unwrap_or_else(M::ident);
                    let mm = m.mul(&t).mul(&origin.inv_rigid());
                    if let Some(rep) = sa.get(1).and_then(|v| v.rf()) { let ra = self.a(rep); for it in ra.get(3).map(|v| v.refs()).unwrap_or_default() { self.item(it, &mm, depth + 1); } }
                }
            }
            "IFCBOOLEANCLIPPINGRESULT" | "IFCBOOLEANRESULT" => { let a = self.a(id); if let Some(f) = a.get(1).and_then(|v| v.rf()) { self.item(f, m, depth + 1); } }
            "" => {}
            _ => self.skip(&ty),
        }
        self.cur = saved;
    }
}

fn default_color(class: &str) -> [u8; 4] {
    match class {
        "IFCWALL" | "IFCWALLSTANDARDCASE" => [214, 210, 202, 255],
        "IFCSLAB" => [168, 172, 178, 255],
        "IFCCOLUMN" => [186, 168, 150, 255],
        "IFCBEAM" => [196, 170, 120, 255],
        "IFCROOF" => [150, 90, 80, 255],
        "IFCSTAIR" | "IFCSTAIRFLIGHT" | "IFCRAILING" => [150, 160, 170, 255],
        "IFCWINDOW" => [120, 180, 230, 110],
        "IFCDOOR" => [150, 110, 80, 255],
        "IFCSPACE" => [120, 200, 160, 50],
        "IFCFOOTING" | "IFCPILE" => [140, 140, 140, 255],
        "IFCBUILDINGELEMENTPROXY" => [200, 190, 200, 255],
        _ => [190, 196, 204, 255],
    }
}

pub fn build(s: &Step, from: usize, obj_base: u32, origin: Option<P3>) -> Built {
    // enhet: längdenheten i projektets IFCUNITASSIGNMENT (finns den inte används första längdenheten i filen)
    let prefix = |p: Option<&V>| match p { Some(V::Enum(p)) => match p.as_str() { "MILLI" => 0.001, "CENTI" => 0.01, "DECI" => 0.1, "KILO" => 1000.0, _ => 1.0 }, _ => 1.0 };
    let length_of = |u: u32| -> Option<f64> {
        let a = s.args(u);
        match s.type_of(u) {
            "IFCSIUNIT" => if matches!(a.get(1), Some(V::Enum(t)) if t == "LENGTHUNIT") { Some(prefix(a.get(2))) } else { None },
            "IFCCONVERSIONBASEDUNIT" => if matches!(a.get(1), Some(V::Enum(t)) if t == "LENGTHUNIT") { let mw = a.get(3)?.rf()?; let ma = s.args(mw); let f = ma.get(0)?.num()?; let base = ma.get(1).and_then(|v| v.rf()).and_then(|r| { let ba = s.args(r); Some(prefix(ba.get(2))) }).unwrap_or(1.0); Some(f * base) } else { None },
            _ => None,
        }
    };
    let mut scale = None;
    for e in s.ents[from..].iter().filter(|e| s.types[e.ty as usize] == "IFCUNITASSIGNMENT") { let a = s.args(e.id); for u in a.get(0).map(|v| v.refs()).unwrap_or_default() { if let Some(f) = length_of(u) { scale = Some(f); break; } } if scale.is_some() { break; } }
    let scale = scale.or_else(|| s.ents[from..].iter().filter(|e| matches!(s.types[e.ty as usize].as_str(), "IFCSIUNIT" | "IFCCONVERSIONBASEDUNIT")).find_map(|e| length_of(e.id))).unwrap_or(1.0);
    let mut b = B { s, scale, cache: RefCell::new(HashMap::new()), place: HashMap::new(), colors: HashMap::new(), cur: [190, 196, 204, 255], cur_obj: obj_base,
        origin, opaque: Vec::new(), transp: Vec::new(), skipped: HashMap::new(), bmin: [f32::MAX; 3], bmax: [f32::MIN; 3], tris: 0, angle: 1.0 };
    // vinkelenhet: radianer per enhet (grader anges ofta som omvandlad enhet)
    for e in s.ents[from..].iter().filter(|e| s.types[e.ty as usize] == "IFCCONVERSIONBASEDUNIT") {
        let a = s.args(e.id); if let Some(V::Enum(u)) = a.get(1) { if u == "PLANEANGLEUNIT" { if let Some(mw) = a.get(3).and_then(|v| v.rf()) { let ma = s.args(mw); if let Some(f) = ma.get(0).and_then(|v| v.num()) { b.angle = f; } } } }
    }
    // färger på ytor
    for e in s.ents[from..].iter().filter(|e| s.types[e.ty as usize] == "IFCSTYLEDITEM") {
        let a = s.args(e.id);
        if let Some(item) = a.get(0).and_then(|v| v.rf()) { for st in a.get(1).map(|v| v.refs()).unwrap_or_default() { if let Some(c) = colour_of(s, st, 0) { b.colors.insert(item, c); break; } } }
    }
    let pds: std::collections::HashSet<u32> = s.ents[from..].iter().filter(|e| s.types[e.ty as usize] == "IFCPRODUCTDEFINITIONSHAPE").map(|e| e.id).collect();
    let skip_ty: std::collections::HashSet<&str> = ["IFCCARTESIANPOINT", "IFCDIRECTION", "IFCPOLYLOOP", "IFCFACE", "IFCFACEOUTERBOUND", "IFCFACEBOUND", "IFCAXIS2PLACEMENT3D", "IFCAXIS2PLACEMENT2D", "IFCLOCALPLACEMENT", "IFCPROPERTYSINGLEVALUE", "IFCPROPERTYSET", "IFCOWNERHISTORY", "IFCRELDEFINESBYPROPERTIES", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCPOLYLINE", "IFCSHAPEREPRESENTATION", "IFCPRODUCTDEFINITIONSHAPE", "IFCEXTRUDEDAREASOLID", "IFCTRIANGULATEDFACESET", "IFCCARTESIANPOINTLIST3D", "IFCSTYLEDITEM", "IFCCOLOURRGB", "IFCCLOSEDSHELL", "IFCRECTANGLEPROFILEDEF", "IFCMAPPEDITEM", "IFCREPRESENTATIONMAP"].into_iter().collect();
    let mut objs = Vec::new();
    for e in s.ents[from..].iter() {
        let tn = &s.types[e.ty as usize];
        if tn.is_empty() || skip_ty.contains(tn.as_str()) || !tn.starts_with("IFC") || tn == "IFCOPENINGELEMENT" { continue; }
        let k = s.by_id[e.id as usize] as usize - 1;
        let pd = match s.arg_ref(k, 6) { Some(p) if pds.contains(&p) => p, _ => continue };
        let a = s.args(e.id);
        let oi = objs.len() as u32;
        b.cur_obj = obj_base + oi; b.cur = default_color(tn); b.bmin = [f32::MAX; 3]; b.bmax = [f32::MIN; 3]; b.tris = 0;
        let pm = match a.get(5).and_then(|v| v.rf()) { Some(p) if s.type_of(p) == "IFCLOCALPLACEMENT" => b.placement(p, 0), _ => M::ident() };
        let reps = b.a(pd).get(2).map(|v| v.refs()).unwrap_or_default();
        for r in reps {
            let ra = b.a(r);
            let ident = ra.get(1).and_then(|v| v.str()).unwrap_or("");
            if matches!(ident, "Axis" | "Box" | "FootPrint" | "Annotation" | "Profile" | "Clearance") { continue; }
            for it in ra.get(3).map(|v| v.refs()).unwrap_or_default() { b.item(it, &pm, 0); }
            if b.tris > 0 { break; }
        }
        if b.tris == 0 { continue; }
        objs.push(RawObj { id: e.id, tris: b.tris, bmin: b.bmin, bmax: b.bmax });
    }
    Built { opaque: b.opaque, transp: b.transp, objs, origin: b.origin, skipped: b.skipped, scale }
}

fn colour_of(s: &Step, id: u32, depth: u32) -> Option<[u8; 4]> {
    if depth > 6 { return None; }
    let a = s.args(id);
    match s.type_of(id) {
        "IFCCOLOURRGB" => { let g = |i: usize| (a.get(i).and_then(|v| v.num()).unwrap_or(0.8).clamp(0.0, 1.0) * 255.0).round() as u8; Some([g(1), g(2), g(3), 255]) }
        "IFCSURFACESTYLERENDERING" | "IFCSURFACESTYLESHADING" => {
            let mut c = colour_of(s, a.get(0)?.rf()?, depth + 1)?;
            if let Some(t) = a.get(1).and_then(|v| v.num()) { c[3] = ((1.0 - t.clamp(0.0, 1.0)) * 255.0).round() as u8; }
            Some(c)
        }
        "IFCSURFACESTYLE" => { for r in a.get(2)?.refs() { if let Some(c) = colour_of(s, r, depth + 1) { return Some(c); } } None }
        "IFCPRESENTATIONSTYLEASSIGNMENT" => { for r in a.get(0)?.refs() { if let Some(c) = colour_of(s, r, depth + 1) { return Some(c); } } None }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oroad_konkav_polygon_ger_ratt_area() {
        let p = [[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [2.0, 1.0], [0.0, 4.0]];
        let t = ear_clip(&p); assert_eq!(t.len(), 3);
        let a: f64 = t.iter().map(|k| { let (a, b, c) = (p[k[0]], p[k[1]], p[k[2]]); ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).abs() / 2.0 }).sum();
        assert!((a - 10.0).abs() < 1e-9, "area {}", a);
    }
    const SAMPLE: &str = "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);\n#10=IFCCARTESIANPOINT((0.,0.,0.));\n#11=IFCAXIS2PLACEMENT3D(#10,$,$);\n#12=IFCLOCALPLACEMENT($,#11);\n#13=IFCCARTESIANPOINT((0.,0.));\n#14=IFCAXIS2PLACEMENT2D(#13,$);\n#15=IFCRECTANGLEPROFILEDEF(.AREA.,$,#14,2000.,300.);\n#16=IFCDIRECTION((0.,0.,1.));\n#17=IFCEXTRUDEDAREASOLID(#15,#11,#16,3000.);\n#18=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#17));\n#19=IFCPRODUCTDEFINITIONSHAPE($,$,(#18));\n#20=IFCWALL('g1',$,'V1',$,$,#12,#19,$);\nENDSEC;\nEND-ISO-10303-21;";
    #[test]
    fn ihaligt_rektangelprofil_ger_ratt_volym() {
        let t = SAMPLE.replace("IFCRECTANGLEPROFILEDEF(.AREA.,$,#14,2000.,300.)", "IFCRECTANGLEHOLLOWPROFILEDEF(.AREA.,$,#14,4000.,2000.,500.)").replace("3000.);", "3000.);");
        let m = crate::model::Model::load(t.as_bytes()).unwrap(); let q = m.quantities_json();
        // (4*2 - 3*1) * 3 = 15 m³, slutet nät
        assert!(q.starts_with("[[") && q.contains(",15.0000,1]"), "{}", q);
    }
    #[test]
    fn vagg_i_millimeter_blir_12_trianglar_i_meter() {
        let s = Step::parse(SAMPLE.as_bytes()).unwrap(); let b = build(&s, 0, 0, None);
        assert_eq!(b.objs.len(), 1); assert_eq!(b.objs[0].tris, 12); assert!((b.scale - 0.001).abs() < 1e-12);
        let o = &b.objs[0]; assert!((o.bmax[2] - o.bmin[2] - 3.0).abs() < 1e-4 && (o.bmax[0] - o.bmin[0] - 2.0).abs() < 1e-4);
    }
}
