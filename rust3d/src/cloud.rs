//! Punktmoln: läser XYZ/CSV, PLY (ascii/binär) och LAS (okomprimerad), glesar ut, färgar och mäter avvikelse mot modellen.
use crate::bvh::Bvh;

pub struct Cloud { pub pts: Vec<f32>, pub rgb: Vec<u8>, pub has_rgb: bool, pub cols: Vec<u8>, pub total_in: usize, pub zmin: f32, pub zmax: f32, pub dev: Vec<f32> }

fn rd_f(b: &[u8], o: usize, t: &str) -> f64 {
    match t {
        "float" | "float32" => f32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) as f64,
        "double" | "float64" => f64::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5], b[o + 6], b[o + 7]]),
        "uchar" | "uint8" => b[o] as f64, "char" | "int8" => b[o] as i8 as f64,
        "short" | "int16" => i16::from_le_bytes([b[o], b[o + 1]]) as f64, "ushort" | "uint16" => u16::from_le_bytes([b[o], b[o + 1]]) as f64,
        "int" | "int32" => i32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) as f64, "uint" | "uint32" => u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) as f64,
        _ => 0.0,
    }
}
fn sz(t: &str) -> usize { match t { "double" | "float64" => 8, "float" | "float32" | "int" | "int32" | "uint" | "uint32" => 4, "short" | "int16" | "ushort" | "uint16" => 2, _ => 1 } }

impl Cloud {
    pub fn parse(bytes: &[u8], name: &str, max: usize, origin: &mut Option<[f64; 3]>) -> Result<Cloud, String> {
        let lower = name.to_lowercase();
        let mut raw: Vec<[f64; 3]> = Vec::new(); let mut rgb: Vec<u8> = Vec::new(); let mut has_rgb = false; let total;
        let stride_of = |n: usize| -> usize { (n + max - 1) / max.max(1) };
        if lower.ends_with(".las") || bytes.starts_with(b"LASF") {
            if bytes.len() < 227 { return Err("För kort LAS-fil".into()); }
            if bytes[104] & 0x80 != 0 || (bytes[104] > 10) { return Err("Komprimerad LAZ stöds inte i Rust-labbet än – konvertera till LAS.".into()); }
            let off = u32::from_le_bytes(bytes[96..100].try_into().unwrap()) as usize; let fmt = bytes[104] & 0x3f; let rl = u16::from_le_bytes([bytes[105], bytes[106]]) as usize;
            let ver_minor = bytes[25]; let n = if ver_minor >= 4 && bytes.len() >= 375 { u64::from_le_bytes(bytes[247..255].try_into().unwrap()) as usize } else { u32::from_le_bytes(bytes[107..111].try_into().unwrap()) as usize };
            let f8 = |o: usize| f64::from_le_bytes(bytes[o..o + 8].try_into().unwrap());
            let (sx, sy, sz_, ox, oy, oz) = (f8(131), f8(139), f8(147), f8(155), f8(163), f8(171));
            let rgb_off = match fmt { 2 => Some(20), 3 => Some(28), 5 => Some(28), 7 | 8 => Some(30), 10 => Some(30), _ => None };
            total = n; let st = stride_of(n);
            let mut i = 0usize;
            while i < n { let o = off + i * rl; if o + 12 > bytes.len() { break; }
                let x = i32::from_le_bytes(bytes[o..o + 4].try_into().unwrap()) as f64 * sx + ox; let y = i32::from_le_bytes(bytes[o + 4..o + 8].try_into().unwrap()) as f64 * sy + oy; let z = i32::from_le_bytes(bytes[o + 8..o + 12].try_into().unwrap()) as f64 * sz_ + oz;
                raw.push([x, y, z]);
                if let Some(r) = rgb_off { if o + r + 6 <= bytes.len() { has_rgb = true; let g = |k: usize| (u16::from_le_bytes([bytes[o + r + k * 2], bytes[o + r + k * 2 + 1]]) >> 8) as u8; rgb.extend_from_slice(&[g(0), g(1), g(2), 255]); } }
                i += st; }
        } else if lower.ends_with(".ply") || bytes.starts_with(b"ply") {
            let he = bytes.windows(10).position(|w| w == b"end_header").ok_or("Ogiltig PLY-fil")?; let hdr = String::from_utf8_lossy(&bytes[..he]).to_string();
            let mut data = he + 10; while data < bytes.len() && (bytes[data] == b'\r' || bytes[data] == b'\n') { data += 1; if bytes[data - 1] == b'\n' { break; } }
            let mut binary = false; let mut n = 0usize; let mut props: Vec<(String, String)> = Vec::new(); let mut in_vertex = false;
            for l in hdr.lines() { let t: Vec<&str> = l.split_whitespace().collect();
                match t.as_slice() { ["format", f, ..] => binary = *f == "binary_little_endian", ["element", "vertex", c] => { n = c.parse().unwrap_or(0); in_vertex = true; } ["element", ..] => in_vertex = false, ["property", ty, nm] if in_vertex => props.push((ty.to_string(), nm.to_string())), _ => {} } }
            let ix = |nm: &str| props.iter().position(|p| p.1 == nm);
            let (ix_x, ix_y, ix_z) = (ix("x").ok_or("PLY saknar x")?, ix("y").ok_or("PLY saknar y")?, ix("z").ok_or("PLY saknar z")?);
            let (ir, ig, ib) = (ix("red"), ix("green"), ix("blue"));
            total = n; let st = stride_of(n);
            if binary {
                let mut offs = Vec::new(); let mut o = 0; for p in &props { offs.push(o); o += sz(&p.0); } let rec = o;
                let mut i = 0; while i < n { let b0 = data + i * rec; if b0 + rec > bytes.len() { break; }
                    raw.push([rd_f(bytes, b0 + offs[ix_x], &props[ix_x].0), rd_f(bytes, b0 + offs[ix_y], &props[ix_y].0), rd_f(bytes, b0 + offs[ix_z], &props[ix_z].0)]);
                    if let (Some(r), Some(g), Some(b)) = (ir, ig, ib) { has_rgb = true; rgb.extend_from_slice(&[rd_f(bytes, b0 + offs[r], &props[r].0) as u8, rd_f(bytes, b0 + offs[g], &props[g].0) as u8, rd_f(bytes, b0 + offs[b], &props[b].0) as u8, 255]); }
                    i += st; }
            } else {
                let txt = String::from_utf8_lossy(&bytes[data..]); let mut i = 0usize;
                for (k, l) in txt.lines().take(n).enumerate() { if k != i { continue; } let t: Vec<&str> = l.split_whitespace().collect(); if t.len() <= ix_x.max(ix_y).max(ix_z) { i += st; continue; }
                    let f = |j: usize| t[j].parse::<f64>().unwrap_or(0.0); raw.push([f(ix_x), f(ix_y), f(ix_z)]);
                    if let (Some(r), Some(g), Some(b)) = (ir, ig, ib) { if t.len() > r.max(g).max(b) { has_rgb = true; rgb.extend_from_slice(&[f(r) as u8, f(g) as u8, f(b) as u8, 255]); } }
                    i += st; }
            }
        } else {
            let txt = String::from_utf8_lossy(bytes); let n = txt.lines().count(); total = n; let st = stride_of(n);
            for (k, l) in txt.lines().enumerate() { if k % st != 0 { continue; }
                let t: Vec<f64> = l.split(|c: char| c.is_whitespace() || c == ',' || c == ';').filter(|s| !s.is_empty()).filter_map(|s| s.parse::<f64>().ok()).collect();
                if t.len() < 3 { continue; }
                raw.push([t[0], t[1], t[2]]);
                if t.len() == 6 && t[3..6].iter().all(|v| *v >= 0.0 && *v <= 255.0) { has_rgb = true; rgb.extend_from_slice(&[t[3] as u8, t[4] as u8, t[5] as u8, 255]); } else if has_rgb { rgb.extend_from_slice(&[180, 180, 180, 255]); }
            }
        }
        if raw.is_empty() { return Err("Hittade inga punkter i filen".into()); }
        if has_rgb && rgb.len() != raw.len() * 4 { has_rgb = false; }
        let o = *origin.get_or_insert([(raw[0][0] / 100.0).round() * 100.0, (raw[0][1] / 100.0).round() * 100.0, (raw[0][2] / 100.0).round() * 100.0]);
        let mut pts = Vec::with_capacity(raw.len() * 3); let (mut zmin, mut zmax) = (f32::MAX, f32::MIN);
        for p in &raw { let (x, y, z) = ((p[0] - o[0]) as f32, (p[1] - o[1]) as f32, (p[2] - o[2]) as f32); pts.extend_from_slice(&[x, y, z]); if z < zmin { zmin = z; } if z > zmax { zmax = z; } }
        let mut c = Cloud { pts, rgb, has_rgb, cols: vec![], total_in: total, zmin, zmax, dev: vec![] };
        c.recolor(0, 0.0); Ok(c)
    }
    pub fn count(&self) -> usize { self.pts.len() / 3 }

    /// 0 = färg ur filen (annars grå), 1 = höjd, 2 = avvikelse (kräver `compute_deviation`).
    pub fn recolor(&mut self, mode: u32, tol: f32) {
        let n = self.count(); let mut c = Vec::with_capacity(n * 4);
        for i in 0..n {
            let col: [u8; 4] = match mode {
                1 => ramp((self.pts[i * 3 + 2] - self.zmin) / (self.zmax - self.zmin).max(1e-6)),
                2 if !self.dev.is_empty() => dev_col(self.dev[i], tol),
                _ => if self.has_rgb { [self.rgb[i * 4], self.rgb[i * 4 + 1], self.rgb[i * 4 + 2], 255] } else { [170, 176, 188, 255] },
            };
            c.extend_from_slice(&col);
        }
        self.cols = c;
    }

    pub fn compute_deviation(&mut self, bvh: &Bvh, maxd: f32, tol: f32) -> String {
        let n = self.count(); self.dev = Vec::with_capacity(n);
        let mut ds: Vec<f32> = Vec::new(); let mut sum = 0.0f64; let mut sq = 0.0f64; let mut within = 0usize;
        for i in 0..n { let p = [self.pts[i * 3], self.pts[i * 3 + 1], self.pts[i * 3 + 2]];
            match bvh.closest(p, maxd) { Some((d, _)) => { self.dev.push(d); ds.push(d); sum += d as f64; sq += (d as f64) * (d as f64); if d <= tol { within += 1; } } None => self.dev.push(-1.0) } }
        self.recolor(2, tol);
        let m = ds.len(); ds.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p95 = if m > 0 { ds[((m as f64 * 0.95) as usize).min(m - 1)] } else { 0.0 };
        format!("{{\"points\":{},\"evaluated\":{},\"beyond\":{},\"withinTolPct\":{:.2},\"mean\":{:.5},\"rms\":{:.5},\"p95\":{:.5},\"max\":{:.5},\"tol\":{},\"maxd\":{}}}", n, m, n - m, if m > 0 { within as f64 * 100.0 / m as f64 } else { 0.0 }, if m > 0 { sum / m as f64 } else { 0.0 }, if m > 0 { (sq / m as f64).sqrt() } else { 0.0 }, p95, ds.last().copied().unwrap_or(0.0), tol, maxd)
    }
}

fn ramp(t: f32) -> [u8; 4] { // blå → cyan → grön → gul → röd
    let t = t.clamp(0.0, 1.0) * 4.0; let (i, f) = (t.floor() as usize, t.fract());
    let s = [[59.0, 76.0, 192.0], [58.0, 190.0, 220.0], [80.0, 200.0, 110.0], [250.0, 210.0, 60.0], [220.0, 60.0, 50.0]];
    let (a, b) = (s[i.min(4)], s[(i + 1).min(4)]); [(a[0] + (b[0] - a[0]) * f) as u8, (a[1] + (b[1] - a[1]) * f) as u8, (a[2] + (b[2] - a[2]) * f) as u8, 255]
}
fn dev_col(d: f32, tol: f32) -> [u8; 4] {
    if d < 0.0 { return [100, 116, 139, 255]; }
    let t = (d / tol.max(1e-6)).min(4.0);
    if t <= 1.0 { let f = t; [(60.0 + 190.0 * f) as u8, (200.0 + 10.0 * f) as u8, (120.0 - 60.0 * f) as u8, 255] } else if t <= 2.0 { let f = t - 1.0; [250, (210.0 - 80.0 * f) as u8, 60, 255] } else { let f = (t - 2.0) / 2.0; [(250.0 - 30.0 * f) as u8, (130.0 - 90.0 * f) as u8, (60.0 - 10.0 * f) as u8, 255] }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn xyz_text_glesas_ut_och_far_origo() {
        let mut t = String::new(); for i in 0..1000 { t.push_str(&format!("{} {} {}\n", 6512300.0 + i as f64 * 0.01, 150100.0, 12.0 + (i % 10) as f64 * 0.1)); }
        let mut o = None; let c = Cloud::parse(t.as_bytes(), "a.xyz", 100, &mut o).unwrap();
        assert!(c.count() <= 100 && c.count() >= 90); assert!(o.is_some()); assert!(c.pts[0].abs() < 200.0);
    }
    #[test]
    fn avvikelse_mot_plan() {
        let b = Bvh::build(vec![[[-50.0, -50.0, 0.0], [50.0, -50.0, 0.0], [50.0, 50.0, 0.0]], [[-50.0, -50.0, 0.0], [50.0, 50.0, 0.0], [-50.0, 50.0, 0.0]]]);
        let mut o = Some([0.0; 3]); let mut c = Cloud::parse(b"1 1 0.01\n2 2 0.03\n3 3 0.2\n", "a.xyz", 100, &mut o).unwrap();
        let j = c.compute_deviation(&b, 1.0, 0.05); assert!(j.contains("\"evaluated\":3") && j.contains("\"withinTolPct\":66.67"), "{}", j);
    }
}
