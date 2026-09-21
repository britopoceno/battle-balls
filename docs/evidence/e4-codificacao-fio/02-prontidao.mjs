// Prova das regras de arredondamento que preservam PRONTIDÃO (docs/architecture-e4.md §5.5, 2026-09-21).
// 2e6 casos sintéticos concentrados na fronteira. 'seguro' = restante da habilidade por teto e grampo em 0,
// ultCharge por piso; 'ingênuo' = arredondamento simples a 0,01. Uso: node 02-prontidao.mjs
const K=100, TICK_MS=1000/60
const fl=v=>Math.floor(v*K)/K, ce=v=>Math.ceil(v*K)/K, rd=v=>Math.round(v*K)/K
let s=12345; const rnd=()=>{s=(s*1103515245+12345)%2147483648; return s/2147483648}
let n=0, errSafeA=0, errNaiveA=0, errSafeU=0, errNaiveU=0, errFloorNonMult=0
for(let i=0;i<2e6;i++){
  const tick=Math.floor(rnd()*10800), time=tick*TICK_MS
  const deltas=[0, 1e-9, -1e-9, 0.004, -0.004, 0.005, 0.0049, (rnd()-0.5)*0.02, (rnd()-0.5)*3000]
  const r=time+deltas[i%deltas.length]
  const tq=rd(time) // time quantizado
  const remS=Math.max(0,ce(r-time)); const okS=(tq>=tq+remS)===(time>=r); if(!okS) errSafeA++
  const rN=rd(r); const okN=(rd(time)>=rN)===(time>=r); if(!okN) errNaiveA++
  for(const thr of [110,130]){ const u=Math.min(thr, thr-[0,1e-9,0.004,0.0049,rnd()*0.02,rnd()*50][i%6]);
    if((fl(u)>=thr)!==(u>=thr)) errSafeU++; if((rd(u)>=thr)!==(u>=thr)) errNaiveU++ }
  const thr2=110.005, u2=thr2; if((fl(u2)>=thr2)!==(u2>=thr2)) errFloorNonMult++
  n++
}
console.log({n, errSafeA, errNaiveA, errSafeU, errNaiveU, errFloorNonMult})
