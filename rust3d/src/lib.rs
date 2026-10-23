//! Rust-motorn för 3D-labbet. Gränssnittet mot webbläsaren är ett litet C-API (inga beroenden, ingen glue-kod):
//! JS skriver in data med `alloc`, anropar funktionerna och läser tillbaka via pekare/JSON i `out_ptr()`.
pub mod bvh;
pub mod cloud;
pub mod ifc;
pub mod model;
pub mod step;

use model::{esc, Model};

#[derive(Default)]
struct State { model: Option<Model>, cloud: Option<cloud::Cloud>, origin: Option<[f64; 3]>, out: Vec<u8>, res: [f32; 16], hidden: Vec<u8>, err: String }
static mut ST: Option<State> = None;
#[allow(static_mut_refs)]
fn st() -> &'static mut State { unsafe { ST.get_or_insert_with(State::default) } }

fn put(s: &str) -> u32 { let o = &mut st().out; o.clear(); o.extend_from_slice(s.as_bytes()); o.len() as u32 }
fn bytes<'a>(p: *const u8, n: usize) -> &'a [u8] { unsafe { std::slice::from_raw_parts(p, n) } }
fn text(p: *const u8, n: usize) -> String { String::from_utf8_lossy(bytes(p, n)).to_string() }

#[no_mangle] pub extern "C" fn alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub extern "C" fn dealloc(p: *mut u8, n: usize) { unsafe { drop(Vec::from_raw_parts(p, 0, n.max(1))); } }
#[no_mangle] pub extern "C" fn out_ptr() -> *const u8 { st().out.as_ptr() }
#[no_mangle] pub extern "C" fn res_ptr() -> *const f32 { st().res.as_ptr() }
#[no_mangle] pub extern "C" fn version() -> u32 { 1 }

/// Läser en IFC-fil. 0 = ok. Vid fel ligger texten i out (längd i retur som negativt tal).
#[no_mangle] pub extern "C" fn model_load(p: *const u8, n: usize) -> i32 {
    let s = st(); s.err.clear();
    match Model::load(bytes(p, n)) {
        Ok(m) => { if s.origin.is_none() && !m.objs.is_empty() { s.origin = Some(m.origin); } s.hidden = vec![0; m.objs.len()]; s.model = Some(m); 0 }
        Err(e) => { -(put(&e) as i32) }
    }
}
#[no_mangle] pub extern "C" fn model_summary() -> u32 { match &st().model { Some(m) => put(&m.summary()), None => put("{}") } }
#[no_mangle] pub extern "C" fn model_objects() -> u32 { match &st().model { Some(m) => put(&m.objects_json()), None => put("{}") } }
#[no_mangle] pub extern "C" fn model_object(oi: u32) -> u32 { match &st().model { Some(m) if (oi as usize) < m.objs.len() => put(&m.object_json(oi as usize)), _ => put("{}") } }
#[no_mangle] pub extern "C" fn model_search(p: *const u8, n: usize) -> u32 {
    let q = text(p, n);
    let r = match &st().model { Some(m) => m.search(&q), None => vec![] };
    let mut s = String::from("["); for (i, v) in r.iter().enumerate().take(200000) { if i > 0 { s.push(','); } s.push_str(&v.to_string()); } s.push(']'); put(&s)
}
#[no_mangle] pub extern "C" fn model_verts_ptr() -> *const u8 { st().model.as_ref().map(|m| m.verts.as_ptr()).unwrap_or(std::ptr::null()) }
#[no_mangle] pub extern "C" fn model_verts_count() -> u32 { st().model.as_ref().map(|m| (m.verts.len() / 20) as u32).unwrap_or(0) }
#[no_mangle] pub extern "C" fn model_opaque_count() -> u32 { st().model.as_ref().map(|m| m.n_opaque).unwrap_or(0) }
#[no_mangle] pub extern "C" fn origin(i: u32) -> f64 { st().origin.map(|o| o[(i as usize).min(2)]).unwrap_or(0.0) }
#[no_mangle] pub extern "C" fn model_set_visible(oi: u32, v: u32) { let h = &mut st().hidden; if (oi as usize) < h.len() { h[oi as usize] = if v != 0 { 0 } else { 1 }; } }

/// Träffar modellen längs strålen. Returnerar objektindex eller -1. res: [t, träff xyz, närmaste hörn xyz, närmaste kantpunkt xyz].
#[no_mangle] pub extern "C" fn model_pick(ox: f32, oy: f32, oz: f32, dx: f32, dy: f32, dz: f32) -> i32 {
    let s = st(); let m = match &s.model { Some(m) => m, None => return -1 };
    let hid = &s.hidden;
    let skip = |t: u32| { let o = m.obj_of_tri(t) as usize; o < hid.len() && hid[o] != 0 };
    match m.bvh.ray([ox, oy, oz], [dx, dy, dz], f32::MAX, &skip) {
        None => -1,
        Some(h) => {
            let tr = &m.bvh.tris[h.tri as usize]; let d2 = |a: [f32; 3], b: [f32; 3]| (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2);
            let mut bv = tr[0]; for v in tr { if d2(*v, h.p) < d2(bv, h.p) { bv = *v; } }
            let mut be = tr[0]; let mut bd = f32::MAX;
            for k in 0..3 { let (a, b) = (tr[k], tr[(k + 1) % 3]); let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; let l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
                let t = if l2 > 0.0 { (((h.p[0] - a[0]) * ab[0] + (h.p[1] - a[1]) * ab[1] + (h.p[2] - a[2]) * ab[2]) / l2).clamp(0.0, 1.0) } else { 0.0 };
                let q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]; let dd = d2(q, h.p); if dd < bd { bd = dd; be = q; } }
            s.res = [h.t, h.p[0], h.p[1], h.p[2], bv[0], bv[1], bv[2], be[0], be[1], be[2], 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
            m.obj_of_tri(h.tri) as i32
        }
    }
}

#[no_mangle] pub extern "C" fn model_set_attr(oi: u32, ix: u32, p: *const u8, n: usize) -> i32 {
    let t = text(p, n); match &mut st().model { Some(m) if (oi as usize) < m.objs.len() => if m.set_attr(oi as usize, ix as usize, &t) { 0 } else { 1 }, _ => 1 }
}
#[no_mangle] pub extern "C" fn model_set_prop(prop: u32, p: *const u8, n: usize) -> i32 {
    let t = text(p, n); match &mut st().model { Some(m) => match m.set_prop(prop, &t) { Ok(()) => 0, Err(e) => -(put(&e) as i32) }, None => 1 }
}
#[no_mangle] pub extern "C" fn model_edits() -> u32 { st().model.as_ref().map(|m| m.step.patches.len() as u32).unwrap_or(0) }
#[no_mangle] pub extern "C" fn model_export() -> u32 { match &st().model { Some(m) => { let b = m.step.write(); let o = &mut st().out; o.clear(); o.extend_from_slice(&b); o.len() as u32 } None => 0 } }

/// Läser ett punktmoln (XYZ/CSV, PLY, LAS). `max` = högsta antal punkter som behålls. 0 = ok.
#[no_mangle] pub extern "C" fn cloud_load(p: *const u8, n: usize, np: *const u8, nn: usize, max: u32) -> i32 {
    let s = st(); let name = text(np, nn);
    match cloud::Cloud::parse(bytes(p, n), &name, max.max(1000) as usize, &mut s.origin) { Ok(c) => { s.cloud = Some(c); 0 } Err(e) => -(put(&e) as i32) }
}
#[no_mangle] pub extern "C" fn cloud_count() -> u32 { st().cloud.as_ref().map(|c| c.count() as u32).unwrap_or(0) }
#[no_mangle] pub extern "C" fn cloud_total() -> u32 { st().cloud.as_ref().map(|c| c.total_in as u32).unwrap_or(0) }
#[no_mangle] pub extern "C" fn cloud_pos_ptr() -> *const f32 { st().cloud.as_ref().map(|c| c.pts.as_ptr()).unwrap_or(std::ptr::null()) }
#[no_mangle] pub extern "C" fn cloud_col_ptr() -> *const u8 { st().cloud.as_ref().map(|c| c.cols.as_ptr()).unwrap_or(std::ptr::null()) }
#[no_mangle] pub extern "C" fn cloud_info() -> u32 {
    match &st().cloud { Some(c) => { let (mn, mx) = c.pts.chunks(3).fold(([f32::MAX; 3], [f32::MIN; 3]), |(mut a, mut b), p| { for k in 0..3 { if p[k] < a[k] { a[k] = p[k]; } if p[k] > b[k] { b[k] = p[k]; } } (a, b) });
        put(&format!("{{\"points\":{},\"total\":{},\"rgb\":{},\"bbox\":[{},{},{},{},{},{}]}}", c.count(), c.total_in, c.has_rgb, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2])) } None => put("{}") }
}
#[no_mangle] pub extern "C" fn cloud_recolor(mode: u32, tol: f32) { if let Some(c) = &mut st().cloud { c.recolor(mode, tol); } }
#[no_mangle] pub extern "C" fn cloud_deviation(maxd: f32, tol: f32) -> u32 {
    let s = st();
    match (&mut s.cloud, &s.model) { (Some(c), Some(m)) => { let j = c.compute_deviation(&m.bvh, maxd, tol); put(&j) } _ => { let mut j = String::new(); esc("Läs in både en modell och ett punktmoln först", &mut j); put(&format!("{{\"error\":{}}}", j)) } }
}
#[no_mangle] pub extern "C" fn clear_all() { let s = st(); s.model = None; s.cloud = None; s.origin = None; s.hidden.clear(); }

#[no_mangle] pub extern "C" fn model_edges(oi: u32) -> u32 {
    match &st().model { Some(m) if (oi as usize) < m.objs.len() => { let e = m.feature_edges(oi as usize); let o = &mut st().out; o.clear(); for v in e { o.extend_from_slice(&v.to_le_bytes()); } o.len() as u32 } _ => 0 }
}
#[no_mangle] pub extern "C" fn model_quantities() -> u32 { match &st().model { Some(m) => put(&m.quantities_json()), None => put("[]") } }
/// Kollision mellan två grupper (u32-listor i minnet). Samma pekare = mot sig själv.
#[no_mangle] pub extern "C" fn model_clash(pa: *const u8, na: usize, pb: *const u8, nb: usize, min_depth: f32) -> u32 {
    let rd = |p: *const u8, n: usize| -> Vec<u32> { bytes(p, n * 4).chunks(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect() };
    let (a, b) = (rd(pa, na), rd(pb, nb));
    match &st().model { Some(m) => put(&m.clash(&a, &b, min_depth)), None => put("[]") }
}
