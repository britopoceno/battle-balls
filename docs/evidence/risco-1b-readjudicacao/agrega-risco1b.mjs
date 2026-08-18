// Agregação entre bases para a re-adjudicação do Risco #1b (protocolo do gate e2.7,
// recomendação formal: n>=3000, >=3 bases de seed, média ENTRE BASES por personagem).
// Precisão cheia: delta = winrate(pacote) - winrate(controle), dos campos crus do --json
// (QA-E27-003: deltaPp impresso tem granularidade de arredondamento; winrate não).
import { readFileSync } from 'node:fs'

const bases = [1, 1001, 2001, 3001]
const dir = process.argv[2]
const porBase = []

for (const b of bases) {
  const raw = readFileSync(`${dir}/risco1b-n3000-base${b}.out`, 'utf8')
  const inicio = raw.indexOf('\n{')
  const json = JSON.parse(raw.slice(inicio + 1, raw.lastIndexOf('}') + 1))
  const r = json.risco1b
  const chars = {}
  for (const p of r.personagens) {
    const fis = p.deltas.find(d => d.pacote === 'fisico')
    const dan = p.deltas.find(d => d.pacote === 'dano')
    chars[p.charId] = {
      controleWinrate: p.controle.winrate,
      controleNDec: p.controle.nDec,
      fisicoWinrate: fis.winrate, fisicoNDec: fis.nDec,
      danoWinrate: dan.winrate, danoNDec: dan.nDec,
      fisicoDeltaPp: (fis.winrate - p.controle.winrate) * 100,
      danoDeltaPp: (dan.winrate - p.controle.winrate) * 100,
      deltaPpImpresso: { fisico: fis.deltaPp, dano: dan.deltaPp },
      gatilhoImpresso: p.gatilho,
      icPp: fis.icPp,
      truncado: fis.truncado || dan.truncado || p.controle.truncado,
    }
  }
  porBase.push({ base: b, limiares: r.limiaresDoGatilho, chars })
}

const limiares = porBase[0].limiares
const media = {}
for (const c of ['golem', 'vex']) {
  const fis = porBase.map(x => x.chars[c].fisicoDeltaPp)
  const dan = porBase.map(x => x.chars[c].danoDeltaPp)
  const m = a => a.reduce((s, v) => s + v, 0) / a.length
  const sd = a => { const mu = m(a); return Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1)) }
  const mf = m(fis), md = m(dan)
  media[c] = {
    fisicoMediaPp: mf, fisicoSdPp: sd(fis), fisicoAmplitudePp: Math.max(...fis) - Math.min(...fis),
    danoMediaPp: md, danoSdPp: sd(dan),
    gatilhoNaMedia: mf < limiares.fisicoMenorQuePp && md > limiares.danoMaiorQuePp,
    gatilhoPorBase: porBase.map(x => ({ base: x.base, gatilho: x.chars[c].gatilhoImpresso })),
  }
}

const out = { protocolo: 'n=3000 decididas/célula, 4 bases (1,1001,2001,3001), média entre bases por personagem — gate e2.7 recomendação formal', limiares, porBase, media }
console.log(JSON.stringify(out, null, 2))
