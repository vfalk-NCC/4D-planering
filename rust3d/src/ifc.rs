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
    bmin: [f32; 3], bmax: [f32; 3], tris: u32,
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

    fn profile(&mut self, id: u32) -> Option<Vec<[f64; 2]>> {
        let ty = self.s.type_of(id).to_string(); let a = self.a(id); let sc = self.scale;
        let num = |i: usize| a.get(i).and_then(|v| v.num()).unwrap_or(0.0) * sc;
        let pos = |me: &Self| a.get(2).and_then(|v| v.rf()).map(|r| me.axis3(r)).unwrap_or_else(M::ident);
        let raw: Vec<[f64; 2]> = match ty.as_str() {
            "IFCRECTANGLEPROFILEDEF" | "IFCROUNDEDRECTANGLEPROFILEDEF" | "IFCRECTANGLEHOLLOWPROFILEDEF" => { let (x, y) = (num(3) / 2.0, num(4) / 2.0); vec![[-x, -y], [x, -y], [x, y], [-x, y]] }
            "IFCCIRCLEPROFILEDEF" | "IFCCIRCLEHOLLOWPROFILEDEF" => { let r = num(3); (0..28).map(|i| { let t = i as f64 * std::f64::consts::TAU / 28.0; [r * t.cos(), r * t.sin()] }).collect() }
            "IFCELLIPSEPROFILEDEF" => { let (rx, ry) = (num(3), num(4)); (0..28).map(|i| { let t = i as f64 * std::f64::consts::TAU / 28.0; [rx * t.cos(), ry * t.sin()] }).collect() }
            "IFCISHAPEPROFILEDEF" => { let (w, h, tw, tf) = (num(3) / 2.0, num(4) / 2.0, num(5) / 2.0, num(6)); vec![[-w, -h], [w, -h], [w, -h + tf], [tw, -h + tf], [tw, h - tf], [w, h - tf], [w, h], [-w, h], [-w, h - tf], [-tw, h - tf], [-tw, -h + tf], [-w, -h + tf]] }
            "IFCLSHAPEPROFILEDEF" => { let (d, w, t) = (num(3), if a.get(4).and_then(|v| v.num()).is_some() { num(4) } else { num(3) }, num(5)); vec![[0.0, 0.0], [w, 0.0], [w, t], [t, t], [t, d], [0.0, d]] }
            "IFCARBITRARYCLOSEDPROFILEDEF" | "IFCARBITRARYPROFILEDEFWITHVOIDS" => { let c = a.get(2).and_then(|v| v.rf())?; return self.curve2d(c); }
            _ => { self.skip(&ty); return None; }
        };
        let m = if matches!(ty.as_str(), "IFCARBITRARYCLOSEDPROFILEDEF" | "IFCARBITRARYPROFILEDEFWITHVOIDS") { M::ident() } else { pos(self) };
        Some(raw.iter().map(|p| { let q = m.apply([p[0], p[1], 0.0]); [q[0], q[1]] }).collect())
    }
    fn curve2d(&mut self, id: u32) -> Option<Vec<[f64; 2]>> {
        let ty = self.s.type_of(id).to_string(); let a = self.a(id);
        let mut pts: Vec<[f64; 2]> = match ty.as_str() {
            "IFCPOLYLINE" => a.get(0)?.refs().iter().map(|&r| { let p = self.point(r); [p[0], p[1]] }).collect(),
            "IFCINDEXEDPOLYCURVE" => { let pl = a.get(0)?.rf()?; let pa = self.a(pl); pa.get(0)?.list().iter().map(|v| { let l = v.list(); [l.get(0).and_then(|x| x.num()).unwrap_or(0.0) * self.scale, l.get(1).and_then(|x| x.num()).unwrap_or(0.0) * self.scale] }).collect() }
            _ => { self.skip(&ty); return None; }
        };
        if pts.len() > 1 && pts[0] == pts[pts.len() - 1] { pts.pop(); }
        if pts.len() < 3 { None } else { Some(pts) }
    }

    fn extruded(&mut self, id: u32, m: &M) {
        let a = self.a(id);
        let ring = match a.get(0).and_then(|v| v.rf()).and_then(|r| self.profile(r)) { Some(r) => r, None => return };
        let pos = a.get(1).and_then(|v| v.rf()).map(|r| self.axis3(r)).unwrap_or_else(M::ident);
        let dir = a.get(2).and_then(|v| v.rf()).map(|r| self.dir(r)).unwrap_or([0.0, 0.0, 1.0]);
        let depth = a.get(3).and_then(|v| v.num()).unwrap_or(0.0) * self.scale;
        let d = [dir[0] * depth, dir[1] * depth, dir[2] * depth];
        let mw = m.mul(&pos); let n = ring.len();
        let bot: Vec<P3> = ring.iter().map(|p| mw.apply([p[0], p[1], 0.0])).collect();
        let top: Vec<P3> = ring.iter().map(|p| mw.apply([p[0] + d[0], p[1] + d[1], d[2]])).collect();
        for t in ear_clip(&ring) { self.tri(bot[t[0]], bot[t[1]], bot[t[2]]); self.tri(top[t[0]], top[t[1]], top[t[2]]); }
        for i in 0..n { let j = (i + 1) % n; self.tri(bot[i], bot[j], top[j]); self.tri(bot[i], top[j], top[i]); }
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
                let fa = self.s.args(r); let l = fa.get(0).map(|v| v.list()).unwrap_or(&[]);
                let poly: Vec<P3> = l.iter().filter_map(|v| v.num()).filter_map(|n| pts.get((n as usize).wrapping_sub(1)).copied()).collect();
                self.poly(&poly);
            }
        }
    }
    fn shell(&mut self, id: u32, m: &M) {
        let a = self.a(id);
        for f in a.get(0).map(|v| v.refs()).unwrap_or_default() {
            let fa = self.a(f); let bounds = fa.get(0).map(|v| v.refs()).unwrap_or_default();
            let b = bounds.iter().find(|&&b| self.s.type_of(b) == "IFCFACEOUTERBOUND").or(bounds.first()).copied();
            if let Some(b) = b { let ba = self.a(b); if let Some(l) = ba.get(0).and_then(|v| v.rf()) { let la = self.a(l);
                let poly: Vec<P3> = la.get(0).map(|v| v.refs()).unwrap_or_default().iter().map(|&r| m.apply(self.point(r))).collect(); self.poly(&poly); } }
        }
    }
    fn item(&mut self, id: u32, m: &M, depth: u32) {
        if depth > 8 { return; }
        let saved = self.cur; if let Some(c) = self.colors.get(&id) { self.cur = *c; }
        let ty = self.s.type_of(id).to_string();
        match ty.as_str() {
            "IFCEXTRUDEDAREASOLID" | "IFCEXTRUDEDAREASOLIDTAPERED" => self.extruded(id, m),
            "IFCTRIANGULATEDFACESET" => self.faceset(id, m, false),
            "IFCPOLYGONALFACESET" => self.faceset(id, m, true),
            "IFCFACETEDBREP" | "IFCFACETEDBREPWITHVOIDS" => { let a = self.a(id); if let Some(o) = a.get(0).and_then(|v| v.rf()) { self.shell(o, m); } }
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

pub fn build(s: &Step) -> Built {
    // enhet
    let mut scale = 1.0;
    for e in s.ents.iter().filter(|e| s.types[e.ty as usize] == "IFCSIUNIT") {
        let a = s.args(e.id);
        if let Some(V::Enum(u)) = a.get(1) { if u == "LENGTHUNIT" { scale = match a.get(2) { Some(V::Enum(p)) => match p.as_str() { "MILLI" => 0.001, "CENTI" => 0.01, "DECI" => 0.1, "KILO" => 1000.0, _ => 1.0 }, _ => 1.0 }; } }
    }
    let mut b = B { s, scale, cache: RefCell::new(HashMap::new()), place: HashMap::new(), colors: HashMap::new(), cur: [190, 196, 204, 255], cur_obj: 0,
        origin: None, opaque: Vec::new(), transp: Vec::new(), skipped: HashMap::new(), bmin: [f32::MAX; 3], bmax: [f32::MIN; 3], tris: 0 };
    // färger på ytor
    for e in s.ents.iter().filter(|e| s.types[e.ty as usize] == "IFCSTYLEDITEM") {
        let a = s.args(e.id);
        if let Some(item) = a.get(0).and_then(|v| v.rf()) { for st in a.get(1).map(|v| v.refs()).unwrap_or_default() { if let Some(c) = colour_of(s, st, 0) { b.colors.insert(item, c); break; } } }
    }
    let pds: std::collections::HashSet<u32> = s.ents.iter().filter(|e| s.types[e.ty as usize] == "IFCPRODUCTDEFINITIONSHAPE").map(|e| e.id).collect();
    let skip_ty: std::collections::HashSet<&str> = ["IFCCARTESIANPOINT", "IFCDIRECTION", "IFCPOLYLOOP", "IFCFACE", "IFCFACEOUTERBOUND", "IFCFACEBOUND", "IFCAXIS2PLACEMENT3D", "IFCAXIS2PLACEMENT2D", "IFCLOCALPLACEMENT", "IFCPROPERTYSINGLEVALUE", "IFCPROPERTYSET", "IFCOWNERHISTORY", "IFCRELDEFINESBYPROPERTIES", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCPOLYLINE", "IFCSHAPEREPRESENTATION", "IFCPRODUCTDEFINITIONSHAPE", "IFCEXTRUDEDAREASOLID", "IFCTRIANGULATEDFACESET", "IFCCARTESIANPOINTLIST3D", "IFCSTYLEDITEM", "IFCCOLOURRGB", "IFCCLOSEDSHELL", "IFCRECTANGLEPROFILEDEF", "IFCMAPPEDITEM", "IFCREPRESENTATIONMAP"].into_iter().collect();
    let mut objs = Vec::new();
    for e in s.ents.iter() {
        let tn = &s.types[e.ty as usize];
        if tn.is_empty() || skip_ty.contains(tn.as_str()) || !tn.starts_with("IFC") || tn == "IFCOPENINGELEMENT" { continue; }
        let k = s.by_id[e.id as usize] as usize - 1;
        let pd = match s.arg_ref(k, 6) { Some(p) if pds.contains(&p) => p, _ => continue };
        let a = s.args(e.id);
        let oi = objs.len() as u32;
        b.cur_obj = oi; b.cur = default_color(tn); b.bmin = [f32::MAX; 3]; b.bmax = [f32::MIN; 3]; b.tris = 0;
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
    fn vagg_i_millimeter_blir_12_trianglar_i_meter() {
        let s = Step::parse(SAMPLE.as_bytes()).unwrap(); let b = build(&s);
        assert_eq!(b.objs.len(), 1); assert_eq!(b.objs[0].tris, 12); assert!((b.scale - 0.001).abs() < 1e-12);
        let o = &b.objs[0]; assert!((o.bmax[2] - o.bmin[2] - 3.0).abs() < 1e-4 && (o.bmax[0] - o.bmin[0] - 2.0).abs() < 1e-4);
    }
}
