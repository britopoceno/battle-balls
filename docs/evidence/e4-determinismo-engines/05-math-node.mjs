const L = []
const dx = -0.45639696701269405
const dy = -0.889776268789865
L.push(`atan2(${dy},${dx}) = ${Math.atan2(dy, dx)}`)
L.push(`atan2(${dx},${dy}) = ${Math.atan2(dx, dy)}`)
L.push(`hypot(${dx},${dy}) = ${Math.hypot(dx, dy)}`)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function fnv(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
for (const [nome, f] of [
  ['atan2', (a, b) => Math.atan2(a, b)],
  ['hypot', (a, b) => Math.hypot(a, b)],
  ['pow', (a, b) => Math.pow(Math.abs(a), b)],
  ['sqrt', (a) => Math.sqrt(Math.abs(a))],
  ['sin', (a) => Math.sin(a)],
  ['cos', (a) => Math.cos(a)],
]) {
  const r = mulberry32(12345)
  const partes = []
  for (let i = 0; i < 20000; i++) {
    const a = (r() - 0.5) * 2000
    const b = (r() - 0.5) * 2000
    partes.push(String(f(a, b)))
  }
  L.push(`VARREDURA ${nome} (n=20000) = ${fnv(partes.join('|'))}`)
}
L.push(`V8 ${process.versions.v8}`)
console.log(L.join('\n'))
