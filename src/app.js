'use strict';
const $=id=>document.getElementById(id);
const fieldIds=['f1','f2','points','scan','minLength','maxLength','vf','loss','rippleStrength','rippleCount','seed'];
const windowNames={hann:'Hann',rect:'Rectangular',blackman:'Blackman'};
let current=null,batches=[],viewMode='dtf',viewMetric='swr',batchSignature='',wordURL=null,exporting=false,fileName='',toastTimer,lockedMeter=null;
function localDate(){const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function seedNow(){return crypto.getRandomValues(new Uint32Array(1))[0]%2147483646+1;}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4300);}
function safe(s){return s.replace(/[\\/:*?"<>|]/g,'_');}
function quote(v){return '"'+String(v).replaceAll('"','""')+'"';}
function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);}
function clearWord(){if(wordURL)URL.revokeObjectURL(wordURL);wordURL=null;$('wordResult').replaceChildren();}
function tab(id){document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('hidden',e.id!==id));document.querySelectorAll('.tab').forEach(e=>e.classList.toggle('active',e.dataset.tab===id));}
document.querySelectorAll('.tab').forEach(e=>e.onclick=()=>tab(e.dataset.tab));
function settings(){const p={};fieldIds.forEach(id=>{if($(id).value.trim()==='')throw Error('请填写所有频段和线缆参数');p[id]=Number($(id).value);});p.instrument=$('simulationModel').value.trim();p.serial=$('simulationSerial').value.trim();p.window=$('window').value;p.compensate=$('compensate').checked;p.limit=Number($('quickLimit').value);p.date=$('date').value;if(!p.date||isNaN(new Date(p.date).getTime()))throw Error('请填写有效图内时间');RF.validate(p);return p;}
function batchSpec(){const name=$('station').value.trim(),start=Number($('startNo').value),end=Number($('endNo').value);if(!name)throw Error('请填写站点名');if(!$('startNo').value||!$('endNo').value||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>999999||end-start+1>100)throw Error('请填写有效整数序号，每批 1–100 条，结束序号不能小于开始序号');return{name,start,end,p:settings()};}
function syncSettings(){try{const p=settings(),d=RF.limits(p);$('resolution').textContent='名义距离分辨率（矩形窗） '+d.resolution.toFixed(3)+' m · 不模糊距离 '+d.dmax.toFixed(1)+' m'+(p.window!=='rect'?' · 当前加窗后的主瓣会更宽':'');$('settingSummary').textContent=p.f1+'–'+p.f2+' MHz · Vf '+p.vf+' · '+windowNames[p.window];}catch(e){$('resolution').textContent=e.message;}}
function invalidate(){clearWord();syncSettings();if(batches[0]?.source==='simulation')$('quickSummary').textContent='设置已改变；导出整批仿真前会按当前设置重新计算。';}
function activePoints(r=current){return r?.traces[viewMode]||[];}
function curveStats(r=current){return RF.stats(activePoints(r),r.p.limit);}
// Compact layout follows the supplied original application's chart, rather
// than Anritsu's current Report Tool. Metadata must describe the actual source.
function coordinateLabel(x,detailed=false){return x.toFixed(2)+' '+(viewMode==='freq'?'MHz':'m');}
function amplitudeLabel(swr){const v=viewMetric==='rl'?RF.swrToRL(swr):swr;return viewMetric==='rl'&&v>60?'>60.00 dB':v.toFixed(2)+(viewMetric==='rl'?' dB':'');}
function draw(r,hover){
  const c=$('chart'),ctx=c.getContext('2d'),W=c.width,H=c.height,L=145,R=135,T=137,Y=472;
  const points=activePoints(r);if(!points.length)return;
  const stats=RF.stats(points,r.p.limit),isRL=viewMetric==='rl',sim=r.source==='simulation';
  // Five vertical divisions, as in the supplied original. Round outward so
  // imported measurements remain visible even when they exceed the threshold.
  const step=isRL?12:Math.max(.1,Math.ceil((stats.worst.swr-1)/5*100)/100),hi=isRL?60:1+5*step,lo=isRL?0:1;
  const xMin=viewMode==='dtf'?0:points[0].x,xMax=viewMode==='dtf'&&sim?r.p.scan:points.at(-1).x;
  const x=v=>L+(v-xMin)/(xMax-xMin)*(W-L-R);
  const y=q=>{const v=isRL?RF.swrToRL(q.swr):q.swr,u=(Math.max(lo,Math.min(v,hi))-lo)/(hi-lo);return isRL?T+u*(Y-T):Y-u*(Y-T);};
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#000';ctx.textAlign='center';
  fitText(ctx,r.p.name,W/2,68,W-120,30);
  ctx.textAlign='left';fitText(ctx,'M1:'+amplitudeLabel(stats.worst.swr)+' @ '+stats.worst.x.toFixed(2)+(viewMode==='dtf'?' Meter':' MHz'),L+36,123,W-L-R-36,23);
  ctx.font='23px Arial,sans-serif';ctx.strokeStyle='#000';ctx.lineWidth=1;
  for(let i=0;i<=5;i++){
    const yy=T+(Y-T)*i/5,v=isRL?lo+(hi-lo)*i/5:hi-(hi-lo)*i/5;
    ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(W-R,yy);ctx.stroke();
    ctx.textAlign='right';ctx.fillText(v.toFixed(isRL?0:2),L-17,yy+8);
  }
  for(let i=0;i<=8;i++){
    const xx=L+(W-L-R)*i/8;ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,Y);ctx.stroke();
    ctx.textAlign='center';ctx.fillText((xMin+(xMax-xMin)*i/8).toFixed(2),xx,Y+39);
  }
  // Short instrument-style minor ticks along the left and bottom axes.
  ctx.lineWidth=.9;ctx.beginPath();
  for(let i=0;i<=25;i++){const yy=T+(Y-T)*i/25;ctx.moveTo(L,yy);ctx.lineTo(L+(i%5?10:16),yy);}
  for(let i=0;i<=80;i++){const xx=L+(W-L-R)*i/80;ctx.moveTo(xx,Y);ctx.lineTo(xx,Y-(i%10?10:16));}ctx.stroke();
  ctx.textAlign='center';ctx.font='24px Arial,sans-serif';
  (isRL?['R','L']:['V','S','W','R']).forEach((letter,i)=>ctx.fillText(letter,72,Y-100+i*28));
  const axis=viewMode==='dtf'?'Distance('+xMin.toFixed(2)+'–'+xMax.toFixed(2)+' Meter)':'Frequency('+xMin.toFixed(2)+'–'+xMax.toFixed(2)+' MHz)';
  ctx.fillText(axis,(L+W-R)/2,Y+69);
  ctx.save();ctx.beginPath();ctx.rect(L,T,W-L-R,Y-T);ctx.clip();ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(x(q.x),y(q)):ctx.moveTo(x(q.x),y(q)));ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  const mx=x(stats.worst.x);ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(mx,T);ctx.lineTo(mx,Y);ctx.stroke();
  ctx.font='20px Arial,sans-serif';ctx.textAlign='left';ctx.fillText('M1',Math.min(W-R-30,mx+4),Y+21);
  const date=sim?r.p.date:r.p.measurementDate, parsed=date?new Date(date):null,valid=parsed&&!isNaN(parsed.getTime());
  const dateText=valid?(parsed.getMonth()+1)+'/'+parsed.getDate()+'/'+parsed.getFullYear():'--';
  const timeText=valid?[parsed.getHours(),parsed.getMinutes(),parsed.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':'):'--';
  const columns=[
    ['Resolution:'+(sim?r.p.points:points.length),'Date:'+dateText,'Model:'+(r.p.instrument||'--')],
    ['CAL:'+(r.p.calibration||(sim?'ON':'--')),'Time:'+timeText,'Serial#:'+(r.p.serial||'--')],
    ['CW:'+(r.p.cw||(sim?'OFF':'--')),'Ins.Loss:'+(sim?r.p.loss.toFixed(3)+' dB/m':'--'),'Prop.Vel:'+(sim?r.p.vf.toFixed(3):'--')]
  ];
  const lefts=[55,590,1040],widths=[500,420,310];ctx.textAlign='left';
  columns.forEach((col,i)=>col.forEach((text,j)=>fitText(ctx,text,lefts[i],574+j*30,widths[i],24)));
  if(hover){ctx.strokeStyle='#777';ctx.lineWidth=.7;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(x(hover.x),T);ctx.lineTo(x(hover.x),Y);ctx.stroke();ctx.setLineDash([]);}
}

function fitText(ctx,text,x,y,width,size){ctx.font=size+'px Arial,"Microsoft YaHei",sans-serif';while(size>12&&ctx.measureText(text).width>width)ctx.font=(--size)+'px Arial,"Microsoft YaHei",sans-serif';if(ctx.measureText(text).width>width){while(text.length&&ctx.measureText(text+'…').width>width)text=text.slice(0,-1);text+='…';}ctx.fillText(text,x,y);}
function show(r){current=r;if(!r.traces[viewMode])viewMode=r.traces.freq?'freq':'dtf';const s=curveStats(r),imp=r.source==='import';draw(r);
  $('chartname').textContent=r.p.name;$('sourceText').textContent=imp?'CSV 导入 · 采样值未经改写 · 来源信息未核验':'一阶反射模型仿真 · 频率域与 DTF 来自同一复数响应';
  $('status').textContent=(imp?'导入曲线':'仿真曲线')+(s.exceed?'有超限点':'未超配置限值');$('status').classList.toggle('fail',s.exceed>0);
  $('peak').textContent=s.worst.swr.toFixed(2);$('position').textContent=s.worst.x.toFixed(2)+' '+(viewMode==='freq'?'MHz':'m');$('metricPositionLabel').textContent=viewMode==='freq'?'最差点频率':'最差点距离';$('rl').textContent=Number.isFinite(s.rl)?s.rl.toFixed(2)+' dB':'∞';$('ratio').textContent=s.exceed+' / '+s.total;
  $('modeFreq').disabled=!r.traces.freq;$('modeDTF').disabled=!r.traces.dtf;$('modeFreq').classList.toggle('selected',viewMode==='freq');$('modeDTF').classList.toggle('selected',viewMode==='dtf');$('metricSWR').classList.toggle('selected',viewMetric==='swr');$('metricRL').classList.toggle('selected',viewMetric==='rl');
  $('viewHint').textContent=imp?'仅提供文件中实际存在的模式':viewMode==='dtf'?'位置与分辨率由传播速度和扫频范围决定':'各位置的反射在频域相干叠加';$('cursor').textContent='移动指针查看采样值';
}
function listBatch(){const out=$('batchList');out.replaceChildren();$('batchCount').textContent=batches.length;$('batchSource').textContent=batches[0]?.source==='import'?'CSV 导入':'反射模型仿真';
  if(!batches.length){const p=document.createElement('p');p.className='hint';p.style.padding='20px';p.textContent='尚未生成或导入批次。';out.append(p);return;}
  batches.forEach(r=>{const mode=r.traces[viewMode]?viewMode:Object.keys(r.traces)[0],s=RF.stats(r.traces[mode],r.p.limit),row=document.createElement('div');row.className='batchrow';const text=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small'),actions=document.createElement('div'),badge=document.createElement('span'),button=document.createElement('button');title.textContent=r.p.name;sub.textContent=(mode==='freq'?'频率域':'距离域')+' · 最大 VSWR '+s.worst.swr.toFixed(2)+' · '+s.total+' 点';badge.className='badge'+(s.exceed?' fail':'');badge.textContent=s.exceed?'有超限点':'未超限';button.textContent='预览';button.onclick=()=>{show(r);tab('single');};text.append(title,sub);actions.append(badge,button);row.append(text,actions);out.append(row);});
}
function shiftLocal(dateStr,seconds){const d=new Date(dateStr);if(isNaN(d.getTime()))return dateStr;const t=new Date(d.getTime()+seconds*1000),p=n=>String(n).padStart(2,'0');return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate())+'T'+p(t.getHours())+':'+p(t.getMinutes())+':'+p(t.getSeconds());}
function applySession(p){
  // Site name does not select the meter. Keep one instrument for the browser
  // session unless the user edits Model/Serial or clicks Reset.
  const typedModel=$('simulationModel').value.trim(),typedSerial=$('simulationSerial').value.trim();
  if(typedModel&&typedSerial)lockedMeter={instrument:typedModel,serial:typedSerial};
  else if(!lockedMeter){const filled=RF.sessionParams({...p,instrument:'',serial:''},p.seed);lockedMeter={instrument:filled.instrument,serial:filled.serial};}
  if(!typedModel)$('simulationModel').value=lockedMeter.instrument;
  if(!typedSerial)$('simulationSerial').value=lockedMeter.serial;
  lockedMeter={instrument:$('simulationModel').value.trim(),serial:$('simulationSerial').value.trim()};
  return {...p,instrument:lockedMeter.instrument,serial:lockedMeter.serial,calibration:'ON',cw:'OFF'};
}
function generateBatch(randomize=true){try{if(randomize)$('seed').value=seedNow();const spec=batchSpec(),session=applySession(spec.p),records=[];let elapsed=90+(RF.mixSeed(session.seed,5)%150);for(let i=spec.start;i<=spec.end;i++){const rec=RF.simulate(session,spec.name+' '+i,RF.mixSeed(session.seed,i));rec.p.date=shiftLocal(spec.p.date,elapsed);elapsed+=120+(RF.mixSeed(session.seed,i+7919)%240);records.push(rec);}batches=records;batchSignature=JSON.stringify(spec);clearWord();show(records[0]);listBatch();tab('single');$('quickSummary').textContent='已生成 '+records.length+' 条：'+records[0].p.name+' 至 '+records.at(-1).p.name+'。换站点名不改变仪表与线缆参数；仅曲线与时间按条变化。';syncSettings();return true;}catch(e){notify(e.message);$('quickSummary').textContent=e.message;return false;}}
$('quickGenerate').onclick=()=>generateBatch(true);$('recompute').onclick=()=>generateBatch(false);$('quickPreview').onclick=()=>{if(!batches.length&&!generateBatch())return;tab('batch');};$('gotoImport').onclick=()=>tab('importPanel');
function setView(mode,metric){if(mode&&!current.traces[mode])return;viewMode=mode||viewMode;viewMetric=metric||viewMetric;clearWord();show(current);listBatch();}
$('modeFreq').onclick=()=>setView('freq');$('modeDTF').onclick=()=>setView('dtf');$('metricSWR').onclick=()=>setView(null,'swr');$('metricRL').onclick=()=>setView(null,'rl');
$('chart').onpointermove=e=>{const pts=activePoints();if(!pts.length)return;const rect=e.currentTarget.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*1400,x0=viewMode==='dtf'?0:pts[0].x,x1=viewMode==='dtf'&&current.source==='simulation'?current.p.scan:pts.at(-1).x,v=x0+Math.max(0,Math.min(1,(px-145)/(1400-145-135)))*(x1-x0),q=pts.reduce((a,b)=>Math.abs(a.x-v)<Math.abs(b.x-v)?a:b);draw(current,q);$('cursor').textContent=coordinateLabel(q.x,true)+' / '+(viewMetric==='swr'?'VSWR ':'RL ')+amplitudeLabel(q.swr);};$('chart').onpointerleave=()=>{draw(current);$('cursor').textContent='移动指针查看采样值';};
fieldIds.concat(['window','date','compensate','station','startNo','endNo']).forEach(id=>$(id).addEventListener('input',invalidate));
['simulationModel','simulationSerial'].forEach(id=>$(id).addEventListener('input',()=>{clearWord();const instrument=$('simulationModel').value.trim(),serial=$('simulationSerial').value.trim();if(instrument&&serial)lockedMeter={instrument,serial};[current,...batches].filter(r=>r?.source==='simulation').forEach(r=>{if(instrument)r.p.instrument=instrument;if(serial)r.p.serial=serial;});if(current?.source==='simulation')draw(current);}));
$('quickLimit').addEventListener('input',()=>{clearWord();syncSettings();const limit=Number($('quickLimit').value);if(batches[0]?.source==='import'&&Number.isFinite(limit)&&limit>=1.01&&limit<=10){batches.forEach(r=>r.p.limit=limit);show(current);listBatch();$('quickSummary').textContent='已按新限值 '+limit+' 重判导入数据；采样值未改变。';}else if(batches[0]?.source==='simulation')$('quickSummary').textContent='限值已改变；重新生成后生效。';});
$('band').onchange=()=>{const b={900:[880,960,1001],1800:[1710,1880,1001],2600:[2500,2690,1001],wide:[800,2700,2001]}[$('band').value];if(b){$('f1').value=b[0];$('f2').value=b[1];$('points').value=b[2];invalidate();}};
['f1','f2'].forEach(id=>$(id).addEventListener('input',()=>$('band').value='custom'));
$('save').onclick=()=>{try{const spec=batchSpec();download('驻波制图设置-v3.json',JSON.stringify({version:3,...spec},null,2),'application/json');}catch(e){notify(e.message);}};
$('load').onclick=()=>$('configfile').click();$('configfile').onchange=async e=>{try{if(!e.target.files[0])return;const cfg=JSON.parse(await e.target.files[0].text());if(cfg.version!==3||!cfg.p||typeof cfg.name!=='string'||!cfg.name.trim()||cfg.name.length>80||!Number.isInteger(cfg.start)||!Number.isInteger(cfg.end)||cfg.start<0||cfg.end>999999||cfg.end<cfg.start||cfg.end-cfg.start>=100||typeof cfg.p.compensate!=='boolean'||!cfg.p.date||isNaN(new Date(cfg.p.date).getTime()))throw Error('设置格式无效或版本不兼容');cfg.p.rippleStrength??=65;cfg.p.rippleCount??=48;if((cfg.p.instrument!==undefined&&(typeof cfg.p.instrument!=='string'||cfg.p.instrument.length>60))||(cfg.p.serial!==undefined&&(typeof cfg.p.serial!=='string'||cfg.p.serial.length>60)))throw Error('仪表信息格式无效');RF.validate(cfg.p);$('simulationModel').value=cfg.p.instrument||'';$('simulationSerial').value=cfg.p.serial||'';$('station').value=cfg.name;$('startNo').value=cfg.start;$('endNo').value=cfg.end;fieldIds.forEach(id=>$(id).value=cfg.p[id]);$('quickLimit').value=cfg.p.limit;$('window').value=cfg.p.window;$('compensate').checked=cfg.p.compensate;$('date').value=cfg.p.date;$('band').value='custom';invalidate();notify('设置已载入，点击“按当前种子重新计算”复现仿真');}catch(err){notify('载入失败：'+err.message);}e.target.value='';};
$('chooseCSV').onclick=()=>$('csvfile').click();$('csvfile').onchange=async e=>{const f=e.target.files[0];try{if(!f)return;if(f.size>20*1024*1024)throw Error('CSV 文件不能超过 20 MB');let text=await f.text();if(text.includes('\ufffd'))throw Error('文件编码不是 UTF-8，请另存为 CSV UTF-8 后导入');$('importData').value=text;fileName=f.name;$('filename').textContent=fileName;$('importError').textContent='';}catch(err){$('importError').textContent=err.message;}e.target.value='';};
$('importData').addEventListener('input',()=>{fileName='';$('filename').textContent='';});
$('template').onclick=()=>{const freq=$('importMode').value==='freq',qty=$('importQuantity').value,x=freq?'频率(MHz)':'距离(m)',y={swr:'驻波比',rl:'回波损耗(dB)',s11:'S11(dB)'}[qty],vals={swr:[1.2,1.32,1.6],rl:[20,18,12],s11:[-20,-18,-12]}[qty],xs=freq?[1710,1711,1712]:[0,1,2];const rows=[['站点',x,y],...xs.map((v,i)=>['模板示例1',v,vals[i]])];download('采样模板-'+(freq?'频率':'距离')+'-'+qty+'.csv','\ufeff'+rows.map(a=>a.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
$('runImport').onclick=()=>{try{const limit=Number($('quickLimit').value);if(!Number.isFinite(limit)||limit<1.01||limit>10)throw Error('请先填写有效 VSWR 限值');const records=RF.importCSV($('importData').value,{mode:$('importMode').value,quantity:$('importQuantity').value,name:$('station').value.trim(),limit,date:$('date').value||localDate(),file:fileName||'CSV 粘贴',instrument:$('instrument').value.trim(),serial:$('importSerial').value.trim(),calibration:$('calibration').value.trim(),measurementDate:$('measurementDate').value});batches=records;batchSignature='';clearWord();viewMode=$('importMode').value;show(records[0]);listBatch();tab('single');$('importError').textContent='';$('quickSummary').textContent='已导入 '+records.length+' 条曲线，共 '+records.reduce((s,r)=>s+r.traces[viewMode].length,0)+' 个原始采样点。导出当前批次保留这些数据，不会随机重生成。';notify('导入成功，超限点按原值保留');}catch(e){$('importError').textContent=e.message;notify(e.message);}};
$('csv').onclick=()=>{const r=current,mode=viewMode,pts=activePoints(r),xname=mode==='freq'?'频率(MHz)':'距离(m)',cols=['数据来源','站点',xname,'驻波比','回波损耗(dB)'];if(r.source==='import')cols.push('原始数值','原始类型');const rows=[cols,...pts.map(q=>{const rl=RF.swrToRL(q.swr),row=[r.source==='simulation'?'仿真数据':'CSV导入',r.p.name,q.x,q.swr,Number.isFinite(rl)?rl:'Infinity'];if(r.source==='import')row.push(q.original,r.importQuantity);return row;})];download(safe(r.p.name)+'-'+mode+'.csv','\ufeff'+rows.map(a=>a.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
$('png').onclick=()=>{draw(current);const a=document.createElement('a');a.href=$('chart').toDataURL('image/png');a.download=safe(current.p.name)+'-'+viewMode+'-'+viewMetric+'.png';a.click();};
async function exportWord(records,name){if(exporting)return;if(!records.length)return notify('请先生成或导入曲线');if(records[0].source==='import'&&(!Number.isFinite(Number($('quickLimit').value))||Number($('quickLimit').value)<1.01||Number($('quickLimit').value)>10))return notify('请填写有效的 VSWR 限值');if(records.some(r=>!r.traces[viewMode]))return notify('当前批次有曲线缺少该模式数据，请切换模式');exporting=true;document.querySelector('main').classList.add('busy');document.querySelector('main').inert=true;
  try{const blob=await buildDocx(records.slice(),(i,n)=>$('quickSummary').textContent='正在嵌入曲线 '+i+' / '+n);clearWord();wordURL=URL.createObjectURL(blob);const a=document.createElement('a');a.href=wordURL;a.download=safe(name)+'.docx';a.className='exportlink';a.textContent='Word 已生成 · '+records.length+' 张图 · 点击重新下载';$('wordResult').append(a);a.click();$('quickSummary').textContent='已导出 '+records.length+' 张'+(viewMode==='freq'?'频率域':'DTF')+'曲线，每页为站点名和内嵌图片。';notify('Word 已生成');}
  catch(e){notify('Word 导出失败：'+e.message);}finally{exporting=false;document.querySelector('main').inert=false;document.querySelector('main').classList.remove('busy');draw(current);}
}
function exportBatch(){if(batches[0]?.source!=='import'){try{if(batchSignature!==JSON.stringify(batchSpec())&&!generateBatch(false))return;}catch(e){return notify(e.message);}}const name=batches[0]?.source==='import'?'导入曲线批次':$('station').value+' '+$('startNo').value+'-'+$('endNo').value;exportWord(batches,name+' '+viewMode+'-'+viewMetric);}
$('quickWord').onclick=exportBatch;$('batchWord').onclick=exportBatch;$('singleWord').onclick=()=>exportWord([current],current.p.name+' '+viewMode+'-'+viewMetric);
async function printRecords(records){if(!records.length)return notify('请先生成或导入曲线');const report=$('report');report.replaceChildren();for(const r of records){if(!r.traces[viewMode])return notify('当前模式没有完整批次数据');draw(r);const section=document.createElement('section'),h=document.createElement('h2'),img=document.createElement('img');h.textContent=r.p.name;img.src=$('chart').toDataURL();section.append(h,img);report.append(section);}draw(current);await Promise.all([...report.querySelectorAll('img')].map(i=>i.decode()));window.print();}
$('print').onclick=()=>printRecords([current]);$('printbatch').onclick=()=>printRecords(batches);
$('reset').onclick=()=>{document.querySelectorAll('input:not([type=file])').forEach(e=>{if(e.type==='checkbox')e.checked=e.defaultChecked;else e.value=e.defaultValue;});document.querySelectorAll('select').forEach(e=>{const def=[...e.options].find(v=>v.defaultSelected);e.value=(def||e.options[0]).value;});$('date').value=localDate();viewMode='dtf';viewMetric='swr';batches=[];batchSignature='';lockedMeter=null;clearWord();$('quickSummary').textContent='设置已恢复；当前显示单条仿真预览，尚未生成整批。';syncSettings();show(RF.simulate(applySession(settings()),$('station').value+' 1'));listBatch();tab('single');};
$('date').value=localDate();syncSettings();show(RF.simulate(applySession(settings()),$('station').value+' 1'));listBatch();




