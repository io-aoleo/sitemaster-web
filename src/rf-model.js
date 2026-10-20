/* Weak-reflection FDR demonstration model. It is not an instrument emulator. */
const RF = (() => {
  const C = 299792458;
  const rhoToSWR = r => (1 + r) / (1 - r);
  const swrToRho = s => (s - 1) / (s + 1);
  const swrToRL = s => s === 1 ? Infinity : -20 * Math.log10(swrToRho(s));
  const rlToSWR = db => rhoToSWR(10 ** (-db / 20));
  function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x,1664525)+1013904223)>>>0; return x / 4294967296; }; }
  function mixSeed(seed, salt) {
    let x = (seed ^ Math.imul((salt|0) + 1, 0x9E3779B1)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return (x % 2147483646) + 1;
  }
  function limits(p) {
    const resolution = C * p.vf / (2 * (p.f2 - p.f1) * 1e6);
    return { resolution, dmax: (p.points - 1) * resolution };
  }
  function validate(p) {
    for (const k of ['f1','f2','vf','loss','points','scan','minLength','maxLength','limit','seed']) if (!Number.isFinite(p[k])) throw Error('请填写有效的数字参数');
    if (p.f1 < 1 || p.f2 > 6000 || p.f2 - p.f1 < 1) throw Error('频率范围须在 1–6000 MHz 内，起止频率至少相差 1 MHz');
    if (p.vf < .1 || p.vf > 1 || p.loss < 0 || p.loss > 1) throw Error('传播速度系数须为 0.1–1，损耗须为 0–1 dB/m');
    if (![501,1001,2001].includes(p.points)) throw Error('采样点数须为 501、1001 或 2001');
    if (p.scan < 1 || p.scan > 1000 || p.minLength < 1 || p.maxLength < p.minLength || p.maxLength > p.scan*.95) throw Error('主反射位置须为 1 m 以上，位置上限不得超过扫描距离的 95%');
    if (p.limit < 1.01 || p.limit > 10) throw Error('驻波比限值须为 1.01–10');
    if (!Number.isInteger(p.seed) || p.seed < 1 || p.seed > 2147483647) throw Error('批次种子须为 1–2147483647 的整数');
    if (!['hann','rect','blackman'].includes(p.window)) throw Error('请选择有效窗函数');
    if (p.rippleStrength !== undefined && (!Number.isFinite(p.rippleStrength) || p.rippleStrength < 0 || p.rippleStrength > 100)) throw Error('辅助反射强度须为 0–100');
    if (p.rippleCount !== undefined && (!Number.isInteger(p.rippleCount) || p.rippleCount < 8 || p.rippleCount > 120)) throw Error('辅助反射数量须为 8–120 的整数');
    const d = limits(p);
    if (p.scan >= d.dmax) throw Error('扫描距离超过不模糊距离 '+d.dmax.toFixed(1)+' m，请增加采样点数或缩小频宽');
    if (2*p.scan*p.loss*Math.sqrt(p.f2/1000)>60) throw Error('当前距离与损耗组合的往返损耗超过 60 dB，请缩短距离或按线缆实际值调整损耗');
    return d;
  }
  function makeReflectors(p, seed) {
    const rand=rng(seed), span=p.maxLength-p.minLength;
    const length=p.minLength+span*(.08+.84*rand());
    const events=[];
    if(rand()<.82) events.push({d:.15+rand()*2.2,a:rand()<.22?.018+rand()*.05:.003+rand()*.012,phase:rand()*Math.PI*2});
    const mids=rand()<.18?0:rand()<.62?1:rand()<.9?2:3;
    for(let i=0;i<mids;i++) events.push({d:Math.max(1.2,length*(.06+.86*rand())),a:.006+rand()**1.7*.06,phase:rand()*Math.PI*2});
    events.push({d:length,a:.035+rand()**.65*.18,phase:rand()*Math.PI*2});
    const count=p.rippleCount ?? 48, strength=(p.rippleStrength ?? 65)/65;
    const n=Math.max(8,Math.min(120,Math.round(count*(.35+rand()*.95))));
    let cursor=p.scan*.012*rand();
    for(let i=0;i<n;i++){
      cursor+=(p.scan*.9/n)*(.2+rand()*1.85);
      if(cursor>p.scan*.97) break;
      events.push({d:cursor,a:(.0003+rand()**2.4*.018)*strength*(.35+rand()),phase:rand()*Math.PI*2});
    }
    return {length,events,rand};
  }
  function forward(p, events) {
    const re=new Float64Array(p.points),im=new Float64Array(p.points);
    for(let i=0;i<p.points;i++) {
      const f=(p.f1+(p.f2-p.f1)*i/(p.points-1))*1e6;
      for(const e of events) {
        const a=e.a*10**(-2*p.loss*Math.sqrt(f/1e9)*e.d/20);
        const phase=e.phase-4*Math.PI*f*e.d/(C*p.vf);
        re[i]+=a*Math.cos(phase); im[i]+=a*Math.sin(phase);
      }
    }
    return {re,im};
  }
  function ifft(re, im) {
    const n=re.length;
    for(let i=1,j=0;i<n;i++) {let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len*=2){const a=2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2,vr=re[l]*ur-im[l]*ui,vi=re[l]*ui+im[l]*ur;re[l]=re[k]-vr;im[l]=im[k]-vi;re[k]+=vr;im[k]+=vi;const nr=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=nr;}}}
    // Deliberately unnormalized. Caller divides by the sum of window weights.
  }
  function distance(p, spectrum) {
    let n=1;while(n<p.points*4)n*=2;
    const re=new Float64Array(n),im=new Float64Array(n);let sum=0;
    for(let i=0;i<p.points;i++) {const t=2*Math.PI*i/(p.points-1),w=p.window==='rect'?1:p.window==='hann'?.5-.5*Math.cos(t):.42-.5*Math.cos(t)+.08*Math.cos(2*t);sum+=w;re[i]=spectrum.re[i]*w;im[i]=spectrum.im[i]*w;}
    ifft(re,im);
    const df=(p.f2-p.f1)*1e6/(p.points-1),step=C*p.vf/(2*df*n),out=[],alpha=p.loss*Math.sqrt((p.f1+p.f2)/2000);
    for(let i=0;i<n&&i*step<=p.scan;i++) {const x=i*step,rho=Math.hypot(re[i],im[i])/sum*(p.compensate?10**(2*alpha*x/20):1);out.push({x,rho});}
    return out;
  }
  // One site visit shares instrument and cable setup; only the feed curve varies.
  function sessionParams(p, seed=p.seed) {
    const rand=rng(mixSeed(seed,917));
    const models=['S331E','S332E','S331L','S331P'];
    const q={...p};
    if(!q.instrument)q.instrument=models[Math.floor(rand()*models.length)];
    if(!q.serial)q.serial=String(62000000+(mixSeed(seed,4402)%8000000));
    q.calibration='ON';
    q.cw='OFF';
    return q;
  }
  function simulate(p, name, seed=p.seed) {
    validate(p);
    const model=makeReflectors(p,seed),spectrum=forward(p,model.events);
    for(let i=0;i<p.points;i++){const n=.0006*(.25+model.rand()),ph=model.rand()*Math.PI*2;spectrum.re[i]+=n*Math.cos(ph);spectrum.im[i]+=n*Math.sin(ph);}
    const rawDTF=distance(p,spectrum);
    const peak=Math.max(...Array.from(spectrum.re,(_,i)=>Math.hypot(spectrum.re[i],spectrum.im[i])),...rawDTF.map(q=>q.rho),1e-9);
    const fraction=.1+.82*model.rand();
    const target=swrToRho(1+(p.limit-1)*fraction),scale=target/peak;
    const freq=Array.from(spectrum.re,(_,i)=>({x:p.f1+(p.f2-p.f1)*i/(p.points-1),swr:rhoToSWR(Math.hypot(spectrum.re[i],spectrum.im[i])*scale)}));
    const dtf=rawDTF.map(q=>({x:q.x,swr:rhoToSWR(q.rho*scale)}));
    return {p:{...p,name,seed,cableLength:model.length,primaryReflectionDistance:model.length},source:'simulation',traces:{freq,dtf},events:model.events.map(e=>({...e,a:e.a*scale}))};
  }
  function stats(points,limit) {
    if(!points?.length)throw Error('当前模式没有采样数据');
    let worst=points[0],exceed=0;for(const q of points){if(q.swr>worst.swr)worst=q;if(q.swr>limit)exceed++;}
    return {worst,exceed,total:points.length,ratio:exceed/points.length,rl:swrToRL(worst.swr)};
  }
  function parseCSV(text) {
    const rows=[];let row=[],cell='',inside=false;
    text=text.replace(/^\ufeff/,'');
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(inside&&text[i+1]==='"'){cell+='"';i++;}else inside=!inside;}else if(c===','&&!inside){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!inside){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
    if(inside)throw Error('CSV 双引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
  }
  function importCSV(text, opt) {
    const rows=parseCSV(text);if(rows.length<3)throw Error('CSV 至少需要表头及两个采样点');
    if(rows.length>200001)throw Error('每次最多导入 200000 个采样点');
    const clean=s=>s.toLowerCase().replace(/[\s_()（）/\-]/g,''),head=rows.shift().map(clean);
    const ni=head.findIndex(v=>['站点','站点名','名称','trace','name','tracename'].includes(v));
    const xi=head.findIndex(v=> (opt.mode==='freq'?['频率mhz','频率','frequencymhz','freqmhz']:['距离m','距离','distancem','distance']).includes(v));
    const types={swr:['驻波比','vswr','swr'],rl:['回波损耗db','回波损耗','returnlossdb','rldb'],s11:['s11db']};
    const yi=head.findIndex(v=>types[opt.quantity]?.includes(v));
    if(xi<0||yi<0)throw Error('表头不匹配，请按选择的模式与数值类型下载对应模板；频率单位必须为 MHz、距离必须为 m');
    const groups=new Map();
    rows.forEach((row,i)=>{const name=ni<0?opt.name:row[ni];if(!name?.trim()||name.length>100)throw Error('第 '+(i+2)+' 行站点名为空或超过 100 字');if(row[xi]===''||row[yi]===''||row[xi]===undefined||row[yi]===undefined)throw Error('第 '+(i+2)+' 行采样值缺失');const x=Number(row[xi]),value=Number(row[yi]);if(!Number.isFinite(x)||!Number.isFinite(value)||x<0)throw Error('第 '+(i+2)+' 行含无效数字');if(opt.quantity==='swr'&&value<1||opt.quantity==='rl'&&value<=0||opt.quantity==='s11'&&value>=0)throw Error('第 '+(i+2)+' 行数值不在无源反射数据的有效范围');const swr=opt.quantity==='swr'?value:rlToSWR(opt.quantity==='s11'?-value:value);if(!Number.isFinite(swr)||swr<1)throw Error('第 '+(i+2)+' 行数值超出可表示范围');if(!groups.has(name))groups.set(name,[]);groups.get(name).push({x,swr,original:value});});
    if(groups.size>100)throw Error('每次最多导入 100 条曲线');
    return [...groups].map(([name,data])=>{data.sort((a,b)=>a.x-b.x);if(data.length<2)throw Error(name+' 至少需要两个采样点');if(data.some((p,i)=>i&&p.x===data[i-1].x))throw Error(name+' 存在重复横坐标，请检查文件');return{source:'import',p:{name,limit:opt.limit,date:opt.date,file:opt.file||'CSV',instrument:opt.instrument||'',serial:opt.serial||'',calibration:opt.calibration||'',measurementDate:opt.measurementDate||''},traces:{[opt.mode]:data},importQuantity:opt.quantity};});
  }
  return {C,rng,mixSeed,limits,validate,makeReflectors,forward,distance,sessionParams,simulate,stats,parseCSV,importCSV,rhoToSWR,swrToRho,swrToRL,rlToSWR};
})();
