const fflate = require('../docs/vendor/three/fflate.min.js');
/* Liten syntetisk 3D-DWF för testerna: en komponent (fyrhörning via Edgebreaker + kub med vanlig ytlista) på två platser, namnet "Skruv & mutter". */
module.exports = function buildDwf() {
  const u32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }, f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  const str = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);
  const open = n => Buffer.concat([Buffer.from('q(', 'latin1').slice(1), str(n)]);   // '(' + namn
  const seg = (n, body) => Buffer.concat([Buffer.from('q'), Buffer.from('('), str(n), body, Buffer.from(')')]);
  const quadEb = (() => {   // ops L,E (koder 1,2) = fyrhörning med 4 hörn
    const ops = Buffer.from([1, 2, 0, 0]), mt = Buffer.concat([u32(0x80), u32(8), u32(8), u32(8)]);
    const hdr = Buffer.concat([Buffer.from([2, 0, 0, 3]), u32(2), u32(mt.length), u32(0), u32(4), u32(0)]);
    return Buffer.concat([hdr, ops, mt]);
  })();
  const shellEb = Buffer.concat([Buffer.from('S'), Buffer.from([0x5a, 0, 5]), u32(quadEb.length), quadEb, f32([0, 0, 0, 1000, 0, 0, 1000, 500, 0, 0, 500, 0]), Buffer.from([0])]);
  const cubeV = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1].map(v => v * 100);
  const faces = [4,0,3,2,1, 4,4,5,6,7, 4,0,1,5,4, 4,1,2,6,5, 4,2,3,7,6, 4,3,0,4,7];
  const shellCube = Buffer.concat([Buffer.from('S'), Buffer.from([0x1a, 0]), u32(8), f32(cubeV), Buffer.from([1]), u32(1 + faces.length), Buffer.from([8]), Buffer.from(faces), Buffer.from([1, 7, 12]), u32(0), Buffer.from([0])]);
  const color = Buffer.concat([Buffer.from('"'), Buffer.from([0x01, 0x01, 0, 200, 40, 40])]);
  const mat = t => Buffer.concat([Buffer.from('%'), f32([0.001, 0, 0, 0, 0.001, 0, 0, 0, 0.001, t[0], t[1], t[2]])]);
  const inc = n => Buffer.concat([Buffer.from('<'), str(n)]);
  const stream = Buffer.concat([
    seg('?Include Library/1', seg('', Buffer.concat([color, shellEb, shellCube]))),
    seg('main', Buffer.concat([seg('a', Buffer.concat([mat([100, 200, 5]), seg('a1', inc('?Include Library/1'))])), seg('b', Buffer.concat([mat([300, 200, 5]), seg('b1', inc('?Include Library/1'))]))]))
  ]);
  const w3d = Buffer.concat([Buffer.from(';; HSF V10.00 \0'), Buffer.from('Z'), Buffer.from(fflate.zlibSync(new Uint8Array(Buffer.concat([stream, Buffer.from('z')]))))]);
  const defXml = '<SpaceObjectDefinition><Objects><Object id="1"><Properties id="p"><Property name="_name" value="Skruv &amp; mutter" category="hidden"/></Properties></Object></Objects><Instances><Instance id="i1" object="1" nodes="3" children=""/><Instance id="i2" object="1" nodes="6"/></Instances></SpaceObjectDefinition>';
  const zip = Buffer.from(fflate.zipSync({ 'sec/descriptor.xml': new TextEncoder().encode('<eModel:Space><eModel:Units type="ft"/></eModel:Space>'), 'sec/a.w3d': new Uint8Array(w3d), 'sec/b.xml': new TextEncoder().encode(defXml + ' '.repeat(2000)) }, { level: 0 }));
  return Buffer.concat([Buffer.from('(DWF V06.20)'), zip]);
};
