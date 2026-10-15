'use strict';
/* Forehead Games: static site (no build step). Online play uses PeerJS (public broker + WebRTC). */
const RES=3;
const $=id=>document.getElementById(id);
const st=$('st'),net=$('net'),stage=$('stage'),cv=$('cv'),ctx=cv.getContext('2d'),sl=$('sl'),rb=$('rb');
cv.width=440*RES;cv.height=680*RES;
stage.style.backgroundImage='url(assets/ttt.jpg)';
const ph=new Image();ph.src='assets/board.jpg';
let game='ttt',mode='local',n=2,lN=2,inGame=false,seat=0,pendingJoin=false;
const myId=Math.random().toString(36).slice(2,10);
let myName='';try{myName=localStorage.getItem('fg_name')||''}catch(e){}
const RULES={ttt:"X goes first. Tap a box on the forehead. 3 in a row wins. 'vs AI' never loses: the best you can do is a draw.",
car:"Drag the striker left/right along your baseline (or use the slider), then drag back from the striker and release to flick. Pocket coins in the corner holes. Pocketing your own colour keeps your turn. Queen = 3 points. Striker in a hole = foul (-1). Clear all your coins to win.",
lud:"Tap the dice (or Roll). A 6 brings a token out and gives another roll. Tap a glowing token to move it. Land on another colour to send it home (not on start squares). Reach the centre with an exact roll. First to bring all 4 home wins."};
/* ---- names ---- */
let roster=[];
function plist(){if(mode==='online')return roster.map(r=>r.name);return mode==='ai'?[myName,'Computer']:[myName,game==='lud'?'Player 2':'Friend','Player 3','Player 4']}
const pn=i=>plist()[i]||('Player '+(i+1));
const myTurn=p=>mode!=='online'||(inGame&&seat===p&&roster.length>=2);
function setName(v){myName=(v||'').trim().slice(0,14)||'Player';try{localStorage.setItem('fg_name',myName)}catch(e){}$('me').textContent='✏️ '+myName;
 if(mode==='online'&&conns[0]&&conns[0].open&&!isHost)conns[0].send({k:'hi',id:myId,name:myName})}
$('me').onclick=()=>{$('nin').value=myName;$('nm').style.display='flex'};
$('nok').onclick=()=>{setName($('nin').value);$('nm').style.display='none';if(pendingJoin){pendingJoin=false;joinRoom()}};
function showWin(who,sub){$('wn').textContent=who+' won!';$('ws').textContent=sub||'';$('win').style.display='flex'}
$('wcl').onclick=()=>{$('win').style.display='none'};
$('wag').onclick=()=>{$('win').style.display='none';newGame();send({t:'reset'})};
$('reset').onclick=()=>{$('win').style.display='none';newGame();send({t:'reset'})};
/* ---- menu ---- */
function drawModes(){const m=$('modes');m.innerHTML='';
 const add=(l,f)=>{const b=document.createElement('button');b.className='big';b.textContent=l;b.onclick=f;m.appendChild(b)};
 if(game==='ttt'){add('👥 Play with a friend (same phone)',()=>start('local'));add('🤖 Play vs AI (Hardest)',()=>start('ai'))}
 else add('👥 Play on this device',()=>start('local'));
 add('🌐 Play online with a code / QR',openOnline);
 $('lp').style.display=game==='lud'?'flex':'none'}
function setGame(g){nStop();game=g;mode='local';document.querySelectorAll('#tabs .pill').forEach(b=>b.classList.toggle('on',b.dataset.g===g));
 $('rules').textContent=RULES[g];$('onl').style.display='none';drawModes()}
document.querySelectorAll('#tabs .pill').forEach(b=>b.onclick=()=>setGame(b.dataset.g));
document.querySelectorAll('#lp .pill').forEach(b=>b.onclick=()=>{lN=+b.dataset.n;document.querySelectorAll('#lp .pill').forEach(x=>x.classList.toggle('on',x===b))});
function start(m){nStop();mode=m;enter()}
function openOnline(){nStop();mode='local';$('onl').style.display='block';net.textContent='Create a room and share the QR / code, or type a friend\'s code and tap Join.'}
function goFull(){try{const e=document.documentElement;if(e.requestFullscreen&&!document.fullscreenElement)e.requestFullscreen({navigationUI:'hide'}).catch(()=>{})}catch(x){}}
function enter(){inGame=true;$('menu').style.display='none';$('game').style.display='flex';
 stage.style.display=game==='ttt'?'block':'none';cv.style.display=game==='ttt'?'none':'block';
 $('carctl').style.display=game==='car'?'flex':'none';rb.style.display=game==='lud'?'':'none';
 goFull();fit();newGame()}
function exitGame(){inGame=false;nStop();mode='local';$('game').style.display='none';$('menu').style.display='flex';$('win').style.display='none';
 try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}drawModes();$('onl').style.display='none'}
$('x').onclick=exitGame;
function fit(){const a=$('area'),w=a.clientWidth,h=a.clientHeight;
 if(game==='ttt'){const r=1086/1448,W=Math.min(w,h*r);stage.style.width=W+'px';stage.style.height=W/r+'px'}
 else{const r=440/680,W=Math.min(w,h*r);cv.style.width=W+'px';cv.style.height=W/r+'px'}}
addEventListener('resize',fit);addEventListener('orientationchange',()=>setTimeout(fit,200));
document.addEventListener('fullscreenchange',()=>setTimeout(fit,100));
function newGame(){st.textContent='';react('idle',0);if(game==='ttt')tNew();else if(game==='car')cNew();else lNew()}
function refresh(){if(game==='ttt')tInfo();else if(game==='car')cInfo();else if(typeof tok!=='undefined')lInfo(lMsg)}
function onRemote(d){if(d.t==='reset'){$('win').style.display='none';newGame();return}if(game==='ttt')tRemote(d);else if(game==='car')cRemote(d);else lRemote(d)}

/* ---- online (PeerJS star network: host relays) ---- */
let peer=null,conns=[],isHost=false,pingT=null,waitT=null;
const MAXP=()=>game==='lud'?4:2;
function send(d){const m={k:'mv',d};if(isHost)conns.forEach(c=>c.open&&c.send(m));else if(conns[0]&&conns[0].open)conns[0].send(m)}
function bcast(m,except){conns.forEach(c=>{if(c!==except&&c.open)c.send(m)})}
function nStop(){clearInterval(waitT);clearInterval(pingT);waitT=pingT=null;if(peer){try{peer.destroy()}catch(e){}}peer=null;conns=[];roster=[];isHost=false;$('ping').textContent='';$('qrbox').style.display='none';$('startb').style.display='none'}
function applyRoster(list){roster=list;seat=Math.max(0,roster.findIndex(r=>r.id===myId));n=game==='lud'?Math.min(4,Math.max(2,roster.length)):2}
function lobby(){net.textContent=`Room "${$('code').value}": `+roster.map(r=>r.name).join(', ')+(roster.length<2?' | waiting for friends...':'');
 $('startb').style.display=(isHost&&roster.length>=2&&!inGame&&game==='lud')?'inline-block':'none'}
function showQR(code){$('qrbox').style.display='block';$('qrcode').innerHTML='';$('bigcode').textContent=code;
 try{new QRCode($('qrcode'),{text:location.origin+location.pathname+'?room='+code+'&g='+game,width:150,height:150,colorDark:'#000',colorLight:'#fff'})}catch(e){}}
function startWait(){const end=Date.now()+300000;clearInterval(waitT);waitT=setInterval(()=>{const t=Math.max(0,Math.round((end-Date.now())/1000));$('tmr').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
 if(t<=0){nStop();net.textContent='Time is up: nobody joined in 5 minutes. Tap Create room to try again.'}},400)}
function startPing(){clearInterval(pingT);pingT=setInterval(()=>conns.forEach(c=>c.open&&c.send({k:'ping',ts:performance.now()})),2500)}
function pingVal(ts){const p=Math.round(performance.now()-ts);const e=$('ping');e.textContent='📶 '+p+' ms';e.style.color=p<120?'#6be28a':p<300?'#ffd166':'#ff6b5e'}
function enterOnline(){clearInterval(waitT);$('qrbox').style.display='none';mode='online';startPing();enter()}
$('make').onclick=createRoom;$('join').onclick=joinRoom;
$('startb').onclick=()=>{bcast({k:'start',list:roster,game});enterOnline()};
function createRoom(){nStop();const code=Math.random().toString(36).slice(2,6);$('code').value=code;isHost=true;net.textContent='Creating room...';
 if(typeof Peer==='undefined'){net.textContent='Online needs internet access to load PeerJS.';return}
 peer=new Peer('fgx-'+game+'-'+code);
 peer.on('open',()=>{applyRoster([{id:myId,name:myName}]);showQR(code);startWait();lobby()});
 peer.on('error',e=>{net.textContent=e.type==='unavailable-id'?'That code is taken, tap Create room again.':'Online error: '+e.type});
 peer.on('connection',c=>{c.on('open',()=>{conns.push(c)});c.on('data',d=>hostData(c,d));c.on('close',()=>hostLeft(c));c.on('error',()=>{})})}
function hostData(c,d){
 if(d.k==='hi'){const known=roster.find(r=>r.id===d.id);
  if(inGame||(!known&&roster.length>=MAXP())){c.send({k:'full'});setTimeout(()=>c.close(),300);conns=conns.filter(x=>x!==c);return}
  c.pid=d.id;if(known)known.name=d.name;else roster.push({id:d.id,name:d.name});
  applyRoster(roster);bcast({k:'roster',list:roster});lobby();
  if(game!=='lud'&&roster.length>=2){bcast({k:'start',list:roster,game});enterOnline()}}
 else if(d.k==='mv'){bcast(d,c);onRemote(d.d)}
 else if(d.k==='ping')c.send({k:'pong',ts:d.ts});else if(d.k==='pong')pingVal(d.ts)}
function hostLeft(c){conns=conns.filter(x=>x!==c);const i=roster.findIndex(r=>r.id===c.pid);if(i<0)return;const nm=roster[i].name;
 if(inGame){st.textContent=nm+' left the game'}else{roster.splice(i,1);applyRoster(roster);bcast({k:'roster',list:roster});lobby()}}
function joinRoom(){const code=$('code').value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');if(!code){net.textContent='Type a room code first.';return}
 nStop();isHost=false;net.textContent='Connecting...';
 if(typeof Peer==='undefined'){net.textContent='Online needs internet access to load PeerJS.';return}
 peer=new Peer();let ok=false;
 const to=setTimeout(()=>{if(!ok){net.textContent='Could not connect. Check the code and try again.';nStop()}},15000);
 peer.on('error',e=>{clearTimeout(to);net.textContent=e.type==='peer-unavailable'?'Room not found. Check the code.':'Online error: '+e.type});
 peer.on('open',()=>{const c=peer.connect('fgx-'+game+'-'+code,{reliable:true});conns=[c];
  c.on('open',()=>{ok=true;clearTimeout(to);net.textContent='Connected. Waiting for the host to start...';c.send({k:'hi',id:myId,name:myName})});
  c.on('data',guestData);
  c.on('close',()=>{if(peer){net.textContent='The host left the room.';if(inGame)st.textContent='Host left the game'}});c.on('error',()=>{})})}
function guestData(d){
 if(d.k==='roster'){applyRoster(d.list);lobby()}
 else if(d.k==='start'){if(d.game)game=d.game;applyRoster(d.list);enterOnline()}
 else if(d.k==='full'){net.textContent='That room is full or already started.';nStop()}
 else if(d.k==='mv')onRemote(d.d);
 else if(d.k==='ping'){conns[0]&&conns[0].send({k:'pong',ts:d.ts})}else if(d.k==='pong')pingVal(d.ts)}

/* ---------- TIC TAC TOE ---------- */
const W3=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TL=[16.1,26.2,40.2],TW=[10.1,14.0,10.9],TT=[24.5,31.2,37.5],TH=[6.7,6.3,6.5];
let b,turn,over,sc={X:0,O:0,D:0};
const cells=[...Array(9)].map((_,i)=>{const e=document.createElement('button');const r=Math.floor(i/3),c=i%3;e.className='c';
 e.style.cssText=`left:${TL[c]}%;top:${TT[r]}%;width:${TW[c]}%;height:${TH[r]}%`;e.onclick=()=>tPlay(i,false);stage.appendChild(e);return e});
const win3=s=>{for(const l of W3)if(s[l[0]]&&s[l[0]]===s[l[1]]&&s[l[0]]===s[l[2]])return{p:s[l[0]],l};return null};
function tRender(){cells.forEach((e,i)=>{e.textContent=b[i]||'';e.className='c'+(b[i]?' '+b[i].toLowerCase():'');e.disabled=over||!!b[i]})}
function tInfo(){$('sc').textContent=`${pn(0)} (X) ${sc.X}  |  Draw ${sc.D}  |  ${pn(1)} (O) ${sc.O}`;if(!over)st.textContent=`${pn(turn==='X'?0:1)}'s turn (${turn})`}
function tNew(){b=Array(9).fill('');turn='X';over=false;tRender();tInfo()}
function tRemote(d){if(d.t==='m')tPlay(d.i,true)}
function tPlay(i,remote){if(over||b[i])return;
 if(!remote&&mode==='online'&&!myTurn(turn==='X'?0:1))return;
 if(!remote&&mode==='ai'&&turn==='O')return;
 b[i]=turn;if(!remote&&mode==='online')send({t:'m',i});
 const w=win3(b);
 if(w){over=true;sc[w.p]++;tRender();w.l.forEach(k=>cells[k].classList.add('win'));const nm=pn(w.p==='X'?0:1);st.textContent=nm+' won!';tInfo();showWin(nm,`3 in a row with ${w.p}`);return}
 if(b.every(Boolean)){over=true;sc.D++;tRender();st.textContent="It's a draw";tInfo();return}
 turn=turn==='X'?'O':'X';tRender();tInfo();
 if(mode==='ai'&&turn==='O'){over=true;tRender();setTimeout(()=>{over=false;tPlay(bestMove(),true)},400)}}
function mm(s,t,d){const w=win3(s);if(w)return w.p==='O'?10-d:d-10;if(s.every(Boolean))return 0;
 let r=t==='O'?-99:99;for(let i=0;i<9;i++)if(!s[i]){s[i]=t;const v=mm(s,t==='O'?'X':'O',d+1);s[i]='';r=t==='O'?Math.max(r,v):Math.min(r,v)}return r}
function bestMove(){let bi=-1,bv=-99;for(let i=0;i<9;i++)if(!b[i]){b[i]='O';const v=mm(b,'X',1);b[i]='';if(v>bv){bv=v;bi=i}}return bi}

/* ---------- board on forehead ---------- */
const BX=55,BY=20,BS=330/400,K=.62,OX=220-470*K,OY=185-620*K,MX=600,MY=1215,TILT=-.24;
let face={m:'idle',t:0,d:0};
function react(m,d){face={m,t:performance.now(),d:d===undefined?1300:d}}
function mouth(o,sm){ctx.save();ctx.translate(MX,MY);ctx.rotate(TILT);ctx.lineJoin='round';
 if(sm>0){const w=122,h=62*sm;ctx.beginPath();ctx.moveTo(-w,0);ctx.quadraticCurveTo(0,2*h,w,0);ctx.quadraticCurveTo(0,-h*.2,-w,0);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#7a3a30';ctx.lineWidth=9;ctx.stroke()}
 else{const rx=48+22*o,ry=10+50*o;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,7);ctx.fillStyle='#2b0a0b';ctx.fill();ctx.strokeStyle='#7a3a30';ctx.lineWidth=10;ctx.stroke();
  ctx.fillStyle='#c0565a';ctx.beginPath();ctx.ellipse(0,ry*.45,rx*.6,ry*.38,0,0,7);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,-ry*.6,rx*.6,ry*.26,0,0,Math.PI);ctx.fill()}
 ctx.restore()}
function base(now){ctx.setTransform(RES,0,0,RES,0,0);const g=ctx.createLinearGradient(0,0,0,680);g.addColorStop(0,'#8a5a33');g.addColorStop(1,'#4d311a');ctx.fillStyle=g;ctx.fillRect(0,0,440,680);
 ctx.save();ctx.beginPath();ctx.roundRect(8,8,424,664,16);ctx.clip();
 if(ph.complete&&ph.naturalWidth){
  const age=now-face.t,on=face.m!=='idle'&&age<face.d,f=on?(isFinite(face.d)?1-age/face.d:1):0;
  let sx=0,sc=1,rot=0,open=0,smile=0;
  if(on){if(face.m==='smile'){smile=Math.min(1,age/250);rot=Math.sin(age/230)*.01*smile;sc=1+.012*smile}
   else{open=Math.min(1,age/120)*(face.m==='wow'?1:.8)*(f<.2?f/.2:1);sx=Math.sin(age/28)*3.5*f;sc=1+.035*f}}
  ctx.translate(220+sx,540);ctx.rotate(rot);ctx.scale(sc,sc);ctx.translate(-220,-540);
  ctx.transform(K,0,0,K,OX,OY);ctx.drawImage(ph,0,0,1260,1717);
  if(open>.03||smile>0)mouth(open,smile)}
 ctx.restore();ctx.setTransform(RES*BS,0,0,RES*BS,RES*BX,RES*BY)}
function post(now){ctx.setTransform(RES,0,0,RES,0,0);const on=face.m!=='idle'&&now-face.t<face.d;if(!on)return;
 if(face.m==='smile')for(let i=0;i<34;i++){ctx.fillStyle=`hsl(${i*37},90%,60%)`;ctx.fillRect((i*137)%440,((now*.09+i*61)%720)-30,6,9)}
 ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.lineWidth=5;ctx.strokeStyle='#fff';ctx.fillStyle='#d9381e';
 const t=face.m==='wow'?'Wow!':face.m==='smile'?'Yay! 😄':'Ahh!';ctx.strokeText(t,330,520);ctx.fillText(t,330,520)}
function uPt(e){const r=cv.getBoundingClientRect(),k=440/r.width;return{x:((e.clientX-r.left)*k-BX)/BS,y:((e.clientY-r.top)*k-BY)/BS}}
function disc(x,y,r,c1,c2,rim){ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.arc(x+2,y+3,r,0,7);ctx.fill();
 const g=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.1,x,y,r);g.addColorStop(0,c1);g.addColorStop(1,c2);ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();
 ctx.strokeStyle=rim;ctx.lineWidth=1.6;ctx.stroke();ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r*.7,0,7);ctx.stroke();ctx.beginPath();ctx.arc(x,y,r*.42,0,7);ctx.stroke()}
const PC=[[34,34],[366,34],[34,366],[366,366]];
function frameArt(){
 const fr=(x,y,w,h,v)=>{const g=v?ctx.createLinearGradient(x,0,x+w,0):ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#7a3410');g.addColorStop(.5,'#e8872c');g.addColorStop(1,'#7a3410');ctx.fillStyle=g;ctx.fillRect(x,y,w,h)};
 const sg=ctx.createRadialGradient(200,200,10,200,200,270);sg.addColorStop(0,'rgba(255,238,195,.55)');sg.addColorStop(1,'rgba(226,170,100,.5)');ctx.fillStyle=sg;ctx.fillRect(0,0,400,400);
 fr(44,0,312,20,0);fr(44,380,312,20,0);fr(0,44,20,312,1);fr(380,44,20,312,1);
 for(const[x,y]of[[0,0],[356,0],[0,356],[356,356]]){const g=ctx.createLinearGradient(x,y,x+44,y+44);g.addColorStop(0,'#e4e4e4');g.addColorStop(1,'#7d7d7d');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x,y,44,44,14);ctx.fill()}
 for(const[x,y]of PC){const g=ctx.createRadialGradient(x,y,2,x,y,22);g.addColorStop(0,'#000');g.addColorStop(1,'#241812');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,21,0,7);ctx.fill()}}
function boardArt(){ctx.strokeStyle='rgba(20,12,6,.9)';ctx.lineWidth=3.5;ctx.strokeRect(60,60,280,280);ctx.lineWidth=1.2;ctx.strokeRect(74,74,252,252);
 for(const[px,py]of[[83,67],[67,83],[317,67],[333,83],[83,333],[67,317],[317,333],[333,317]]){ctx.fillStyle='#d9453c';ctx.beginPath();ctx.arc(px,py,10,0,7);ctx.fill();ctx.lineWidth=1.5;ctx.stroke()}
 for(const[x,y,sx,sy]of[[0,0,1,1],[400,0,-1,1],[0,400,1,-1],[400,400,-1,-1]]){ctx.save();ctx.translate(x,y);ctx.scale(sx,sy);ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(44,44);ctx.lineTo(112,112);ctx.stroke();ctx.fillStyle='#111';ctx.beginPath();ctx.moveTo(114,114);ctx.lineTo(104,110);ctx.lineTo(110,104);ctx.fill();
  ctx.beginPath();ctx.arc(102,102,17,-Math.PI/4,3*Math.PI/4);ctx.stroke();ctx.fillStyle='#1fa84a';ctx.beginPath();ctx.arc(74,74,4.5,0,7);ctx.fill();ctx.restore()}
 ctx.lineWidth=2;ctx.beginPath();ctx.arc(200,200,36,0,7);ctx.stroke();
 ctx.save();ctx.translate(200,200);for(let i=0;i<8;i++){const a=i*Math.PI/4,L=i%2?21:31;ctx.fillStyle=i%2?'#3b2b25':'#cf3a2d';ctx.beginPath();ctx.moveTo(Math.cos(a-.22)*7,Math.sin(a-.22)*7);ctx.lineTo(Math.cos(a)*L,Math.sin(a)*L);ctx.lineTo(Math.cos(a+.22)*7,Math.sin(a+.22)*7);ctx.fill()}
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,6,0,7);ctx.fill();ctx.strokeStyle='#cf3a2d';ctx.lineWidth=2;ctx.stroke();ctx.restore()}

/* ---------- CARROM ---------- */
let coins,S,cTurn,cSc,cMove,cAim,cPk,cOver,cPlace=false,drops=[],lastX=200,lastPl=0;
const CC=[['#ffe9b8','#d99a3d','#7a4a14'],['#6a6a6a','#0c0c0c','#000'],['#ff8a70','#b3220d','#4a0a00']];
const CR=15,SR=19,PK=26;
function cNew(){coins=[{x:200,y:200,r:CR,c:2,vx:0,vy:0}];drops=[];
 for(let i=0;i<6;i++){const a=i*Math.PI/3;coins.push({x:200+31*Math.cos(a),y:200+31*Math.sin(a),r:CR,c:i%2,vx:0,vy:0})}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;coins.push({x:200+62*Math.cos(a),y:200+62*Math.sin(a),r:CR,c:i%2,vx:0,vy:0})}
 cTurn=0;cSc=[0,0];cMove=false;cAim=null;cPlace=false;cOver=false;cPk=[];lastX=200;sl.value=200;cStriker();cInfo()}
function cStriker(){S={x:lastX,y:cTurn?67:333,r:SR,vx:0,vy:0,m:1.8,striker:true}}
function cInfo(){$('sc').textContent=`🟠 ${pn(0)}: ${cSc[0]}   |   ⚫ ${pn(1)}: ${cSc[1]}`;if(!cOver&&!cMove)st.textContent=`${cTurn?'⚫':'🟠'} ${pn(cTurn)}'s turn`+(mode==='online'?(myTurn(cTurn)?' (your shot)':''):'')}
function placeX(x,remote){if(cMove||cOver)return;x=Math.max(90,Math.min(310,x));S.x=x;lastX=x;sl.value=x;
 if(!remote){const t=performance.now();if(t-lastPl>90){lastPl=t;send({t:'p',x})}}}
sl.oninput=()=>{if(myTurn(cTurn))placeX(+sl.value)};
function cRemote(d){if(cMove||cOver)return;if(d.t==='p'&&!myTurn(cTurn))placeX(d.x,true);else if(d.t==='s'){S.x=d.x;lastX=d.x;cShoot(d.vx,d.vy)}}
function cShoot(vx,vy){S.vx=vx;S.vy=vy;cMove=true;cPk=[];st.textContent='...';react('ahh',1400)}
function cStep(){const B=[...coins,S];
 for(const o of B){o.x+=o.vx;o.y+=o.vy;const sp=Math.hypot(o.vx,o.vy);
  if(sp>0){const ns=sp*.989-.012;if(ns<.06){o.vx=o.vy=0}else{o.vx*=ns/sp;o.vy*=ns/sp}}
  if(o.x<22+o.r){o.x=22+o.r;o.vx=-o.vx*.72}if(o.x>378-o.r){o.x=378-o.r;o.vx=-o.vx*.72}
  if(o.y<22+o.r){o.y=22+o.r;o.vy=-o.vy*.72}if(o.y>378-o.r){o.y=378-o.r;o.vy=-o.vy*.72}}
 for(let i=0;i<B.length;i++)for(let j=i+1;j<B.length;j++){const a=B[i],c=B[j];let dx=c.x-a.x,dy=c.y-a.y;const d=Math.hypot(dx,dy),m=a.r+c.r;
  if(d<m&&d>0){dx/=d;dy/=d;const ma=a.m||1,mc=c.m||1,p=(a.vx-c.vx)*dx+(a.vy-c.vy)*dy;
   if(p>0){const k=1.92*p/(ma+mc);a.vx-=k*mc*dx;a.vy-=k*mc*dy;c.vx+=k*ma*dx;c.vy+=k*ma*dy}
   const o=(m-d)/2;a.x-=o*dx;a.y-=o*dy;c.x+=o*dx;c.y+=o*dy}}
 for(const o of B)if(!o.out)for(const[px,py]of PC)if(Math.hypot(o.x-px,o.y-py)<PK){o.out=true;drops.push({x:o.x,y:o.y,px,py,r:o.r,c:o.c,s:!!o.striker,t:performance.now()});o.vx=o.vy=0;cPk.push(o);break}
 coins=coins.filter(o=>!o.out);
 if(!B.some(o=>!o.out&&(o.vx||o.vy)))cEnd()}
function cEnd(){cMove=false;let keep=false;
 for(const o of cPk){if(o.striker)cSc[cTurn]=Math.max(0,cSc[cTurn]-1);else if(o.c===2){cSc[cTurn]+=3;keep=true}else{cSc[o.c]++;if(o.c===cTurn)keep=true}}
 if(cPk.some(o=>o.striker))keep=false;
 if(cPk.some(o=>!o.striker))react('wow',1500);
 const w=[0,1].find(p=>!coins.some(o=>o.c===p));
 if(w!==undefined){cOver=true;react('smile',Infinity);st.textContent=`🏆 ${pn(w)} won!`;cInfo();showWin(pn(w),`Cleared all coins. Score ${cSc[0]} - ${cSc[1]}`);return}
 if(!keep)cTurn^=1;cStriker();cInfo()}
function cDraw(now){base(now);frameArt();boardArt();
 for(const o of coins){const c=CC[o.c];disc(o.x,o.y,o.r,c[0],c[1],c[2])}
 drops=drops.filter(d=>now-d.t<320);
 for(const d of drops){const p=(now-d.t)/320,c=d.s?['#e2f1ff','#2c78d4','#0d3e80']:CC[d.c];disc(d.x+(d.px-d.x)*p,d.y+(d.py-d.y)*p,d.r*(1-p*.8),c[0],c[1],c[2])}
 if(!cMove&&!cOver&&myTurn(cTurn)){ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(90,S.y);ctx.lineTo(310,S.y);ctx.stroke();ctx.setLineDash([])}
 disc(S.x,S.y,S.r,'#e2f1ff','#2c78d4','#0d3e80');ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(S.x-9,S.y);ctx.lineTo(S.x+9,S.y);ctx.moveTo(S.x,S.y-9);ctx.lineTo(S.x,S.y+9);ctx.stroke();
 if(cAim){const dx=S.x-cAim.x,dy=S.y-cAim.y,l=Math.hypot(dx,dy)||1,p=Math.min(l,200);
  ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(S.x,S.y);ctx.lineTo(S.x+dx/l*p*1.6,S.y+dy/l*p*1.6);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#ffcf33';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(S.x,S.y);ctx.lineTo(S.x-dx/l*p*.5,S.y-dy/l*p*.5);ctx.stroke()}
 post(now)}

/* ---------- LUDO ---------- */
const P=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const HOME=[[[7,1],[7,2],[7,3],[7,4],[7,5]],[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]],[[13,7],[12,7],[11,7],[10,7],[9,7]]];
const YARD=[[[2,2],[2,4],[4,2],[4,4]],[[2,10],[2,12],[4,10],[4,12]],[[10,10],[10,12],[12,10],[12,12]],[[10,2],[10,4],[12,2],[12,4]]];
const LC=['#e03b2f','#2fa84f','#2f6fe0','#f2c230'],LN=['Red','Green','Blue','Yellow'],START=[0,13,26,39],SAFE=new Set([0,8,13,21,26,34,39,47]),SEATS={2:[0,2],3:[0,1,2],4:[0,1,2,3]};
let tok,lt,dice,lWin,lLegal,rolling=false,rollT=0,lMsg='';
const G=400/15,PIPS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
const lCol=i=>SEATS[n][i];
function lNew(){if(mode!=='online')n=lN;tok=[...Array(n)].map(()=>[-1,-1,-1,-1]);lt=0;dice=null;lWin=-1;lLegal=[];rolling=false;lInfo('Tap the dice to roll')}
function lInfo(m){lMsg=m;st.textContent=m;$('sc').textContent=Array.from({length:n},(_,i)=>`${LN[lCol(i)]}: ${pn(i)}`).join('  |  ');rb.disabled=lWin>=0||dice!==null||!myTurn(lt)}
function lTurnMsg(){return `${LN[lCol(lt)]} (${pn(lt)}): roll the dice`+(myTurn(lt)&&mode==='online'?' (your turn)':'')}
function lXY(i,j){const col=lCol(i),r=tok[i][j];let c;
 if(r<0)c=YARD[col][j];else if(r<=50)c=P[(START[col]+r)%52];else if(r<=55)c=HOME[col][r-51];else c=[7,7];
 let ox=0,oy=0;if(r===56){ox=(j%2?1:-1)*11;oy=(j<2?-1:1)*11}return[(c[1]+.5)*G+ox,(c[0]+.5)*G+oy]}
const legal=(i,d)=>{const o=[];tok[i].forEach((r,j)=>{if(r<0?d===6:r+d<=56)o.push(j)});return o};
function tryRoll(){if(lWin>=0||dice!==null||!myTurn(lt))return;const v=1+Math.floor(Math.random()*6);lRoll(v);send({t:'r',v})}
rb.onclick=tryRoll;
function lRoll(v){dice=v;rolling=true;react('ahh',850);rollT=performance.now();lInfo(`${LN[lCol(lt)]} (${pn(lt)}) is rolling...`);setTimeout(lAfter,850)}
function lAfter(){rolling=false;lLegal=legal(lt,dice);const who=`${LN[lCol(lt)]} (${pn(lt)})`;
 if(!lLegal.length){lInfo(`${who} rolled ${dice}: no move`);setTimeout(()=>{dice=null;lNext()},1000)}
 else if(lLegal.length===1){lInfo(`${who} rolled ${dice}`);setTimeout(()=>lMove(lLegal[0]),450)}
 else lInfo(`${who} rolled ${dice}: tap a glowing token`)}
function lNext(){lt=(lt+1)%n;lLegal=[];lInfo(lTurnMsg())}
function lMove(j){const r=tok[lt][j];tok[lt][j]=r<0?0:r+dice;const nr=tok[lt][j];let hit=false;
 if(nr<=50){const idx=(START[lCol(lt)]+nr)%52;if(!SAFE.has(idx))tok.forEach((t,q)=>{if(q!==lt)t.forEach((r2,k)=>{if(r2>=0&&r2<=50&&(START[lCol(q)]+r2)%52===idx){t[k]=-1;hit=true}})})}
 const six=dice===6;dice=null;lLegal=[];
 if(tok[lt].every(r=>r===56)){lWin=lt;react('smile',Infinity);lInfo(`🏆 ${pn(lt)} won!`);showWin(pn(lt),`${LN[lCol(lt)]} brought all 4 tokens home`);return}
 if(hit)react('wow',1500);else if(six)react('smile',1800);if(six||hit)lInfo(`${pn(lt)} ${hit?'captured a token! ':''}Roll again`);else lNext()}
function lRemote(d){if(d.t==='r'&&dice===null&&lWin<0)lRoll(d.v);else if(d.t==='m'&&dice!==null&&!rolling&&lLegal.includes(d.j))lMove(d.j)}
function die(cx,cy,sz,v,fade){ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=fade?.8:1;ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.roundRect(-sz/2+3,-sz/2+4,sz,sz,10);ctx.fill();
 ctx.fillStyle='#fff';ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-sz/2,-sz/2,sz,sz,10);ctx.fill();ctx.stroke();
 ctx.fillStyle='#111';for(const[x,y]of PIPS[v]){ctx.beginPath();ctx.arc(x*sz*.27,y*sz*.27,sz*.075,0,7);ctx.fill()}ctx.restore()}
function lDraw(now){base(now);frameArt();ctx.save();ctx.translate(20,20);ctx.scale(.9,.9);
 ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(0,0,400,400);
 for(let q=0;q<4;q++){const y0=q<2?0:9,x0=(q===0||q===3)?0:9;ctx.fillStyle=LC[q]+'77';ctx.fillRect(x0*G,y0*G,6*G,6*G);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fillRect((x0+1)*G,(y0+1)*G,4*G,4*G)}
 for(let q=0;q<4;q++)YARD[q].forEach(c=>{ctx.fillStyle=LC[q]+'bb';ctx.beginPath();ctx.arc((c[1]+.5)*G,(c[0]+.5)*G,16,0,7);ctx.fill()});
 ctx.lineWidth=1;ctx.strokeStyle='rgba(0,0,0,.55)';
 P.forEach((c,i)=>{ctx.fillStyle=START.includes(i)?LC[START.indexOf(i)]+'cc':SAFE.has(i)?'rgba(255,255,255,.6)':'rgba(255,255,255,.34)';ctx.fillRect(c[1]*G,c[0]*G,G,G);ctx.strokeRect(c[1]*G,c[0]*G,G,G);
  if(SAFE.has(i)&&!START.includes(i)){ctx.fillStyle='#000';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('★',(c[1]+.5)*G,(c[0]+.5)*G+5)}});
 HOME.forEach((h,q)=>h.forEach(c=>{ctx.fillStyle=LC[q]+'cc';ctx.fillRect(c[1]*G,c[0]*G,G,G);ctx.strokeRect(c[1]*G,c[0]*G,G,G)}));
 [[0,[6,6],[6,9]],[1,[6,6],[9,6]],[2,[9,6],[9,9]],[3,[6,9],[9,9]]].forEach(([q,a,c])=>{ctx.fillStyle=LC[q]+'cc';ctx.beginPath();ctx.moveTo(a[0]*G,a[1]*G);ctx.lineTo(c[0]*G,c[1]*G);ctx.lineTo(7.5*G,7.5*G);ctx.closePath();ctx.fill();ctx.stroke()});
 const ok=myTurn(lt)&&dice===null&&lWin<0;
 for(let i=0;i<n;i++)for(let j=0;j<4;j++){const[x,y]=lXY(i,j),c=LC[lCol(i)];
  if(i===lt&&dice!==null&&!rolling&&lLegal.length>1&&lLegal.includes(j)){ctx.strokeStyle='#fff';ctx.lineWidth=3+Math.sin(now/120);ctx.beginPath();ctx.arc(x,y,19,0,7);ctx.stroke()}
  disc(x,y,13,'#ffffff',c,'#111')}
 let v=dice,sh=0;if(rolling){v=1+((now/80|0)*5)%6;sh=Math.sin(now/30)*3}
 die(200+sh,200-sh,52,v||1,v===null&&!ok);
 if(ok){ctx.fillStyle='#000';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('TAP',200,238)}
 ctx.restore();post(now)}

/* ---------- input + loop ---------- */
cv.addEventListener('pointerdown',e=>{if(!inGame)return;const u=uPt(e);
 if(game==='car'){if(cMove||cOver||!myTurn(cTurn))return;
  if(Math.hypot(u.x-S.x,u.y-S.y)<SR+18){cAim=u;try{cv.setPointerCapture(e.pointerId)}catch(x){}}
  else if(Math.abs(u.y-S.y)<36&&u.x>60&&u.x<340){cPlace=true;placeX(u.x);try{cv.setPointerCapture(e.pointerId)}catch(x){}}}
 else if(game==='lud'){if(lWin>=0)return;const v={x:(u.x-20)/.9,y:(u.y-20)/.9};
  if(dice===null){if(Math.hypot(v.x-200,v.y-200)<50)tryRoll();return}
  if(rolling||!myTurn(lt)||lLegal.length<2)return;
  for(const j of lLegal){const[x,y]=lXY(lt,j);if(Math.hypot(v.x-x,v.y-y)<22){send({t:'m',j});lMove(j);return}}}});
cv.addEventListener('pointermove',e=>{if(cAim)cAim=uPt(e);else if(cPlace)placeX(uPt(e).x)});
cv.addEventListener('pointerup',e=>{if(cPlace){cPlace=false;return}if(!cAim)return;const u=uPt(e);let vx=(S.x-u.x)*.11,vy=(S.y-u.y)*.11;const l=Math.hypot(vx,vy);cAim=null;
 if(l<1.5)return;if(l>24){vx*=24/l;vy*=24/l}send({t:'s',x:S.x,vx,vy});cShoot(vx,vy)});
cv.addEventListener('pointercancel',()=>{cAim=null;cPlace=false});
document.addEventListener('keydown',e=>{if(!inGame||game!=='car'||cMove||!myTurn(cTurn))return;if(e.key==='ArrowLeft')placeX(S.x-8);if(e.key==='ArrowRight')placeX(S.x+8)});
function loop(){const now=performance.now();if(inGame){if(game==='car'){if(cMove)for(let k=0;k<3&&cMove;k++)cStep();cDraw(now)}else if(game==='lud')lDraw(now)}requestAnimationFrame(loop)}
/* ---------- init ---------- */
$('rules').textContent=RULES.ttt;drawModes();
if(!myName){$('nm').style.display='flex';myName='Player'}else{}
setName(myName);loop();
try{const q=new URLSearchParams(location.search),rc=q.get('room'),g=q.get('g');
 if(rc){if(g&&RULES[g])setGame(g);$('code').value=rc.slice(0,8);openOnline();$('code').value=rc.slice(0,8);
  if($('nm').style.display==='flex')pendingJoin=true;else joinRoom()}}catch(e){}
