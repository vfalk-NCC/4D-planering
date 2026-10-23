//! Modellen i minnet: objekt, rumsindelning, egenskaper, sökning, markering (BVH) och redigering av egenskaper.
use crate::bvh::{Bvh, P};
use crate::ifc;
use crate::step::{encode_str, Step, V};
use std::collections::HashMap;

pub struct Obj { pub id: u32, pub class: u32, pub name: String, pub cont: u32, pub bmin: [f32; 3], pub bmax: [f32; 3], pub tris: u32 }
pub struct Cont { pub name: String, pub class: String }

pub struct Model {
    pub step: Step, pub objs: Vec<Obj>, pub verts: Vec<u8>, pub n_opaque: u32, pub origin: [f64; 3], pub scale: f64,
    pub classes: Vec<String>, pub containers: Vec<Cont>, pub defs: HashMap<u32, Vec<u32>>, pub hay: Vec<String>,
    pub skipped: Vec<(String, u32)>, pub bvh: Bvh, pub by_id: HashMap<u32, u32>,
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
            let name = a.get(2).and_then(|v| v.str()).unwrap_or("").to_string();
            objs.push(Obj { id: r.id, class: ci, name, cont: 0, bmin: r.bmin, bmax: r.bmax, tris: r.tris });
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
        let mut m = Model { step, objs, verts, n_opaque, origin: built.origin.unwrap_or([0.0; 3]), scale: built.scale, classes, containers, defs, hay: vec![], skipped, bvh, by_id };
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
        for (i, o) in self.objs.iter().enumerate() { if i > 0 { s.push(','); } s.push_str(&format!("[{},{},{},", o.id, o.class, o.cont)); esc(&o.name, &mut s); s.push(']'); }
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
