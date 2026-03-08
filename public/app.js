// ══ WELCOME ══════════════════════════════════════
let userName = 'GHOST_01';
const roomCode = 'SV-' + Math.random().toString(36).substring(2,6).toUpperCase();

// ══ PASSWORD + ENTER VAULT ═══════════════════════
// Passwords are stored as SHA-256(username.toLowerCase() + ':' + password)
// The real passwords are NOT in this code — only their hashes.
const USER_HASHES = {
  'elite':       '39d885893e5ca53002f92a1783f87305537a226e26ed697b429a119452f17d64',
  'sketch':      '098ce2369df060b1e2507fb5c99f271f370ae975cb4a80ff30141249b93c6548',
  'prometheus':  '6641954489336236bddcf5c508395b2c4fe040137e91b96b0a5cb7d412c417e7',
  'goddzilla':   '9d631e248508a9434e7583da16c5c498273a12a054c5456620a81964651c6dac',
  'spooderman':  'd8f6cdb268ecb45cfc176a63fed3bd7e32a4356a31c012dc9efa753aa5a2a4cc',
  'pujari':      'ae4b836b303de0ccc96f7f681a2399d7303e2ac843f1b39d7e8c2c0c67fb7773',
};

// Canonical display names (preserves original casing for the UI)
const USER_DISPLAY = {
  'elite':'Elite','sketch':'Sketch','prometheus':'Prometheus',
  'goddzilla':'Goddzilla','spooderman':'SpooderMan','pujari':'Pujari'
};

let socket = null;

async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function enterVault(){
  const n = document.getElementById('wName').value.trim();
  const p = document.getElementById('wPass').value;
  const err = document.getElementById('wErr');

  if(!n){ err.textContent='⚠ ENTER YOUR HANDLE'; shakeInput('wName'); return; }
  if(!p){ err.textContent='⚠ ENTER YOUR PASSWORD'; shakeInput('wPass'); return; }

  const key = n.toLowerCase();

  // Check username exists
  if(!USER_HASHES[key]){
    err.textContent='⚠ UNKNOWN USER — ACCESS DENIED';
    shakeInput('wName');
    return;
  }

  // Hash what they typed and compare
  const attempt = await sha256(key + ':' + p);
  if(attempt !== USER_HASHES[key]){
    err.textContent='⚠ WRONG PASSWORD — ACCESS DENIED';
    shakeInput('wPass');
    document.getElementById('wPass').value='';
    return;
  }

  err.textContent='';
  // Use the canonical display name
  userName = USER_DISPLAY[key];

  // Flash-cut transition
  const ov = document.getElementById('zoomOv');
  ov.style.pointerEvents = 'all';
  ov.style.transition = 'opacity 0.08s ease-in';
  ov.style.opacity = '1';

  setTimeout(()=>{
    document.getElementById('welcome').style.display = 'none';
    const app = document.getElementById('mainApp');
    app.classList.add('show');
    document.getElementById('rc').textContent = roomCode;
    document.getElementById('utag').textContent = 'USER: ' + userName;
    document.getElementById('crsub').textContent = 'ROOM ' + roomCode;
    document.getElementById('ni').value = userName;
    buildLib();
    loadTrendingGifs();
    ov.style.transition = 'opacity 0.18s ease-out';
    ov.style.opacity = '0';
    setTimeout(()=>{ ov.style.pointerEvents='none'; }, 200);
    initSocket();
  }, 90);
}

function shakeInput(id){
  const el = document.getElementById(id);
  el.style.animation = 'none';
  el.style.borderColor = '#f87171';
  el.style.boxShadow = '0 0 0 2px rgba(248,113,113,0.25)';
  // Shake via transform
  let i = 0;
  const shake = setInterval(()=>{
    el.style.transform = i%2===0 ? 'translateX(6px)' : 'translateX(-6px)';
    if(++i > 5){ clearInterval(shake); el.style.transform=''; }
  }, 55);
  setTimeout(()=>{ el.style.borderColor=''; el.style.boxShadow=''; }, 800);
}

// ══ SOCKET.IO REAL-TIME ═══════════════════════════
function initSocket(){
  // Check if Socket.IO loaded
  if(typeof io === 'undefined'){
    sys('▸ LOCAL MODE — Socket.IO not connected');
    sys(`▸ WELCOME ${userName} // ROOM ${roomCode} IS LIVE`);
    return;
  }

  // Connect to your server (same origin when served by Node)
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', ()=>{
    socket.emit('join-room', { room: roomCode, user: userName });
    sys(`▸ WELCOME ${userName} // ROOM ${roomCode} IS LIVE`);
  });

  socket.on('connect_error', ()=>{
    sys('⚠ SERVER UNREACHABLE — LOCAL MODE');
  });

  // Real-time user count
  socket.on('user-joined', ({ user, count })=>{
    if(user !== userName) sys(`▸ ${user} JOINED THE ROOM`);
    document.getElementById('onlineCnt').textContent = count + ' ONLINE';
  });

  socket.on('user-left', ({ user, count })=>{
    sys(`▸ ${user} LEFT THE ROOM`);
    document.getElementById('onlineCnt').textContent = count + ' ONLINE';
  });

  // Incoming chat messages from others
  socket.on('chat-msg', ({ user, text })=>{
    if(user !== userName) addMsg(user, text);
  });

  // Incoming GIFs from others
  socket.on('send-gif', ({ user, url })=>{
    if(user !== userName) renderIncomingGif(user, url);
  });

  // Incoming reactions from others
  socket.on('react', ({ user, emoji })=>{
    if(user !== userName){
      const el = document.createElement('div');
      el.className = 'fl'; el.textContent = emoji;
      el.style.cssText = `left:${20+Math.random()*40}vw;bottom:100px;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 2300);
    }
  });

  // Playback sync from others
  socket.on('playback', ({ action, time })=>{
    if(mode !== 'file') return;
    if(action === 'play'){ vid.currentTime = time; vid.play(); playing=true; setPb(true); sys('▸ SYNC: PLAY'); }
    if(action === 'pause'){ vid.pause(); playing=false; setPb(false); sys('▸ SYNC: PAUSE'); }
    if(action === 'seek'){ vid.currentTime = time; sys(`▸ SYNC: SEEK ${ft(time)}`); }
  });

  // Pause request from others
  socket.on('req-pause', ({ user, reason })=>{
    reqMsg(`⏸ ${user} REQUESTED PAUSE${reason?' — "'+reason+'"':''}`);
    setTimeout(activatePause, 5000);
  });

  // Change request from others
  socket.on('req-change', ({ user, what })=>{
    reqMsg(`⇄ ${user} WANTS: "${what}"`);
  });
}

function renderIncomingGif(user, url){
  const w = document.getElementById('msgs'), d = document.createElement('div');
  d.className = 'msg';
  const c = gc(user);
  d.innerHTML = `<div class="mt2"><span class="mn" style="color:${c};text-shadow:0 0 6px ${c}44">${user}</span><span class="mts">${ts()}</span></div><div class="mb"><img src="${url}" style="max-width:180px;max-height:120px;border-radius:4px;display:block;margin-top:4px;border:1px solid var(--brd)"></div>`;
  w.appendChild(d); w.scrollTop = w.scrollHeight;
}

document.getElementById('wName').addEventListener('keydown', e=>{ if(e.key==='Enter') enterVault(); });

// ══ ROOM ════════════════════════════════════════
function copyRoom(){
  navigator.clipboard.writeText(`Join my StreamVault room! ${roomCode}  ${location.href}`).catch(()=>{});
  showToast('INVITE LINK COPIED ✓');
}

// ══ DRAWER ══════════════════════════════════════
let drawerOpen = false;
function toggleDrawer(){
  drawerOpen = !drawerOpen;
  document.getElementById('srcDrw').classList.toggle('open', drawerOpen);
  document.getElementById('insBtn').classList.toggle('active', drawerOpen);
}
function showStab(n,el){
  document.querySelectorAll('.stab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.spnl').forEach(p=>p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('sp-'+n).classList.add('on');
}

// ══ MEDIA ═══════════════════════════════════════
let mode=null, playing=false, ss=null;
const vid=document.getElementById('mainVid');
const ytf=document.getElementById('ytFrame');
const vph=document.getElementById('vph');

// ══ YOUTUBE SEARCH ═══════════════════════════════
const YT_RAPID_KEY = 'cd43d8f25amsh6677968a81fc078p11893bjsn8f5528c141b4';
const YT_MUSIC_KEY = '99a0b09c04msh0b4a9140a20d6e2p1a0939jsn0dea99e0f69b';

let ytNextToken = null, ytLastQ = '';
let muNextToken = null, muLastQ = '';

function closeYTOverlay(){ document.getElementById('ytOverlay').classList.remove('open'); }
function closeMuOverlay(){ document.getElementById('muOverlay').classList.remove('open'); }

// Close ALL overlays before opening a new one
function openYTOverlay(){ closeMuOverlay(); document.getElementById('ytOverlay').classList.add('open'); }
function openMuOverlay(){ closeYTOverlay(); document.getElementById('muOverlay').classList.add('open'); }

async function ytSearch(){
  const q = document.getElementById('ytSearchQ').value.trim(); if(!q) return;
  ytLastQ = q; ytNextToken = null;
  const grid = document.getElementById('ytOverlayGrid');
  const status = document.getElementById('ytOverlayStatus');
  document.getElementById('ytOverlay').classList.add('open');
  status.classList.add('show');
  status.textContent = '🔍 SEARCHING "' + q.toUpperCase() + '"...';
  grid.innerHTML = '';
  document.getElementById('ytLoadMoreWrap').style.display = 'none';
  closeDrawer();
  await fetchYT(q, null, grid, status, 'ytLoadMoreWrap');
}

async function ytLoadMore(){
  if(!ytLastQ || !ytNextToken) return;
  await fetchYT(ytLastQ, ytNextToken, document.getElementById('ytOverlayGrid'), document.getElementById('ytOverlayStatus'), 'ytLoadMoreWrap', true);
}

async function fetchYT(q, next, grid, status, wrapId, append=false){
  try {
    let url = `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(q)}&hl=en&gl=US&type=v`;
    if(next) url += `&next=${encodeURIComponent(next)}`;
    const r = await fetch(url, { headers: { 'x-rapidapi-key': YT_RAPID_KEY, 'x-rapidapi-host': 'youtube-search-and-download.p.rapidapi.com' }});
    if(!r.ok) throw new Error();
    const data = await r.json();
    status.classList.remove('show');
    ytNextToken = data.next || null;
    document.getElementById(wrapId).style.display = ytNextToken ? 'block' : 'none';
    const videos = (data.contents || []).filter(c => c && c.video && c.video.videoId);
    if(!videos.length && !append){ status.textContent='NO RESULTS FOUND'; status.classList.add('show'); return; }
    if(!append) grid.innerHTML = '';
    videos.forEach(item => {
      const v = item.video; if(!v||!v.videoId) return;
      const id = v.videoId;
      const thumb = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      const title = v.title || 'Untitled';
      const channel = v.channelName || '';
      const duration = v.lengthText || '';
      const views = v.viewCountText || '';
      const card = document.createElement('div');
      card.className = 'yt-card';
      card.innerHTML = `<img class="yt-card-thumb" src="${thumb}" onerror="this.src='https://i.ytimg.com/vi/${id}/mqdefault.jpg'" alt="" loading="lazy"><div class="yt-card-info"><div class="yt-card-title">${esc(title)}</div><div class="yt-card-channel">📺 ${esc(channel)}${duration?' · '+duration:''}${views?' · '+views:''}</div></div>`;
      card.onclick = () => loadYTById(id, title);
      grid.appendChild(card);
    });
  } catch(e){
    status.textContent = '⚠ SEARCH FAILED — CHECK YOUR CONNECTION';
    status.classList.add('show');
  }
}

function loadYTById(id, title){
  closeYTOverlay();
  hide(); ytf.style.display='block';
  ytf.src=`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  mode='yt'; playing=true; setPb(true);
  sys(`▶ PLAYING: ${title||id}`);
  document.getElementById('ytSearchQ').value='';
}

function loadYT(){
  const raw=document.getElementById('ytUrl').value.trim(); if(!raw) return;
  const m=raw.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  let id = m ? m[1] : (/^[a-zA-Z0-9_-]{11}$/.test(raw) ? raw : null);
  if(!id){ sys('⚠ INVALID YOUTUBE URL'); return; }
  loadYTById(id, '');
}

// ══ MUSIC SEARCH ════════════════════════════════════
async function musicSearch(){
  const q = document.getElementById('muSearchQ').value.trim(); if(!q) return;
  muLastQ = q; muNextToken = null;
  const grid = document.getElementById('muOverlayGrid');
  const status = document.getElementById('muOverlayStatus');
  openMuOverlay();
  status.classList.add('show');
  status.textContent = '🎵 SEARCHING "' + q.toUpperCase() + '"...';
  grid.innerHTML = '';
  document.getElementById('muLoadMoreWrap').style.display = 'none';
  closeDrawer();
  await fetchMusic(q, null, grid, status, 'muLoadMoreWrap');
}

async function muLoadMore(){
  if(!muLastQ || !muNextToken) return;
  await fetchMusic(muLastQ, muNextToken, document.getElementById('muOverlayGrid'), document.getElementById('muOverlayStatus'), 'muLoadMoreWrap', true);
}

async function fetchMusic(q, next, grid, status, wrapId, append=false){
  try {
    let url = `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(q+' music')}&hl=en&gl=US&type=v`;
    if(next) url += `&next=${encodeURIComponent(next)}`;
    const r = await fetch(url, { headers: { 'x-rapidapi-key': YT_MUSIC_KEY, 'x-rapidapi-host': 'youtube-search-and-download.p.rapidapi.com' }});
    if(!r.ok) throw new Error();
    const data = await r.json();
    status.classList.remove('show');
    muNextToken = data.next || null;
    document.getElementById(wrapId).style.display = muNextToken ? 'block' : 'none';
    const items = (data.contents || []).filter(c => c && c.video && c.video.videoId);
    if(!items.length && !append){ status.textContent='NO RESULTS'; status.classList.add('show'); return; }
    if(!append) grid.innerHTML = '';
    items.forEach(item => {
      const v = item.video; if(!v||!v.videoId) return;
      const id = v.videoId;
      const thumb = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      const title = v.title || 'Untitled';
      const channel = v.channelName || '';
      const duration = v.lengthText || '';
      const card = document.createElement('div');
      card.className = 'music-item';
      card.innerHTML = `<img class="music-thumb" src="${thumb}" alt=""><div class="music-info"><div class="music-title">${esc(title)}</div><div class="music-artist">🎵 ${esc(channel)}</div></div><div class="music-dur">${esc(duration)}</div>`;
      card.onclick = () => playMusicById(id, title, channel, thumb);
      grid.appendChild(card);
    });
  } catch(e){
    status.textContent = '⚠ SEARCH FAILED';
    status.classList.add('show');
  }
}

function playMusicById(id, title, channel, thumb){
  closeMuOverlay();
  hide();
  // Show now playing bar
  const np = document.getElementById('nowPlaying');
  if(np){
    np.style.display = 'flex';
    document.getElementById('npThumb').src = thumb || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    document.getElementById('npTitle').textContent = title;
    document.getElementById('npChannel').textContent = channel;
  }
  // Load YouTube embed hidden (audio only)
  ytf.style.display = 'block';
  ytf.style.opacity = '0';
  ytf.style.pointerEvents = 'none';
  ytf.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  mode = 'music'; playing = true; setPb(true);
  sys(`🎵 NOW PLAYING: ${title}`);
  document.getElementById('muSearchQ').value = '';
}

function loadAudio(e){
  const f=e.target.files[0]; if(!f) return;
  hide(); vid.style.display='block'; vid.src=URL.createObjectURL(f);
  vid.volume=parseFloat(document.getElementById('vs').value);
  mode='file'; vid.play().then(()=>{playing=true;setPb(true);}).catch(()=>{});
  bindVid(); sys(`🎵 AUDIO: ${f.name}`); closeDrawer();
}
async function startScreen(){
  try{
    ss=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    hide(); vid.style.display='block'; vid.srcObject=ss; vid.volume=0;
    mode='screen'; playing=true; vid.play(); setPb(true);
    document.getElementById('scrSt').textContent='● LIVE';
    document.getElementById('stopBtn').style.display='';
    sys('🖥 SCREEN SHARE LIVE'); closeDrawer();
    ss.getVideoTracks()[0].addEventListener('ended', stopScreen);
  } catch(e){ sys('⚠ SCREEN SHARE CANCELLED'); }
}
function stopScreen(){
  if(ss){ ss.getTracks().forEach(t=>t.stop()); ss=null; }
  vid.srcObject=null; hide(); vph.style.display='flex';
  document.getElementById('scrSt').textContent='IDLE';
  document.getElementById('stopBtn').style.display='none';
  mode=null; playing=false; setPb(false); sys('🖥 SCREEN SHARE ENDED');
}
function closeDrawer(){ drawerOpen=false; document.getElementById('srcDrw').classList.remove('open'); document.getElementById('insBtn').classList.remove('active'); }
function hide(){ vph.style.display='none'; vid.style.display='none'; ytf.style.display='none'; ytf.src=''; }
function bindVid(){
  vid.ontimeupdate=upd;
  vid.onended=()=>{ playing=false; setPb(false); sys('⏹ PLAYBACK ENDED'); };
}
function upd(){
  const p=vid.duration?vid.currentTime/vid.duration*100:0;
  document.getElementById('pf').style.width=p+'%';
  document.getElementById('tc').textContent=`${ft(vid.currentTime)} / ${ft(vid.duration)}`;
}
function ft(s){ if(!s||isNaN(s)) return'00:00'; const m=Math.floor(s/60),sec=Math.floor(s%60); return`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
function setPb(p){ const b=document.getElementById('pb'); b.textContent=p?'⏸ PAUSE':'▶ PLAY'; b.classList.toggle('playing',p); }
function togglePlay(){
  if(mode==='yt' || mode==='music'){ sys('ℹ USE YOUTUBE PLAYER CONTROLS'); return; }
  if(!mode){ sys('⚠ CLICK ⏏ INSERT TAPE FIRST'); return; }
  if(playing){
    vid.pause(); playing=false; setPb(false);
    if(socket?.connected) socket.emit('playback',{room:roomCode,action:'pause',time:vid.currentTime});
  } else {
    vid.play(); playing=true; setPb(true);
    if(socket?.connected) socket.emit('playback',{room:roomCode,action:'play',time:vid.currentTime});
  }
  sys(playing ? `▶ ${getName()} HIT PLAY` : `⏸ ${getName()} PAUSED`);
}
function rew(){ if(vid&&mode==='file'){ vid.currentTime=Math.max(0,vid.currentTime-10); if(socket?.connected) socket.emit('playback',{room:roomCode,action:'seek',time:vid.currentTime}); } }
function seek(e){
  if(mode!=='file'||!vid.duration) return;
  const r=e.currentTarget.getBoundingClientRect();
  vid.currentTime=((e.clientX-r.left)/r.width)*vid.duration;
  if(socket?.connected) socket.emit('playback',{room:roomCode,action:'seek',time:vid.currentTime});
}
function setVol(v){ if(vid) vid.volume=v; }

// ══ LIBRARY ════════════════════════════════════
function buildLib(){
  // Library is empty until user connects their server
  document.getElementById('lg').innerHTML = '<div style="font-family:\'VT323\',monospace;font-size:0.65rem;color:var(--muted);letter-spacing:1px;padding:8px 0;opacity:0.6">NO MEDIA — CONNECT YOUR SERVER TO POPULATE</div>';
}

// ══ PAUSE SYSTEM ════════════════════════════════
let pausesLeft=2, pauseTimer=null;
function openReqPause(){
  if(pausesLeft<=0){ showToast('NO PAUSES LEFT!'); return; }
  document.getElementById('pleft').textContent=pausesLeft;
  document.getElementById('rpModal').classList.add('show');
}
function openReqChange(){ document.getElementById('rcModal').classList.add('show'); }
function closeModals(){ document.querySelectorAll('.rmodal').forEach(m=>m.classList.remove('show')); }
function sendPauseReq(){
  const r=document.getElementById('pReason').value.trim();
  closeModals(); pausesLeft--;
  document.getElementById('pcnt').innerHTML=`PAUSES: <strong>${pausesLeft}</strong>`;
  if(socket?.connected){
    socket.emit('req-pause',{room:roomCode,user:getName(),reason:r});
  } else {
    reqMsg(`⏸ ${getName()} REQUESTED PAUSE${r?' — "'+r+'"':''} · AUTO-ACCEPT IN 5s`);
    setTimeout(activatePause, 5000);
  }
}
function activatePause(){
  if(mode==='file') vid.pause(); playing=false; setPb(false);
  const ov=document.getElementById('pauseOv');
  document.getElementById('pauseBy').textContent=getName();
  ov.classList.add('show');
  let secs=180;
  document.getElementById('pauseTmr').textContent='3:00';
  pauseTimer=setInterval(()=>{
    secs--; if(secs<=0){ clearInterval(pauseTimer); resumePause(); return; }
    const m=Math.floor(secs/60),s=secs%60;
    document.getElementById('pauseTmr').textContent=`${m}:${String(s).padStart(2,'0')}`;
  },1000);
  reqMsg('⏸ PAUSED — AUTO-RESUME IN 3 MIN');
}
function resumePause(){
  clearInterval(pauseTimer);
  document.getElementById('pauseOv').classList.remove('show');
  if(mode==='file'){ vid.play(); playing=true; setPb(true); }
  sys("▶ RESUMED — LET'S GO!");
}
function sendChangeReq(){
  const what=document.getElementById('cWhat').value.trim(), why=document.getElementById('cWhy').value.trim();
  closeModals(); if(!what){ showToast('ENTER WHAT TO WATCH'); return; }
  if(socket?.connected) socket.emit('req-change',{room:roomCode,user:getName(),what,why});
  reqMsg(`⇄ ${getName()} WANTS: "${what}"${why?' — '+why:''}`);
  document.getElementById('cWhat').value=''; document.getElementById('cWhy').value='';
}
// Using Giphy public beta key — free, no account needed for frontend
const GIPHY_KEY = 'nUxJk7gEBWYISAgTTp9B9uJJG9T22coE';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
let gifDebounce = null;
let currentGifCat = 'trending';

async function loadTrendingGifs(){
  const grid = document.getElementById('gifGrid');
  grid.innerHTML = '<div class="gif-loading">LOADING...</div>';
  try {
    const res = await fetch(`${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=20&rating=pg-13`);
    if(!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderGifs(data.data || []);
  } catch(e){
    renderGifsError();
  }
}

function setGifCat(cat, el){
  currentGifCat = cat;
  document.querySelectorAll('.gif-cat').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('gifSearch').value = '';
  if(cat === 'trending'){
    loadTrendingGifs();
  } else {
    searchGifsQuery(cat);
  }
}

async function searchGifsQuery(q){
  const grid = document.getElementById('gifGrid');
  grid.innerHTML = '<div class="gif-loading">LOADING...</div>';
  try {
    const res = await fetch(`${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`);
    if(!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderGifs(data.data || []);
  } catch(e){
    renderGifsError();
  }
}

async function searchGifs(q){
  clearTimeout(gifDebounce);
  if(!q.trim()){
    // Reset to current category
    if(currentGifCat === 'trending') loadTrendingGifs();
    else searchGifsQuery(currentGifCat);
    return;
  }
  gifDebounce = setTimeout(()=> searchGifsQuery(q), 400);
}

function renderGifs(results){
  const grid = document.getElementById('gifGrid');
  if(!results || !results.length){ grid.innerHTML='<div class="gif-loading">NO RESULTS FOUND</div>'; return; }
  grid.innerHTML = '';
  results.forEach(gif => {
    const url = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url || gif.images?.original?.url;
    if(!url) return;
    const item = document.createElement('div');
    item.className = 'gif-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = gif.title || 'GIF';
    img.loading = 'lazy';
    img.onerror = ()=>{ item.style.display='none'; };
    const overlay = document.createElement('div');
    overlay.className = 'gif-item-overlay';
    item.appendChild(img);
    item.appendChild(overlay);
    item.onclick = ()=> sendGif(url, gif.title || 'GIF');
    grid.appendChild(item);
  });
  if(!grid.children.length) grid.innerHTML='<div class="gif-loading">NO RESULTS FOUND</div>';
}

function renderGifsError(){
  document.getElementById('gifGrid').innerHTML='<div class="gif-loading" style="color:var(--red)">⚠ COULD NOT LOAD<br><span style="font-size:0.6rem;opacity:0.6;display:block;margin-top:4px">CHECK NETWORK</span></div>';
}

function toggleGifPicker(){
  const picker = document.getElementById('gifPicker');
  const isOpen = picker.classList.toggle('open');
  if(isOpen) loadTrendingGifs();
}

function sendGif(url, alt){
  const name = getName();
  const w = document.getElementById('msgs'), d = document.createElement('div');
  d.className = 'msg';
  const c = gc(name);
  d.innerHTML = `<div class="mt2"><span class="mn" style="color:${c};text-shadow:0 0 6px ${c}44">${name}</span><span class="mts">${ts()}</span></div><div class="mb"><img src="${url}" alt="${esc(alt)}" style="max-width:200px;border-radius:6px;display:block;margin-top:4px;border:1px solid var(--brd)"></div>`;
  w.appendChild(d); w.scrollTop = w.scrollHeight;
  document.getElementById('gifPicker').classList.remove('open');
  if(socket?.connected) socket.emit('send-gif', { room: roomCode, user: name, url });
}

// Close gif picker when clicking outside
document.addEventListener('click', e=>{
  const picker = document.getElementById('gifPicker');
  if(picker.classList.contains('open') && !picker.contains(e.target) && !e.target.closest('.gif-btn')){
    picker.classList.remove('open');
  }
});

// ══ CHAT ════════════════════════════════════════
const pal=['#c084fc','#93c5fd','#f472b6','#fbbf24','#4ade80','#fb923c'];
const cm={};
function gc(n){ if(!cm[n]) cm[n]=pal[Object.keys(cm).length%pal.length]; return cm[n]; }
function getName(){ return document.getElementById('ni').value.trim()||userName; }
function ts(){ const d=new Date(); return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function addMsg(n,t,cls=''){
  const w=document.getElementById('msgs'), d=document.createElement('div');
  d.className='msg '+(cls||'');
  if(cls){ d.innerHTML=`<div class="mb">${t}</div>`; }
  else{ const c=gc(n); d.innerHTML=`<div class="mt2"><span class="mn" style="color:${c};text-shadow:0 0 6px ${c}44">${n}</span><span class="mts">${ts()}</span></div><div class="mb">${esc(t)}</div>`; }
  w.appendChild(d); w.scrollTop=w.scrollHeight;
}
function sys(t){ addMsg('',t,'sys'); }
function reqMsg(t){ addMsg('',t,'req'); }

function send(){
  const i=document.getElementById('mi'), t=i.value.trim(); if(!t) return;
  addMsg(getName(),t); i.value='';
  if(socket?.connected) socket.emit('chat-msg', { room: roomCode, user: getName(), text: t });
}

function react(e){
  addMsg(getName(),e);
  const el=document.createElement('div'); el.className='fl'; el.textContent=e;
  el.style.cssText=`left:${20+Math.random()*40}vw;bottom:100px;`;
  document.body.appendChild(el); setTimeout(()=>el.remove(),2300);
  if(socket?.connected) socket.emit('react', { room: roomCode, user: getName(), emoji: e });
}

// ══ CAR SYSTEM ══════════════════════════════════
// Rules: max 1 car on screen at a time, new car spawns 5-15s after previous vanishes
// Cars go LTR or RTL randomly at realistic speed
const carColors = [
  {body:'#1a1a4a',roof:'#141430',head:'#fef3c7',tail:'#fca5a5'},
  {body:'#2a1a3a',roof:'#1e1228',head:'#fef3c7',tail:'#fca5a5'},
  {body:'#0f1a2a',roof:'#0a1220',head:'#fef9c3',tail:'#fc8181'},
  {body:'#1a2a1a',roof:'#122012',head:'#fefce8',tail:'#f87171'},
  {body:'#2a2a1a',roof:'#1e1e10',head:'#fef3c7',tail:'#fca5a5'},
];
let carActive = false;

function spawnCar() {
  if(carActive) return;
  carActive = true;
  const lane = document.getElementById('carLane');
  if(!lane) { carActive=false; return; }

  const ltr = Math.random() > 0.5; // left-to-right?
  const col = carColors[Math.floor(Math.random()*carColors.length)];
  const speed = 120 + Math.random()*80; // px/s
  const W = window.innerWidth;
  const carW = 52, carH = 16, roofW = 28, roofH = 9;

  const car = document.createElement('div');
  car.className = 'car';
  car.style.cssText = `bottom:4px;position:absolute;`;

  // Car body
  car.innerHTML = `
    <div class="car-body" style="width:${carW}px;height:${carH}px;background:${col.body};position:relative;">
      <div class="car-roof" style="width:${roofW}px;height:${roofH}px;background:${col.roof};top:${-roofH}px;left:${ltr?8:carW-roofW-8}px;"></div>
      <div class="car-wheel-l"></div>
      <div class="car-wheel-r"></div>
      <div class="car-light" style="background:${col.head};box-shadow:0 0 6px ${col.head},0 0 12px ${col.head}88;top:5px;${ltr?'right:-1px':'left:-1px'}"></div>
      <div class="car-light" style="background:${col.tail};box-shadow:0 0 5px ${col.tail};top:5px;${ltr?'left:-1px':'right:-1px'}"></div>
    </div>
    <div class="car-hglow" style="background:radial-gradient(ellipse,${col.head}88,transparent);width:40px;${ltr?'right:-36px':'left:-36px'};bottom:3px;position:absolute;height:8px;filter:blur(5px);opacity:0.5;"></div>
  `;

  // Start position
  const startX = ltr ? -carW - 10 : W + 10;
  car.style.left = startX + 'px';
  if(!ltr) car.style.transform = 'scaleX(-1)';
  lane.appendChild(car);

  const endX = ltr ? W + carW + 10 : -carW - 10;
  const duration = Math.abs(endX - startX) / speed * 1000;

  // Animate with requestAnimationFrame
  let start = null;
  function step(ts) {
    if(!start) start = ts;
    const elapsed = ts - start;
    const progress = Math.min(elapsed / duration, 1);
    const x = startX + (endX - startX) * progress;
    car.style.left = x + 'px';
    if(progress < 1) {
      requestAnimationFrame(step);
    } else {
      lane.removeChild(car);
      carActive = false;
      // Schedule next car: 5-15 seconds
      const nextDelay = 5000 + Math.random() * 10000;
      setTimeout(spawnCar, nextDelay);
    }
  }
  requestAnimationFrame(step);
}

// Start first car after 2-6 seconds
setTimeout(spawnCar, 2000 + Math.random() * 4000);

// ══ FULLSCREEN / CINEMA MODE ════════════════════
let fsOn = false;
function toggleFS(){
  fsOn = !fsOn;
  document.getElementById('mainApp').classList.toggle('fsmode', fsOn);
  document.getElementById('fsBtn').textContent = fsOn ? '✕ EXIT CINEMA' : '⛶ CINEMA';
}

// ══ MOBILE CHAT DRAWER ══════════════════════════
// Mirror messages into mobile drawer too
const origAddMsg = window.addMsg; // will sync below

function openMobChat(){
  document.getElementById('mobDrawer').classList.add('open');
  document.getElementById('mobScrim').classList.add('open');
  // Scroll to bottom
  const mm = document.getElementById('mobMsgs');
  setTimeout(()=>{ mm.scrollTop = mm.scrollHeight; }, 50);
}
function closeMobChat(){
  document.getElementById('mobDrawer').classList.remove('open');
  document.getElementById('mobScrim').classList.remove('open');
}
function sendMob(){
  const i = document.getElementById('mobMi');
  const t = i.value.trim(); if(!t) return;
  addMsg(getName(), t);
  i.value = '';
}

// Patch addMsg to also mirror into mobMsgs
(function(){
  const _orig = addMsg;
  window.addMsg = function(n, t, cls){
    _orig(n, t, cls);
    // Clone into mobile drawer
    const mm = document.getElementById('mobMsgs');
    if(!mm) return;
    const w = document.getElementById('msgs');
    // Copy last child from desktop msgs into mob
    const last = w.lastElementChild;
    if(last){
      const clone = last.cloneNode(true);
      mm.appendChild(clone);
      mm.scrollTop = mm.scrollHeight;
    }
  };
})();

function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
