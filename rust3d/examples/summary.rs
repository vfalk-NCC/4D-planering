fn main() {
    let f = std::env::args().nth(1).expect("sökväg till IFC"); let b = std::fs::read(&f).unwrap();
    let t = std::time::Instant::now(); let m = rust3d::model::Model::load(&b).unwrap();
    println!("{}", m.summary()); println!("tid {:?}", t.elapsed());
    let mut cnt = std::collections::HashMap::new(); for o in &m.objs { *cnt.entry(m.classes[o.class as usize].clone()).or_insert(0) += 1; } println!("{:?}", cnt);
    // entiteter med representation men utan geometri
    let mut missing = std::collections::HashMap::new();
    for e in m.step.ents.iter() { let tn = &m.step.types[e.ty as usize]; if !tn.starts_with("IFC") { continue; } let k = m.step.by_id[e.id as usize] as usize - 1; if let Some(p) = m.step.arg_ref(k, 6) { if m.step.type_of(p) == "IFCPRODUCTDEFINITIONSHAPE" && !m.by_id.contains_key(&e.id) { *missing.entry(tn.clone()).or_insert(0) += 1; } } }
    println!("utan geometri: {:?}", missing);
}
