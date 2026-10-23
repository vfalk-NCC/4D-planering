use std::time::Instant;
fn main() {
    let f = std::env::args().nth(1).expect("sökväg till IFC"); let b = std::fs::read(&f).unwrap();
    let t = Instant::now(); let s = rust3d::step::Step::parse(&b).unwrap(); println!("tokenisera: {:?} ({} entiteter)", t.elapsed(), s.ents.len());
    let t = Instant::now(); let built = rust3d::ifc::build(&s); println!("geometri: {:?} ({} objekt)", t.elapsed(), built.objs.len());
    let t = Instant::now(); let m = rust3d::model::Model::load(&b).unwrap(); println!("hela Model::load: {:?} ({} trianglar)", t.elapsed(), m.verts.len() / 60);
}
