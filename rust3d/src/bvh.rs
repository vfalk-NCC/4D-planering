//! BVH över trianglar: strålträff (markering/mått) och närmaste punkt på modellen (avvikelseanalys).
pub type P = [f32; 3];

#[derive(Clone, Copy)]
struct Node { min: P, max: P, a: u32, n: u32 } // n>0: blad (a = första index i `order`), annars a = vänster barn (höger = a+1)

pub struct Bvh { nodes: Vec<Node>, order: Vec<u32>, pub tris: Vec<[P; 3]> }

pub struct Hit { pub tri: u32, pub t: f32, pub p: P }

fn sub(a: P, b: P) -> P { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn dot(a: P, b: P) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn cross(a: P, b: P) -> P { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }

impl Bvh {
    pub fn build(tris: Vec<[P; 3]>) -> Bvh {
        let n = tris.len();
        let mut order: Vec<u32> = (0..n as u32).collect();
        let cen: Vec<P> = tris.iter().map(|t| [(t[0][0] + t[1][0] + t[2][0]) / 3.0, (t[0][1] + t[1][1] + t[2][1]) / 3.0, (t[0][2] + t[1][2] + t[2][2]) / 3.0]).collect();
        let mut nodes: Vec<Node> = Vec::with_capacity(n / 2 + 2);
        if n == 0 { return Bvh { nodes, order, tris }; }
        nodes.push(Node { min: [0.0; 3], max: [0.0; 3], a: 0, n: 0 });
        let mut stack: Vec<(usize, usize, usize)> = vec![(0, 0, n)]; // nod, start, slut
        while let Some((ni, s, e)) = stack.pop() {
            let (mut mn, mut mx) = ([f32::MAX; 3], [f32::MIN; 3]);
            for &ti in &order[s..e] { for v in &tris[ti as usize] { for k in 0..3 { if v[k] < mn[k] { mn[k] = v[k]; } if v[k] > mx[k] { mx[k] = v[k]; } } } }
            nodes[ni].min = mn; nodes[ni].max = mx;
            if e - s <= 4 { nodes[ni].a = s as u32; nodes[ni].n = (e - s) as u32; continue; }
            let ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
            let ax = if ext[0] >= ext[1] && ext[0] >= ext[2] { 0 } else if ext[1] >= ext[2] { 1 } else { 2 };
            let mid = (s + e) / 2;
            order[s..e].select_nth_unstable_by(mid - s, |a, b| cen[*a as usize][ax].partial_cmp(&cen[*b as usize][ax]).unwrap_or(std::cmp::Ordering::Equal));
            let l = nodes.len(); nodes.push(Node { min: [0.0; 3], max: [0.0; 3], a: 0, n: 0 }); nodes.push(Node { min: [0.0; 3], max: [0.0; 3], a: 0, n: 0 });
            nodes[ni].a = l as u32; nodes[ni].n = 0;
            stack.push((l, s, mid)); stack.push((l + 1, mid, e));
        }
        Bvh { nodes, order, tris }
    }

    fn box_t(&self, n: &Node, o: P, inv: P, tmax: f32) -> bool {
        let (mut t0, mut t1) = (0.0f32, tmax);
        for k in 0..3 {
            let a = (n.min[k] - o[k]) * inv[k]; let b = (n.max[k] - o[k]) * inv[k];
            let (lo, hi) = if a < b { (a, b) } else { (b, a) };
            if lo > t0 { t0 = lo; } if hi < t1 { t1 = hi; }
            if t0 > t1 { return false; }
        }
        true
    }

    /// Närmaste träff längs strålen (o, d) – d behöver inte vara normaliserad (t i enheter av d).
    pub fn ray(&self, o: P, d: P, tmax: f32, skip: &dyn Fn(u32) -> bool) -> Option<Hit> {
        if self.nodes.is_empty() { return None; }
        let inv = [1.0 / if d[0] == 0.0 { 1e-30 } else { d[0] }, 1.0 / if d[1] == 0.0 { 1e-30 } else { d[1] }, 1.0 / if d[2] == 0.0 { 1e-30 } else { d[2] }];
        let mut best: Option<Hit> = None; let mut tm = tmax;
        let mut st = vec![0usize];
        while let Some(ni) = st.pop() {
            let nd = &self.nodes[ni];
            if !self.box_t(nd, o, inv, tm) { continue; }
            if nd.n > 0 {
                for k in 0..nd.n { let ti = self.order[(nd.a + k) as usize]; if skip(ti) { continue; }
                    if let Some(t) = tri_ray(&self.tris[ti as usize], o, d) { if t < tm { tm = t; best = Some(Hit { tri: ti, t, p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] }); } } }
            } else { st.push(nd.a as usize); st.push(nd.a as usize + 1); }
        }
        best
    }

    /// Närmaste punkt på någon triangel inom `maxd`; returnerar (avstånd, punkt).
    pub fn closest(&self, p: P, maxd: f32) -> Option<(f32, P)> {
        if self.nodes.is_empty() { return None; }
        let mut best = maxd * maxd; let mut bp: Option<P> = None;
        let mut st = vec![0usize];
        while let Some(ni) = st.pop() {
            let nd = &self.nodes[ni];
            if box_d2(nd, p) > best { continue; }
            if nd.n > 0 {
                for k in 0..nd.n { let ti = self.order[(nd.a + k) as usize]; let q = closest_on_tri(p, &self.tris[ti as usize]); let d = sub(q, p); let d2 = dot(d, d); if d2 < best { best = d2; bp = Some(q); } }
            } else {
                let (l, r) = (nd.a as usize, nd.a as usize + 1);
                let (dl, dr) = (box_d2(&self.nodes[l], p), box_d2(&self.nodes[r], p));
                if dl < dr { st.push(r); st.push(l); } else { st.push(l); st.push(r); }
            }
        }
        bp.map(|q| (best.sqrt(), q))
    }
}

fn box_d2(n: &Node, p: P) -> f32 {
    let mut d = 0.0; for k in 0..3 { let v = if p[k] < n.min[k] { n.min[k] - p[k] } else if p[k] > n.max[k] { p[k] - n.max[k] } else { 0.0 }; d += v * v; } d
}

fn tri_ray(t: &[P; 3], o: P, d: P) -> Option<f32> {
    let e1 = sub(t[1], t[0]); let e2 = sub(t[2], t[0]);
    let h = cross(d, e2); let a = dot(e1, h);
    if a.abs() < 1e-12 { return None; }
    let f = 1.0 / a; let s = sub(o, t[0]); let u = f * dot(s, h);
    if !(0.0..=1.0).contains(&u) { return None; }
    let q = cross(s, e1); let v = f * dot(d, q);
    if v < 0.0 || u + v > 1.0 { return None; }
    let tt = f * dot(e2, q);
    if tt > 1e-6 { Some(tt) } else { None }
}

/// Närmaste punkt på triangeln (Ericson, Real-Time Collision Detection).
pub fn closest_on_tri(p: P, t: &[P; 3]) -> P {
    let (a, b, c) = (t[0], t[1], t[2]);
    let ab = sub(b, a); let ac = sub(c, a); let ap = sub(p, a);
    let d1 = dot(ab, ap); let d2 = dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 { return a; }
    let bp = sub(p, b); let d3 = dot(ab, bp); let d4 = dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 { return b; }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 { let v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
    let cp = sub(p, c); let d5 = dot(ab, cp); let d6 = dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 { return c; }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 { let w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 { let w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); let bc = sub(c, b); return [b[0] + bc[0] * w, b[1] + bc[1] * w, b[2] + bc[2] * w]; }
    let den = 1.0 / (va + vb + vc); let v = vb * den; let w = vc * den;
    [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]
}

#[cfg(test)]
mod tests {
    use super::*;
    fn quad_tris(z: f32) -> Vec<[P; 3]> { vec![[[0.0, 0.0, z], [10.0, 0.0, z], [10.0, 10.0, z]], [[0.0, 0.0, z], [10.0, 10.0, z], [0.0, 10.0, z]]] }
    #[test]
    fn stral_traffar_narmaste_plan() {
        let mut t = quad_tris(0.0); t.extend(quad_tris(5.0));
        let b = Bvh::build(t);
        let h = b.ray([3.0, 4.0, 20.0], [0.0, 0.0, -1.0], 1e9, &|_| false).unwrap();
        assert!((h.t - 15.0).abs() < 1e-4 && (h.p[2] - 5.0).abs() < 1e-4);
        assert!(b.ray([30.0, 4.0, 20.0], [0.0, 0.0, -1.0], 1e9, &|_| false).is_none());
    }
    #[test]
    fn narmaste_punkt_och_avstand() {
        let b = Bvh::build(quad_tris(0.0));
        let (d, q) = b.closest([5.0, 5.0, 2.0], 100.0).unwrap(); assert!((d - 2.0).abs() < 1e-4 && (q[2]).abs() < 1e-5);
        let (d2, _) = b.closest([13.0, 5.0, 0.0], 100.0).unwrap(); assert!((d2 - 3.0).abs() < 1e-4);
        assert!(b.closest([0.0, 0.0, 50.0], 10.0).is_none());
    }
    #[test]
    fn manga_trianglar_bygger_och_svarar() {
        let mut t = Vec::new(); for i in 0..5000 { let x = (i % 100) as f32; let y = (i / 100) as f32; t.push([[x, y, 0.0], [x + 1.0, y, 0.0], [x, y + 1.0, 0.0]]); }
        let b = Bvh::build(t); let h = b.ray([50.2, 20.2, 9.0], [0.0, 0.0, -1.0], 1e9, &|_| false).unwrap(); assert!((h.p[0] - 50.2).abs() < 1e-4);
    }
}
