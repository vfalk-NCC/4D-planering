//! STEP/IFC-läsare: delar upp DATA-sektionen i entiteter (utan att tolka argumenten) och tolkar argument vid behov.
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum V {
    Null,
    Ref(u32),
    Num(f64),
    Str(String),
    Enum(String),
    List(Vec<V>),
    Typed(String, Vec<V>),
}

impl V {
    pub fn num(&self) -> Option<f64> {
        match self { V::Num(n) => Some(*n), V::Typed(_, a) if a.len() == 1 => a[0].num(), _ => None }
    }
    pub fn rf(&self) -> Option<u32> { if let V::Ref(r) = self { Some(*r) } else { None } }
    pub fn list(&self) -> &[V] { if let V::List(l) = self { l } else { &[] } }
    pub fn str(&self) -> Option<&str> { match self { V::Str(s) => Some(s), V::Typed(_, a) if a.len() == 1 => a[0].str(), _ => None } }
    pub fn refs(&self) -> Vec<u32> { self.list().iter().filter_map(|v| v.rf()).collect() }
}

pub struct Ent { pub id: u32, pub ty: u32, pub s: u32, pub e: u32, pub complex: bool, pub src: u8 }

pub struct Step {
    pub data: Vec<u8>,
    pub headers: Vec<Vec<u8>>, // en rubrik per källfil
    pub bases: Vec<u32>,       // id-förskjutning per källfil (så att flera IFC-filer kan ligga i samma modell)
    pub ents: Vec<Ent>,
    pub types: Vec<String>,
    pub by_id: Vec<u32>, // id -> ents-index + 1
    pub patches: HashMap<u32, String>,
    type_ix: HashMap<String, u32>,
}

fn skip_ws(d: &[u8], mut i: usize) -> usize {
    loop {
        while i < d.len() && (d[i] as char).is_ascii_whitespace() { i += 1; }
        if i + 1 < d.len() && d[i] == b'/' && d[i + 1] == b'*' { i += 2; while i + 1 < d.len() && !(d[i] == b'*' && d[i + 1] == b'/') { i += 1; } i += 2; } else { return i; }
    }
}

/// Index (exklusivt) för den ")" som stänger "(" på position `i`; tar hänsyn till textsträngar.
fn match_paren(d: &[u8], mut i: usize) -> Option<usize> {
    let mut depth = 0i32;
    while i < d.len() {
        match d[i] {
            b'\'' => { i += 1; while i < d.len() { if d[i] == b'\'' { if i + 1 < d.len() && d[i + 1] == b'\'' { i += 2; continue; } break; } i += 1; } }
            b'(' => depth += 1,
            b')' => { depth -= 1; if depth == 0 { return Some(i); } }
            _ => {}
        }
        i += 1;
    }
    None
}

impl Step {
    pub fn empty() -> Step { Step { data: Vec::new(), headers: Vec::new(), bases: Vec::new(), ents: Vec::new(), types: vec![String::new()], by_id: vec![0], patches: HashMap::new(), type_ix: HashMap::from([(String::new(), 0)]) } }
    pub fn parse(bytes: &[u8]) -> Result<Step, String> { let mut s = Step::empty(); s.add_source(bytes)?; Ok(s) }
    /// Lägger till en IFC-fil: entiteterna får id + förskjutning, argumenten tolkas med samma förskjutning.
    pub fn add_source(&mut self, bytes: &[u8]) -> Result<usize, String> {
        let start = find(bytes, b"DATA;").ok_or("Hittar ingen DATA-sektion – är det en IFC-fil (STEP)?")?;
        let header = bytes[..start + 5].to_vec(); let d = &bytes[start + 5..];
        let src = self.headers.len(); if src > 200 { return Err("För många modeller".into()); }
        let base = (self.by_id.len() as u32).saturating_sub(1); let dbase = self.data.len() as u32;
        let mut ents = Vec::new(); let mut max_id = 0u32; let mut i = 0usize;
        loop {
            i = skip_ws(d, i);
            if i >= d.len() { break; }
            if d[i] != b'#' {
                if d[i..].starts_with(b"ENDSEC") { break; }
                while i < d.len() && d[i] != b';' { i += 1; }
                i += 1; continue;
            }
            i += 1;
            let mut id = 0u32;
            while i < d.len() && d[i].is_ascii_digit() { id = id.wrapping_mul(10).wrapping_add((d[i] - b'0') as u32); i += 1; }
            i = skip_ws(d, i);
            if i >= d.len() || d[i] != b'=' { return Err(format!("Oväntat tecken efter #{}", id)); }
            i = skip_ws(d, i + 1);
            let ts = i;
            while i < d.len() && d[i] != b'(' && !(d[i] as char).is_ascii_whitespace() { i += 1; }
            let tname = std::str::from_utf8(&d[ts..i]).unwrap_or("").to_ascii_uppercase();
            i = skip_ws(d, i);
            if i >= d.len() || d[i] != b'(' { return Err(format!("Saknar argument för #{}", id)); }
            let close = match_paren(d, i).ok_or_else(|| format!("Oavslutad entitet #{}", id))?;
            let complex = tname.is_empty();
            let tix = match self.type_ix.get(&tname) { Some(t) => *t, None => { let t = self.types.len() as u32; self.types.push(tname.clone()); self.type_ix.insert(tname, t); t } };
            ents.push(Ent { id: id + base, ty: tix, s: dbase + (i + 1) as u32, e: dbase + close as u32, complex, src: src as u8 });
            if id > max_id { max_id = id; }
            i = close + 1;
            while i < d.len() && d[i] != b';' { i += 1; }
            i += 1;
        }
        self.data.extend_from_slice(d); self.headers.push(header); self.bases.push(base);
        let new_len = (base + max_id + 1) as usize; if self.by_id.len() < new_len { self.by_id.resize(new_len, 0); }
        for e in ents { let k = self.ents.len() as u32; self.by_id[e.id as usize] = k + 1; self.ents.push(e); }
        Ok(src)
    }

    pub fn idx(&self, id: u32) -> Option<usize> {
        let k = *self.by_id.get(id as usize)?; if k == 0 { None } else { Some(k as usize - 1) }
    }
    pub fn type_of(&self, id: u32) -> &str { match self.idx(id) { Some(k) => &self.types[self.ents[k].ty as usize], None => "" } }
    pub fn type_id(&self, name: &str) -> Option<u32> { self.type_ix.get(name).copied() }
    pub fn args_text(&self, k: usize) -> &str {
        let e = &self.ents[k];
        if let Some(p) = self.patches.get(&e.id) { return p; }
        std::str::from_utf8(&self.data[e.s as usize..e.e as usize]).unwrap_or("")
    }
    /// Snabbtitt: referensen i argument nr `ix` (utan att tolka resten) – används för att sålla bland många entiteter.
    pub fn arg_ref(&self, k: usize, ix: usize) -> Option<u32> {
        let t = self.args_text(k).as_bytes(); let (mut depth, mut i, mut n) = (0i32, 0usize, 0usize);
        while i < t.len() {
            if n == ix { while i < t.len() && t[i] == b' ' { i += 1; } if i < t.len() && t[i] == b'#' { let mut v = 0u32; i += 1; while i < t.len() && t[i].is_ascii_digit() { v = v.wrapping_mul(10).wrapping_add((t[i] - b'0') as u32); i += 1; } return Some(v + self.bases[self.ents[k].src as usize]); } return None; }
            match t[i] {
                b'\'' => { i += 1; while i < t.len() { if t[i] == b'\'' { if i + 1 < t.len() && t[i + 1] == b'\'' { i += 2; continue; } break; } i += 1; } }
                b'(' => depth += 1, b')' => depth -= 1,
                b',' if depth == 0 => n += 1,
                _ => {}
            }
            i += 1;
        }
        None
    }
    pub fn args(&self, id: u32) -> Vec<V> { match self.idx(id) { Some(k) => parse_args_base(self.args_text(k).as_bytes(), self.bases[self.ents[k].src as usize]), None => vec![] } }

    /// Byte-intervall för varje argument på översta nivån (för att byta ett enskilt argument i texten).
    pub fn arg_spans(&self, id: u32) -> Vec<(usize, usize)> {
        let k = match self.idx(id) { Some(k) => k, None => return vec![] };
        let t = self.args_text(k).as_bytes();
        let mut spans = Vec::new(); let (mut depth, mut i, mut st) = (0i32, 0usize, 0usize);
        while i < t.len() {
            match t[i] {
                b'\'' => { i += 1; while i < t.len() { if t[i] == b'\'' { if i + 1 < t.len() && t[i + 1] == b'\'' { i += 2; continue; } break; } i += 1; } }
                b'(' => depth += 1,
                b')' => depth -= 1,
                b',' if depth == 0 => { spans.push((st, i)); st = i + 1; }
                _ => {}
            }
            i += 1;
        }
        spans.push((st, t.len()));
        spans
    }

    pub fn set_arg(&mut self, id: u32, ix: usize, text: &str) -> bool {
        let sp = self.arg_spans(id);
        if ix >= sp.len() { return false; }
        let k = self.idx(id).unwrap();
        let cur = self.args_text(k).to_string();
        let (a, b) = sp[ix];
        let new = format!("{}{}{}", &cur[..a], text, &cur[b..]);
        self.patches.insert(id, new);
        true
    }

    pub fn write(&self) -> Vec<u8> { self.write_source(0) }
    /// Skriver en av källfilerna med sin ursprungliga numrering (patchar inräknade).
    pub fn write_source(&self, src: usize) -> Vec<u8> {
        let mut o = Vec::with_capacity(self.data.len() + 64); let base = self.bases.get(src).copied().unwrap_or(0);
        o.extend_from_slice(self.headers.get(src).map(|h| h.as_slice()).unwrap_or(b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;")); o.push(b'\n');
        for (k, e) in self.ents.iter().enumerate() { if e.src as usize != src { continue; }
            let a = self.args_text(k); let id = e.id - base;
            let line = if e.complex { format!("#{}=({});\n", id, a) } else { format!("#{}={}({});\n", id, self.types[e.ty as usize], a) };
            o.extend_from_slice(line.as_bytes()); }
        o.extend_from_slice(b"ENDSEC;\nEND-ISO-10303-21;\n"); o
    }
    /// Vilka källfiler har ändringar?
    pub fn edited_sources(&self) -> Vec<usize> { let mut v: Vec<usize> = self.patches.keys().filter_map(|id| self.idx(*id)).map(|k| self.ents[k].src as usize).collect(); v.sort(); v.dedup(); v }
}

fn find(h: &[u8], n: &[u8]) -> Option<usize> { h.windows(n.len()).position(|w| w == n) }

pub fn parse_args(t: &[u8]) -> Vec<V> { parse_args_base(t, 0) }
pub fn parse_args_base(t: &[u8], base: u32) -> Vec<V> {
    let mut i = 0usize; let mut out = Vec::new();
    loop {
        while i < t.len() && (t[i] as char).is_ascii_whitespace() { i += 1; }
        if i >= t.len() { break; }
        out.push(value(t, &mut i, base));
        while i < t.len() && (t[i] as char).is_ascii_whitespace() { i += 1; }
        if i < t.len() && t[i] == b',' { i += 1; } else { break; }
    }
    out
}

fn value(t: &[u8], i: &mut usize, base: u32) -> V {
    while *i < t.len() && (t[*i] as char).is_ascii_whitespace() { *i += 1; }
    if *i >= t.len() { return V::Null; }
    match t[*i] {
        b'$' | b'*' => { *i += 1; V::Null }
        b'#' => { *i += 1; let mut n = 0u32; while *i < t.len() && t[*i].is_ascii_digit() { n = n.wrapping_mul(10).wrapping_add((t[*i] - b'0') as u32); *i += 1; } V::Ref(n + base) }
        b'\'' => {
            *i += 1; let mut s = Vec::new();
            while *i < t.len() { if t[*i] == b'\'' { if *i + 1 < t.len() && t[*i + 1] == b'\'' { s.push(b'\''); *i += 2; continue; } *i += 1; break; } s.push(t[*i]); *i += 1; }
            V::Str(decode_str(&s))
        }
        b'.' => { *i += 1; let st = *i; while *i < t.len() && t[*i] != b'.' { *i += 1; } let s = String::from_utf8_lossy(&t[st..*i]).to_string(); *i += 1; V::Enum(s) }
        b'(' => {
            *i += 1; let mut l = Vec::new();
            loop {
                while *i < t.len() && (t[*i] as char).is_ascii_whitespace() { *i += 1; }
                if *i >= t.len() { break; }
                if t[*i] == b')' { *i += 1; break; }
                l.push(value(t, i, base));
                while *i < t.len() && (t[*i] as char).is_ascii_whitespace() { *i += 1; }
                if *i < t.len() && t[*i] == b',' { *i += 1; }
            }
            V::List(l)
        }
        c if c == b'-' || c == b'+' || c.is_ascii_digit() => {
            let st = *i; *i += 1;
            while *i < t.len() && (t[*i].is_ascii_digit() || matches!(t[*i], b'.' | b'e' | b'E' | b'-' | b'+')) { *i += 1; }
            let mut s = String::from_utf8_lossy(&t[st..*i]).to_string();
            if s.contains(".E") || s.contains(".e") { s = s.replace(".E", ".0E").replace(".e", ".0e"); }
            V::Num(s.parse::<f64>().unwrap_or(0.0))
        }
        _ => {
            let st = *i; while *i < t.len() && (t[*i].is_ascii_alphanumeric() || t[*i] == b'_') { *i += 1; }
            let name = String::from_utf8_lossy(&t[st..*i]).to_ascii_uppercase();
            if *i == st { *i += 1; return V::Null; }
            while *i < t.len() && (t[*i] as char).is_ascii_whitespace() { *i += 1; }
            if *i < t.len() && t[*i] == b'(' {
                if let V::List(l) = value(t, i, base) { return V::Typed(name, l); }
            }
            V::Enum(name)
        }
    }
}

/// STEP-strängar: \X2\00E5\X0\ (UTF-16), \X\E5 (latin-1), \S\ (latin-1 förskjutning) → vanlig text.
pub fn decode_str(s: &[u8]) -> String {
    if !s.contains(&b'\\') { return String::from_utf8_lossy(s).to_string(); }
    let mut o = String::new(); let mut i = 0;
    while i < s.len() {
        if s[i] == b'\\' && i + 3 < s.len() + 0 && s[i..].starts_with(b"\\X2\\") {
            let st = i + 4; let mut e = st; while e + 3 <= s.len() && !s[e..].starts_with(b"\\X0\\") { e += 1; }
            let hex = &s[st..e.min(s.len())];
            let mut units: Vec<u16> = Vec::new();
            for ch in hex.chunks(4) { if ch.len() == 4 { if let Ok(v) = u16::from_str_radix(std::str::from_utf8(ch).unwrap_or("0"), 16) { units.push(v); } } }
            o.push_str(&String::from_utf16_lossy(&units)); i = (e + 4).min(s.len()); continue;
        }
        if s[i] == b'\\' && s[i..].starts_with(b"\\X\\") && i + 5 <= s.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&s[i + 3..i + 5]).unwrap_or("0"), 16) { o.push(v as char); i += 5; continue; }
        }
        if s[i] == b'\\' && s[i..].starts_with(b"\\S\\") && i + 4 <= s.len() { o.push((s[i + 3] + 128) as char); i += 4; continue; }
        // råa UTF-8-byte
        let ch_len = utf8_len(s[i]); let end = (i + ch_len).min(s.len());
        o.push_str(&String::from_utf8_lossy(&s[i..end])); i = end;
    }
    o
}
fn utf8_len(b: u8) -> usize { if b < 0x80 { 1 } else if b >> 5 == 0b110 { 2 } else if b >> 4 == 0b1110 { 3 } else if b >> 3 == 0b11110 { 4 } else { 1 } }

/// Text → STEP-sträng med citattecken (icke-ASCII som \X2\…\X0\).
pub fn encode_str(s: &str) -> String {
    let mut o = String::from("'");
    let mut buf: Vec<u16> = Vec::new();
    let flush = |buf: &mut Vec<u16>, o: &mut String| { if !buf.is_empty() { o.push_str("\\X2\\"); for u in buf.iter() { o.push_str(&format!("{:04X}", u)); } o.push_str("\\X0\\"); buf.clear(); } };
    for c in s.chars() {
        if c.is_ascii() && c != '\\' { flush(&mut buf, &mut o); if c == '\'' { o.push_str("''"); } else if c >= ' ' { o.push(c); } }
        else { let mut b = [0u16; 2]; for u in c.encode_utf16(&mut b) { buf.push(*u); } }
    }
    flush(&mut buf, &mut o); o.push('\''); o
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parsar_entiteter_och_argument() {
        let f = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((1.,2.5E1,-3));\n#2=IFCWALL('a''b',$,'\\X2\\00E5\\X0\\r',#1,(#1,#1),.T.,IFCLABEL('x'));\nENDSEC;\nEND-ISO-10303-21;";
        let s = Step::parse(f).unwrap();
        assert_eq!(s.ents.len(), 2);
        let a = s.args(1); assert_eq!(a[0].list()[1].num(), Some(25.0));
        let b = s.args(2); assert_eq!(b[0], V::Str("a'b".into())); assert_eq!(b[2], V::Str("år".into())); assert_eq!(b[4].refs(), vec![1, 1]);
        assert_eq!(b[6], V::Typed("IFCLABEL".into(), vec![V::Str("x".into())]));
        assert_eq!(s.type_of(2), "IFCWALL");
    }
    #[test]
    fn byter_ett_argument_och_skriver_ut() {
        let f = b"DATA;\n#5=IFCWALL('g',$,'Namn',$);\nENDSEC;";
        let mut s = Step::parse(f).unwrap();
        assert!(s.set_arg(5, 2, &encode_str("Vägg å 'x'")));
        assert_eq!(s.args(5)[2], V::Str("Vägg å 'x'".into()));
        let out = String::from_utf8(s.write()).unwrap(); assert!(out.contains("#5=IFCWALL('g',$,'V\\X2\\00E4\\X0\\gg \\X2\\00E5\\X0\\ ''x''',$);"));
        let s2 = Step::parse(out.as_bytes()).unwrap(); assert_eq!(s2.args(5)[2], V::Str("Vägg å 'x'".into()));
    }
}
