//! Modellen i minnet: objekt, rumsindelning, egenskaper, sökning, markering (BVH) och redigering av egenskaper.
use crate::bvh::{Bvh, P};
use crate::ifc;
use crate::step::{encode_str, Step, V};
use std::collections::HashMap;

pub struct Obj { pub id: u32, pub class: u32, pub guid: String, pub name: String, pub cont: u32, pub bmin: [f32; 3], pub bmax: [f32; 3], pub tris: u32 }
pub struct Cont { pub name: String, pub class: String }

pub struct Model {
    pub step: Step, pub objs: Vec<Obj>, pub verts: Vec<u8>, pub n_opaque: u32, pub origin: [f64; 3], pub scale: f64,
    pub classes: Vec<String>, pub containers: Vec<Cont>, pub defs: HashMap<u32, Vec<u32>>, pub hay: Vec<String>,
    pub skipped: Vec<(String, u32)>, pub bvh: Bvh, pub by_id: HashMap<u32, u32>, pub tri_by_obj: Vec<Vec<u32>>,
}

pub fn esc(s: &str, o: &mut String) {
    o.push('"');
    for c in s.chars() { match c { '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => {}, '\t' => o.push(' '), c if (c as u32) < 32 => {}, c => o.push(c) } }
    o.push('"');
}
pub fn fmt_num(n: f64) -> String { if n.fract() == 0.0 && n.abs() < 1e15 { format!("{}", n as i64) } else { let s = format!("{:.6}", n); s.trim_end_matches('0').trim_end_matches('.').to_string() } }

fn vtext(v: &V) -> String {
    match v {
        V::Typed(_, a) => a.iter().map(vtext).collect::<Vec<_>>().join(", "),
        V::Str(s) => s.clone(), V::Num(n) => fmt_num(*n),
        V::Enum(e) => match e.as_str() { "T" => "true".into(), "F" => "false".into(), "U" => "okänt".into(), x => x.to_string() },
        V::Ref(r) => format!("#{}", r), V::List(l) => l.iter().map(vtext).collect::<Vec<_>>().join(", "), V::Null => String::new(),
    }
}
fn vkind(v: &V) -> String { match v { V::Typed(t, _) => t.clone(), V::Str(_) => "STRING".into(), V::Num(_) => "NUMBER".into(), _ => String::new() } }

impl Model {
    pub fn load(bytes: &[u8]) -> Result<Model, String> {
        let step = Step::parse(bytes)?;
        let built = ifc::build(&step);
        let mut classes: Vec<String> = Vec::new(); let mut cix: HashMap<String, u32> = HashMap::new();
        let mut objs = Vec::with_capacity(built.objs.len());
        for r in &built.objs {
            let ty = step.type_of(r.id).to_string();
            let ci = *cix.entry(ty.clone()).or_insert_with(|| { classes.push(ty.clone()); classes.len() as u32 - 1 });
            let a = step.args(r.id);
            let name = a.get(2).and_then(|v| v.str()).unwrap_or("").to_string(); let guid = a.get(0).and_then(|v| v.str()).unwrap_or("").to_string();
            objs.push(Obj { id: r.id, class: ci, guid, name, cont: 0, bmin: r.bmin, bmax: r.bmax, tris: r.tris });
        }
        let by_id: HashMap<u32, u32> = objs.iter().enumerate().map(|(i, o)| (o.id, i as u32)).collect();
        // rumsindelning
        let mut containers: Vec<Cont> = vec![Cont { name: "(utan våning)".into(), class: String::new() }];
        let mut cmap: HashMap<u32, u32> = HashMap::new();
        for e in step.ents.iter().filter(|e| step.types[e.ty as usize] == "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
            let a = step.args(e.id); let st = match a.get(5).and_then(|v| v.rf()) { Some(s) => s, None => continue };
            let ci = *cmap.entry(st).or_insert_with(|| { let sa = step.args(st); containers.push(Cont { name: sa.get(2).and_then(|v| v.str()).unwrap_or("").to_string(), class: step.type_of(st).to_string() }); containers.len() as u32 - 1 });
            for r in a.get(4).map(|v| v.refs()).unwrap_or_default() { if let Some(&oi) = by_id.get(&r) { objs[oi as usize].cont = ci; } }
        }
        let mut parent: HashMap<u32, u32> = HashMap::new();
        for e in step.ents.iter().filter(|e| step.types[e.ty as usize] == "IFCRELAGGREGATES") {
            let a = step.args(e.id); if let Some(p) = a.get(4).and_then(|v| v.rf()) { for r in a.get(5).map(|v| v.refs()).unwrap_or_default() { parent.insert(r, p); } }
        }
        for oi in 0..objs.len() { if objs[oi].cont == 0 { let mut p = objs[oi].id; for _ in 0..6 { match parent.get(&p) { Some(&q) => { p = q; if let Some(&k) = by_id.get(&q) { if objs[k as usize].cont != 0 { objs[oi].cont = objs[k as usize].cont; break; } } if let Some(&ci) = cmap.get(&q) { objs[oi].cont = ci; break; } } None => break } } } }
        // egenskapsmängder
        let mut defs: HashMap<u32, Vec<u32>> = HashMap::new();
        for e in step.ents.iter() {
            let t = &step.types[e.ty as usize];
            if t == "IFCRELDEFINESBYPROPERTIES" { let a = step.args(e.id); if let Some(d) = a.get(5).and_then(|v| v.rf()) { for r in a.get(4).map(|v| v.refs()).unwrap_or_default() { defs.entry(r).or_default().push(d); } } }
            else if t == "IFCRELDEFINESBYTYPE" { let a = step.args(e.id); if let Some(ty) = a.get(5).and_then(|v| v.rf()) { let ta = step.args(ty); let sets = ta.get(5).map(|v| v.refs()).unwrap_or_default(); for r in a.get(4).map(|v| v.refs()).unwrap_or_default() { for s in &sets { defs.entry(r).or_default().push(*s); } } } }
        }
        // geometri
        let mut verts = built.opaque; let n_opaque = (verts.len() / 20) as u32; verts.extend_from_slice(&built.transp);
        let mut tris: Vec<[P; 3]> = Vec::with_capacity(verts.len() / 60);
        let rd = |o: usize| f32::from_le_bytes([verts[o], verts[o + 1], verts[o + 2], verts[o + 3]]);
        for t in 0..verts.len() / 60 { let mut tr = [[0.0f32; 3]; 3]; for k in 0..3 { let o = (t * 3 + k) * 20; tr[k] = [rd(o), rd(o + 4), rd(o + 8)]; } tris.push(tr); }
        let bvh = Bvh::build(tris);
        let mut skipped: Vec<(String, u32)> = built.skipped.into_iter().collect(); skipped.sort_by(|a, b| b.1.cmp(&a.1));
        let mut tri_by_obj: Vec<Vec<u32>> = vec![Vec::new(); objs.len()];
        for t in 0..(verts.len() / 60) { let o = (t * 3) * 20 + 16; let oi = u32::from_le_bytes([verts[o], verts[o + 1], verts[o + 2], verts[o + 3]]) as usize; if oi < tri_by_obj.len() { tri_by_obj[oi].push(t as u32); } }
        let mut m = Model { step, objs, verts, n_opaque, origin: built.origin.unwrap_or([0.0; 3]), scale: built.scale, classes, containers, defs, hay: vec![], skipped, bvh, by_id, tri_by_obj };
        m.build_hay();
        Ok(m)
    }

    fn pset_rows(&self, oi: usize) -> Vec<(String, Vec<(u32, String, String, String, bool)>)> {
        let mut out = Vec::new();
        let ds = match self.defs.get(&self.objs[oi].id) { Some(d) => d, None => return out };
        for &d in ds {
            let a = self.step.args(d); let ty = self.step.type_of(d); let name = a.get(2).and_then(|v| v.str()).unwrap_or("").to_string();
            let mut rows = Vec::new();
            match ty {
                "IFCPROPERTYSET" => for p in a.get(4).map(|v| v.refs()).unwrap_or_default() {
                    let pa = self.step.args(p); let pt = self.step.type_of(p); let pn = pa.get(0).and_then(|v| v.str()).unwrap_or("").to_string();
                    match pt {
                        "IFCPROPERTYSINGLEVALUE" => { let v = pa.get(2).cloned().unwrap_or(V::Null); rows.push((p, pn, vtext(&v), vkind(&v), true)); }
                        "IFCPROPERTYENUMERATEDVALUE" => { let v = pa.get(2).cloned().unwrap_or(V::Null); rows.push((p, pn, vtext(&v), "ENUM".into(), false)); }
                        "IFCPROPERTYBOUNDEDVALUE" => { let lo = pa.get(3).map(vtext).unwrap_or_default(); let up = pa.get(2).map(vtext).unwrap_or_default(); rows.push((p, pn, format!("{} – {}", lo, up), "BOUNDED".into(), false)); }
                        _ => {}
                    }
                },
                "IFCELEMENTQUANTITY" => for q in a.get(5).map(|v| v.refs()).unwrap_or_default() {
                    let qa = self.step.args(q); let qn = qa.get(0).and_then(|v| v.str()).unwrap_or("").to_string(); let qt = self.step.type_of(q).trim_start_matches("IFCQUANTITY").to_string();
                    rows.push((q, qn, qa.get(3).map(vtext).unwrap_or_default(), qt, false));
                },
                _ => {}
            }
            out.push((name, rows));
        }
        out
    }

    fn build_hay(&mut self) {
        let mut hay = Vec::with_capacity(self.objs.len());
        for oi in 0..self.objs.len() {
            let o = &self.objs[oi];
            let mut h = format!("{} {} {}", self.classes[o.class as usize].trim_start_matches("IFC"), o.name, self.containers[o.cont as usize].name);
            let a = self.step.args(o.id);
            for i in [3usize, 4, 7] { if let Some(s) = a.get(i).and_then(|v| v.str()) { h.push(' '); h.push_str(s); } }
            for (n, rows) in self.pset_rows(oi) { h.push(' '); h.push_str(&n); for r in rows { h.push(' '); h.push_str(&r.1); h.push(' '); h.push_str(&r.2); } }
            hay.push(h.to_lowercase());
        }
        self.hay = hay;
    }

    pub fn summary(&self) -> String {
        let nv = self.verts.len() / 20;
        let (mut mn, mut mx) = ([f32::MAX; 3], [f32::MIN; 3]);
        for o in &self.objs { for k in 0..3 { if o.bmin[k] < mn[k] { mn[k] = o.bmin[k]; } if o.bmax[k] > mx[k] { mx[k] = o.bmax[k]; } } }
        if self.objs.is_empty() { mn = [0.0; 3]; mx = [0.0; 3]; }
        let mut s = String::new();
        s.push_str(&format!("{{\"objects\":{},\"tris\":{},\"verts\":{},\"opaque\":{},\"scale\":{},\"origin\":[{},{},{}],\"bbox\":[{},{},{},{},{},{}],\"entities\":{},\"skipped\":[", self.objs.len(), nv / 3, nv, self.n_opaque, self.scale, self.origin[0], self.origin[1], self.origin[2], mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], self.step.ents.len()));
        for (i, (t, n)) in self.skipped.iter().enumerate() { if i > 0 { s.push(','); } s.push('['); esc(t, &mut s); s.push_str(&format!(",{}]", n)); }
        s.push_str("]}"); s
    }

    pub fn objects_json(&self) -> String {
        let mut s = String::from("{\"classes\":[");
        for (i, c) in self.classes.iter().enumerate() { if i > 0 { s.push(','); } esc(c, &mut s); }
        s.push_str("],\"containers\":[");
        for (i, c) in self.containers.iter().enumerate() { if i > 0 { s.push(','); } s.push('['); esc(&c.name, &mut s); s.push(','); esc(&c.class, &mut s); s.push(']'); }
        s.push_str("],\"objs\":[");
        for (i, o) in self.objs.iter().enumerate() { if i > 0 { s.push(','); } s.push_str(&format!("[{},{},{},", o.id, o.class, o.cont)); esc(&o.name, &mut s); s.push(','); esc(&o.guid, &mut s); s.push(']'); }
        s.push_str("]}"); s
    }

    pub fn object_json(&self, oi: usize) -> String {
        let o = &self.objs[oi]; let a = self.step.args(o.id);
        let g = |i: usize| a.get(i).and_then(|v| v.str()).unwrap_or("").to_string();
        let mut s = String::from("{\"id\":"); s.push_str(&o.id.to_string()); s.push_str(",\"class\":"); esc(&self.classes[o.class as usize], &mut s);
        for (k, i) in [("guid", 0usize), ("name", 2), ("desc", 3), ("type", 4), ("tag", 7)] { s.push_str(&format!(",\"{}\":", k)); esc(&g(i), &mut s); }
        s.push_str(",\"container\":"); esc(&self.containers[o.cont as usize].name, &mut s);
        s.push_str(&format!(",\"tris\":{},\"bbox\":[{},{},{},{},{},{}],\"psets\":[", o.tris, o.bmin[0], o.bmin[1], o.bmin[2], o.bmax[0], o.bmax[1], o.bmax[2]));
        for (i, (n, rows)) in self.pset_rows(oi).iter().enumerate() {
            if i > 0 { s.push(','); } s.push_str("{\"name\":"); esc(n, &mut s); s.push_str(",\"props\":[");
            for (j, r) in rows.iter().enumerate() { if j > 0 { s.push(','); } s.push_str(&format!("{{\"id\":{},\"name\":", r.0)); esc(&r.1, &mut s); s.push_str(",\"value\":"); esc(&r.2, &mut s); s.push_str(",\"kind\":"); esc(&r.3, &mut s); s.push_str(&format!(",\"edit\":{}}}", r.4)); }
            s.push_str("]}");
        }
        s.push_str("]}"); s
    }

    pub fn search(&self, q: &str) -> Vec<u32> {
        let toks: Vec<String> = q.to_lowercase().split_whitespace().map(|t| t.to_string()).collect();
        if toks.is_empty() { return vec![]; }
        self.hay.iter().enumerate().filter(|(_, h)| toks.iter().all(|t| h.contains(t.as_str()))).map(|(i, _)| i as u32).collect()
    }

    pub fn set_attr(&mut self, oi: usize, ix: usize, text: &str) -> bool {
        let id = self.objs[oi].id; let ok = self.step.set_arg(id, ix, &encode_str(text));
        if ok && ix == 2 { self.objs[oi].name = text.to_string(); }
        if ok { let a = self.step.args(id); let _ = a; self.rebuild_one(oi); }
        ok
    }
    fn rebuild_one(&mut self, oi: usize) {
        let o = &self.objs[oi];
        let mut h = format!("{} {} {}", self.classes[o.class as usize].trim_start_matches("IFC"), o.name, self.containers[o.cont as usize].name);
        let a = self.step.args(o.id);
        for i in [3usize, 4, 7] { if let Some(s) = a.get(i).and_then(|v| v.str()) { h.push(' '); h.push_str(s); } }
        for (n, rows) in self.pset_rows(oi) { h.push(' '); h.push_str(&n); for r in rows { h.push(' '); h.push_str(&r.1); h.push(' '); h.push_str(&r.2); } }
        self.hay[oi] = h.to_lowercase();
    }
    pub fn set_prop(&mut self, prop: u32, text: &str) -> Result<(), String> {
        if self.step.type_of(prop) != "IFCPROPERTYSINGLEVALUE" { return Err("Bara enkla egenskapsvärden kan ändras".into()); }
        let a = self.step.args(prop);
        let kind = match a.get(2) { Some(V::Typed(t, _)) => t.clone(), _ => "IFCLABEL".to_string() };
        let t = text.trim();
        let val = if kind == "IFCBOOLEAN" || kind == "IFCLOGICAL" {
            let l = t.to_lowercase(); format!("{}(.{}.)", kind, if matches!(l.as_str(), "true" | "sant" | "ja" | "1" | "yes" | "t") { "T" } else { "F" })
        } else if kind == "IFCINTEGER" || kind == "IFCCOUNTMEASURE" {
            let n: f64 = t.replace(',', ".").parse().map_err(|_| "Skriv ett heltal".to_string())?; format!("{}({})", kind, n.round() as i64)
        } else if kind.ends_with("MEASURE") || kind == "IFCREAL" || kind.starts_with("IFCPOSITIVE") || kind == "IFCNORMALISEDRATIOMEASURE" {
            let n: f64 = t.replace(',', ".").parse().map_err(|_| "Skriv ett tal".to_string())?; let mut s = format!("{}", n); if !s.contains('.') && !s.contains('e') { s.push('.'); } format!("{}({})", kind, s)
        } else { format!("{}({})", kind, encode_str(text)) };
        if !self.step.set_arg(prop, 2, &val) { return Err("Kunde inte skriva värdet".into()); }
        // uppdatera sökbar text för objekt som använder egenskapen
        for oi in 0..self.objs.len() { let id = self.objs[oi].id; if self.defs.get(&id).map(|d| d.iter().any(|x| self.step.args(*x).get(4).map(|v| v.refs().contains(&prop)).unwrap_or(false))).unwrap_or(false) { self.rebuild_one(oi); } }
        Ok(())
    }

    pub fn obj_of_tri(&self, t: u32) -> u32 { let o = (t as usize * 3) * 20 + 16; u32::from_le_bytes([self.verts[o], self.verts[o + 1], self.verts[o + 2], self.verts[o + 3]]) }
}

// ---------- Kanter, mängder och kollisioner ----------
fn tri_of(m: &Model, t: u32) -> [P; 3] { m.bvh.tris[t as usize] }
fn sub3(a: P, b: P) -> P { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
fn cross3(a: P, b: P) -> P { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
fn dot3(a: P, b: P) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

impl Model {
    /// Konturlinjer för ett objekt: kanter som bara hör till en triangel eller där ytorna viker mer än ~25°. Par av punkter (x,y,z,x,y,z).
    pub fn feature_edges(&self, oi: usize) -> Vec<f32> {
        let mut map: HashMap<[i32; 6], (P, P, Vec<P>)> = HashMap::new();
        let q = |p: P| [(p[0] * 2000.0).round() as i32, (p[1] * 2000.0).round() as i32, (p[2] * 2000.0).round() as i32];
        for &t in &self.tri_by_obj[oi] {
            let tr = tri_of(self, t); let n = cross3(sub3(tr[1], tr[0]), sub3(tr[2], tr[0])); let l = dot3(n, n).sqrt(); if l < 1e-12 { continue; } let n = [n[0] / l, n[1] / l, n[2] / l];
            for k in 0..3 { let (a, b) = (tr[k], tr[(k + 1) % 3]); let (qa, qb) = (q(a), q(b)); let key = if qa < qb { [qa[0], qa[1], qa[2], qb[0], qb[1], qb[2]] } else { [qb[0], qb[1], qb[2], qa[0], qa[1], qa[2]] };
                map.entry(key).or_insert((a, b, Vec::new())).2.push(n); }
        }
        let mut out = Vec::new(); let cos_lim = 0.9;
        for (_, (a, b, ns)) in map { let keep = ns.len() == 1 || ns.len() > 2 || dot3(ns[0], ns[1]) < cos_lim; if keep { out.extend_from_slice(&[a[0], a[1], a[2], b[0], b[1], b[2]]); if out.len() > 6 * 60000 { break; } } }
        out
    }

    /// Yta, volym (avvikelsesumma över slutna nät) och om nätet ser slutet ut, per objekt.
    pub fn quantities_json(&self) -> String {
        let mut s = String::from("[");
        for oi in 0..self.objs.len() {
            let (mut area, mut vol) = (0.0f64, 0.0f64); let mut edges: HashMap<[i32; 6], i32> = HashMap::new(); let mut und: HashMap<[i32; 6], i32> = HashMap::new();
            let q = |p: P| [(p[0] * 1000.0).round() as i32, (p[1] * 1000.0).round() as i32, (p[2] * 1000.0).round() as i32];
            for &t in &self.tri_by_obj[oi] { let tr = tri_of(self, t); let c = cross3(sub3(tr[1], tr[0]), sub3(tr[2], tr[0])); area += 0.5 * (dot3(c, c) as f64).sqrt(); vol += (dot3(tr[0], cross3(tr[1], tr[2])) as f64) / 6.0;
                for k in 0..3 { let (a, b) = (q(tr[k]), q(tr[(k + 1) % 3])); let (key, d) = if a < b { ([a[0], a[1], a[2], b[0], b[1], b[2]], 1) } else { ([b[0], b[1], b[2], a[0], a[1], a[2]], -1) }; *edges.entry(key).or_insert(0) += d; *und.entry(key).or_insert(0) += 1; } }
            let closed = !und.is_empty() && und.values().all(|c| *c == 2) && edges.values().all(|v| *v == 0);
            if oi > 0 { s.push(','); } s.push_str(&format!("[{:.4},{:.4},{}]", area, vol.abs(), if closed { 1 } else { 0 }));
        }
        s.push(']'); s
    }

    /// Kollisionskontroll: hårda krockar mellan två grupper av objekt (samma grupp = mot sig själv). `min_depth` = minsta överlapp (m) för att räknas.
    pub fn clash(&self, a: &[u32], b: &[u32], min_depth: f32) -> String {
        let same = a == b; let mut found: Vec<(u32, u32, [f32; 3], f32)> = Vec::new();
        let ov = |x: &Obj, y: &Obj| -> Option<f32> { let mut d = f32::MAX; for k in 0..3 { let o = x.bmax[k].min(y.bmax[k]) - x.bmin[k].max(y.bmin[k]); if o <= 0.0 { return None; } if o < d { d = o; } } Some(d) };
        let mut bs: Vec<u32> = b.to_vec(); bs.sort_by(|p, q| self.objs[*p as usize].bmin[0].partial_cmp(&self.objs[*q as usize].bmin[0]).unwrap_or(std::cmp::Ordering::Equal));
        'outer: for &ai in a { let oa = &self.objs[ai as usize];
            for &bi in &bs { let ob = &self.objs[bi as usize]; if ob.bmin[0] > oa.bmax[0] { break; } if same && bi <= ai { continue; } if ai == bi { continue; }
                let d = match ov(oa, ob) { Some(d) => d, None => continue }; if d < min_depth { continue; }
                // trianglar mot trianglar
                let mut hit: Option<[f32; 3]> = None;
                'tri: for &ta in &self.tri_by_obj[ai as usize] { let tra = tri_of(self, ta); let (amn, amx) = tri_box(&tra); if !box_ov(&amn, &amx, &ob.bmin, &ob.bmax) { continue; }
                    for &tb in &self.tri_by_obj[bi as usize] { let trb = tri_of(self, tb); let (bmn, bmx) = tri_box(&trb); if !box_ov(&amn, &amx, &bmn, &bmx) { continue; } if tri_tri(&tra, &trb) { hit = Some([(amn[0].max(bmn[0]) + amx[0].min(bmx[0])) / 2.0, (amn[1].max(bmn[1]) + amx[1].min(bmx[1])) / 2.0, (amn[2].max(bmn[2]) + amx[2].min(bmx[2])) / 2.0]); break 'tri; } } }
                if let Some(p) = hit { found.push((ai, bi, p, d)); if found.len() >= 3000 { break 'outer; } }
            } }
        let mut s = String::from("["); for (i, (x, y, p, d)) in found.iter().enumerate() { if i > 0 { s.push(','); } s.push_str(&format!("[{},{},{:.4},{:.4},{:.4},{:.4}]", x, y, p[0], p[1], p[2], d)); } s.push(']'); s
    }
}
fn tri_box(t: &[P; 3]) -> (P, P) { let mut mn = t[0]; let mut mx = t[0]; for v in t { for k in 0..3 { if v[k] < mn[k] { mn[k] = v[k]; } if v[k] > mx[k] { mx[k] = v[k]; } } } (mn, mx) }
fn box_ov(a0: &P, a1: &P, b0: &P, b1: &P) -> bool { (0..3).all(|k| a0[k] <= b1[k] && b0[k] <= a1[k]) }

/// Triangel–triangel-skärning (Möller 1997). Samplanära trianglar räknas inte som krock.
pub fn tri_tri(a: &[P; 3], b: &[P; 3]) -> bool {
    let n2 = cross3(sub3(b[1], b[0]), sub3(b[2], b[0])); let d2 = -dot3(n2, b[0]);
    let da = [dot3(n2, a[0]) + d2, dot3(n2, a[1]) + d2, dot3(n2, a[2]) + d2]; let eps = 1e-6;
    let da = [if da[0].abs() < eps { 0.0 } else { da[0] }, if da[1].abs() < eps { 0.0 } else { da[1] }, if da[2].abs() < eps { 0.0 } else { da[2] }];
    if da[0] * da[1] > 0.0 && da[0] * da[2] > 0.0 { return false; }
    let n1 = cross3(sub3(a[1], a[0]), sub3(a[2], a[0])); let d1 = -dot3(n1, a[0]);
    let db = [dot3(n1, b[0]) + d1, dot3(n1, b[1]) + d1, dot3(n1, b[2]) + d1];
    let db = [if db[0].abs() < eps { 0.0 } else { db[0] }, if db[1].abs() < eps { 0.0 } else { db[1] }, if db[2].abs() < eps { 0.0 } else { db[2] }];
    if db[0] * db[1] > 0.0 && db[0] * db[2] > 0.0 { return false; }
    if da == [0.0; 3] { return false; }
    let dir = cross3(n1, n2); let mut ax = 0; let mut mx = dir[0].abs(); if dir[1].abs() > mx { ax = 1; mx = dir[1].abs(); } if dir[2].abs() > mx { ax = 2; mx = dir[2].abs(); }
    if mx < 1e-12 { return false; }
    let proj = |t: &[P; 3]| [t[0][ax], t[1][ax], t[2][ax]];
    let interval = |p: [f32; 3], d: [f32; 3]| -> Option<(f32, f32)> {
        // hitta hörnet som ligger ensamt på ena sidan
        let (i, j, k) = if d[0] * d[1] > 0.0 { (2, 0, 1) } else if d[0] * d[2] > 0.0 { (1, 0, 2) } else if d[1] * d[2] > 0.0 || d[0] != 0.0 { (0, 1, 2) } else { (1, 0, 2) };
        let t1 = p[j] + (p[i] - p[j]) * d[j] / (d[j] - d[i]); let t2 = p[k] + (p[i] - p[k]) * d[k] / (d[k] - d[i]);
        if t1.is_finite() && t2.is_finite() { Some((t1.min(t2), t1.max(t2))) } else { None }
    };
    match (interval(proj(a), da), interval(proj(b), db)) { (Some(x), Some(y)) => x.0 <= y.1 && y.0 <= x.1, _ => false }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wall(id: u32, x: f64, name: &str) -> String {
        format!("#{p}=IFCCARTESIANPOINT(({x},0.,0.));\n#{a}=IFCAXIS2PLACEMENT3D(#{p},$,$);\n#{l}=IFCLOCALPLACEMENT($,#{a});\n#{s}=IFCEXTRUDEDAREASOLID(#15,#11,#16,3.);\n#{r}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#{s}));\n#{d}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{r}));\n#{w}=IFCWALL('g{id}',$,'{name}',$,$,#{l},#{d},$);\n", p = id, a = id + 1, l = id + 2, s = id + 3, r = id + 4, d = id + 5, w = id + 6, x = x, id = id, name = name)
    }
    fn sample() -> String {
        let mut t = String::from("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#10=IFCCARTESIANPOINT((0.,0.,0.));\n#11=IFCAXIS2PLACEMENT3D(#10,$,$);\n#13=IFCCARTESIANPOINT((0.,0.));\n#14=IFCAXIS2PLACEMENT2D(#13,$);\n#15=IFCRECTANGLEPROFILEDEF(.AREA.,$,#14,2.,1.);\n#16=IFCDIRECTION((0.,0.,1.));\n");
        t.push_str(&wall(100, 0.0, "A")); t.push_str(&wall(200, 1.0, "B")); t.push_str(&wall(300, 10.0, "C")); t.push_str("ENDSEC;\nEND-ISO-10303-21;"); t
    }
    #[test]
    fn kontur_mangd_och_kollision() {
        let m = Model::load(sample().as_bytes()).unwrap(); assert_eq!(m.objs.len(), 3);
        assert_eq!(m.feature_edges(0).len() / 6, 12, "en låda har 12 konturkanter");
        let q: Vec<serde_like::V> = Vec::new(); let _ = q;
        let j = m.quantities_json(); assert!(j.starts_with("[[22.0000,6.0000,1]"), "{}", j);
        let r = m.clash(&[0, 1, 2], &[0, 1, 2], 0.0); assert!(r.starts_with("[[0,1,") && r.matches('[').count() == 2, "{}", r);
        let none = m.clash(&[0], &[2], 0.0); assert_eq!(none, "[]");
    }
}
mod serde_like { pub struct V; }
