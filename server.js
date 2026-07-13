"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1_000_000 });

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "rooms.json");
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 90_000);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 12 * 60 * 60 * 1000);
const COLOURS = new Set(["G", "Y", "B", "R"]);
const TURN_ORDER = ["Y", "B", "R", "G"];

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(express.json({ limit: "500kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/host", (req, res) => res.sendFile(path.join(__dirname, "public", "host.html")));
app.get("/play", (req, res) => res.sendFile(path.join(__dirname, "public", "play.html")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const TRACK = [
  {r:6,c:0},{r:6,c:1},{r:6,c:2},{r:6,c:3},{r:6,c:4},{r:6,c:5},
  {r:5,c:6},{r:4,c:6},{r:3,c:6},{r:2,c:6},{r:1,c:6},{r:0,c:6},{r:0,c:7},
  {r:0,c:8},{r:1,c:8},{r:2,c:8},{r:3,c:8},{r:4,c:8},{r:5,c:8},
  {r:6,c:9},{r:6,c:10},{r:6,c:11},{r:6,c:12},{r:6,c:13},{r:6,c:14},{r:7,c:14},
  {r:8,c:14},{r:8,c:13},{r:8,c:12},{r:8,c:11},{r:8,c:10},{r:8,c:9},
  {r:9,c:8},{r:10,c:8},{r:11,c:8},{r:12,c:8},{r:13,c:8},{r:14,c:8},{r:14,c:7},
  {r:14,c:6},{r:13,c:6},{r:12,c:6},{r:11,c:6},{r:10,c:6},{r:9,c:6},
  {r:8,c:5},{r:8,c:4},{r:8,c:3},{r:8,c:2},{r:8,c:1},{r:8,c:0},{r:7,c:0},
];

const PLAYER_DEFS = [
  {key:"G",name:"Green",color:"#22c55e",startIndex:1,stopAbsIndex:48,lane:[{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}],finishCell:{r:7,c:6},yardRect:{r0:0,c0:0,r1:5,c1:5},yardHomes:[{r:1,c:1},{r:1,c:3},{r:3,c:1},{r:3,c:3}]},
  {key:"Y",name:"Yellow",color:"#eab308",startIndex:14,stopAbsIndex:9,lane:[{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7},{r:5,c:7}],finishCell:{r:6,c:7},yardRect:{r0:0,c0:9,r1:5,c1:14},yardHomes:[{r:1,c:10},{r:1,c:12},{r:3,c:10},{r:3,c:12}]},
  {key:"B",name:"Blue",color:"#3b82f6",startIndex:27,stopAbsIndex:22,lane:[{r:7,c:13},{r:7,c:12},{r:7,c:11},{r:7,c:10},{r:7,c:9}],finishCell:{r:7,c:8},yardRect:{r0:9,c0:9,r1:14,c1:14},yardHomes:[{r:10,c:10},{r:10,c:12},{r:12,c:10},{r:12,c:12}]},
  {key:"R",name:"Red",color:"#ef4444",startIndex:40,stopAbsIndex:35,lane:[{r:13,c:7},{r:12,c:7},{r:11,c:7},{r:10,c:7},{r:9,c:7}],finishCell:{r:8,c:7},yardRect:{r0:9,c0:0,r1:14,c1:5},yardHomes:[{r:10,c:1},{r:10,c:3},{r:12,c:1},{r:12,c:3}]},
];

const rooms = new Map();
const turnTimers = new Map();
let persistTimer = null;

function now(){ return Date.now(); }
function token(bytes=24){ return crypto.randomBytes(bytes).toString("base64url"); }
function rollDie(){ return crypto.randomInt(1, 7); }
function deepClone(value){ return JSON.parse(JSON.stringify(value)); }
function cleanName(value){ return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 24); }
function addLog(gs, msg){ gs.log.unshift(msg); if(gs.log.length > 80) gs.log.length = 80; }
function touch(room){ room.updatedAt = now(); schedulePersist(); }
function defByKey(key){ return PLAYER_DEFS.find(d => d.key === key); }
function pdef(pi, players){ return defByKey(players[pi]?.key); }
function absIdx(pi, step, players){ return (pdef(pi, players).startIndex + step) % 52; }
function buildSafeSet(){ return new Set(PLAYER_DEFS.flatMap(d => [d.startIndex, d.stopAbsIndex])); }
function makeCode(){ let c; do { c = String(crypto.randomInt(1000, 10000)); } while (rooms.has(c)); return c; }
function colourRank(c){ const i = TURN_ORDER.indexOf(c); return i < 0 ? 99 : i; }
function activePlayerCount(gs){ return gs.players.filter(p => !p.forfeited).length; }
function isDone(gs, pi){ return gs.stats[pi].finished === 4 || gs.players[pi].forfeited; }

function freshRoom(code){
  return { code, hostSocketId:null, hostToken:token(), phase:"lobby", players:[], game:null, settings:{animationSpeed:2}, createdAt:now(), updatedAt:now(), hostDisconnectedAt:null };
}

function serialisableRoom(room){
  const copy = deepClone(room);
  copy.hostSocketId = null;
  copy.hostDisconnectedAt = copy.hostDisconnectedAt || null;
  for(const p of copy.players){ p.socketId = null; p.connected = false; p.disconnectDeadline = null; }
  if(copy.game){ copy.game.undoStack = (copy.game.undoStack || []).slice(-10); }
  return copy;
}

function schedulePersist(){
  clearTimeout(persistTimer);
  persistTimer = setTimeout(saveRooms, 120);
}
function saveRooms(){
  try{
    fs.mkdirSync(DATA_DIR, { recursive:true });
    const temp = DATA_FILE + ".tmp";
    const payload = JSON.stringify({ version:2, savedAt:now(), rooms:[...rooms.values()].map(serialisableRoom) });
    fs.writeFileSync(temp, payload);
    fs.renameSync(temp, DATA_FILE);
  }catch(err){ console.error("Persistence save failed:", err.message); }
}
function loadRooms(){
  try{
    if(!fs.existsSync(DATA_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    for(const room of parsed.rooms || []){
      if(!room?.code || now() - (room.updatedAt || 0) > ROOM_TTL_MS) continue;
      room.hostSocketId = null;
      room.hostDisconnectedAt = now();
      room.players ||= [];
      room.settings ||= {animationSpeed:2};
      for(const p of room.players){ p.socketId=null; p.connected=false; p.forfeited=!!p.forfeited; }
      rooms.set(room.code, room);
    }
    console.log(`Restored ${rooms.size} room(s) from ${DATA_FILE}`);
  }catch(err){ console.error("Persistence load failed:", err.message); }
}
loadRooms();

function gameSnapshot(gs){
  const copy = deepClone(gs);
  copy.undoStack = [];
  copy.turnChainSnapshot = null;
  return copy;
}
function pushUndo(gs){
  gs.undoStack.push(gameSnapshot(gs));
  if(gs.undoStack.length > 10) gs.undoStack.shift();
}
function gameEvent(gs, event){
  gs.eventSeq = (gs.eventSeq || 0) + 1;
  gs.lastEvent = { id:`${gs.actionNumber || 0}-${gs.eventSeq}-${now()}`, ...event };
  return gs.lastEvent;
}

function initGame(room){
  const ordered = room.players
    .filter(p => !p.forfeited)
    .slice()
    .sort((a,b) => colourRank(a.colour) - colourRank(b.colour));

  const players = ordered.map(p => {
    const def = defByKey(p.colour);
    return { id:p.id, key:def.key, displayName:p.name, color:def.color, startIndex:def.startIndex, avatar:p.avatar || null, forfeited:false };
  });
  const tokens=[];
  players.forEach((p, pi) => ["A","B","C","D"].forEach(label => tokens.push({
    id:`${p.id}_${label}`, playerIndex:pi, label, state:"home", step:0, finishSlot:null,
  })));
  const stats = players.map(() => ({ sixes:0, rolls:0, kills:0, deaths:0, finished:0, hasCaptured:false, openingUsed:false }));
  return {
    phase:"await_roll", players, tokens, stats, current:0, dice:null, lastDice:null,
    movableTokenIds:[], sixStreak:0, turnLockedTokens:[], turnChainSnapshot:null,
    undoStack:[], winnerOrder:[], openingBoostPending:false, openingBoostChoice:false,
    log:[], lastEvent:null, lastRoll:null, actionNumber:0, turnId:1, eventSeq:0,
  };
}

function roomPlayerForGame(room, pi){
  const id = room.game?.players?.[pi]?.id;
  return room.players.find(p => p.id === id);
}
function gameIndexForSocket(room, socket){
  const seat = room.players.find(p => p.socketId === socket.id && p.connected && !p.forfeited);
  if(!seat || !room.game) return -1;
  return room.game.players.findIndex(p => p.id === seat.id);
}

function isLegal(t, die, gs){
  if(t.playerIndex !== gs.current || die == null || t.state === "finish") return false;
  const eligible = gs.stats[t.playerIndex].hasCaptured;
  if(t.state === "home") return die === 6;
  if(t.state === "track"){
    if(!eligible) return true;
    const total=t.step+die;
    return total <= 51 || total - 52 <= 5;
  }
  if(t.state === "lane") return t.step + die <= 5;
  return false;
}
function computeMovable(gs){
  if(gs.dice == null) return [];
  const legal=gs.tokens.filter(t => isLegal(t, gs.dice, gs)).map(t => t.id);
  if(gs.turnLockedTokens.length){
    const unlocked=legal.filter(id => !gs.turnLockedTokens.includes(id));
    return unlocked.length ? unlocked : legal;
  }
  return legal;
}
function opponentsAt(destAbs, myPi, gs){
  return gs.tokens.filter(t => t.playerIndex !== myPi && t.state === "track" && absIdx(t.playerIndex,t.step,gs.players) === destAbs);
}
function planMove(t, die, gs){
  const pi=t.playerIndex, safe=buildSafeSet(), eligible=gs.stats[pi].hasCaptured;
  if(t.state === "home") return {newState:"track",newStep:0,captured:[],finishesToken:false};
  if(t.state === "track"){
    const total=t.step+die;
    if(!eligible || total <= 51){
      const newStep=eligible ? total : total%52;
      const dest=absIdx(pi,newStep,gs.players);
      return {newState:"track",newStep,captured:safe.has(dest)?[]:opponentsAt(dest,pi,gs),finishesToken:false};
    }
    const laneIdx=total-52;
    return laneIdx===5 ? {newState:"finish",newStep:5,captured:[],finishesToken:true} : {newState:"lane",newStep:laneIdx,captured:[],finishesToken:false};
  }
  if(t.state === "lane"){
    const target=t.step+die;
    return target===5 ? {newState:"finish",newStep:5,captured:[],finishesToken:true} : {newState:"lane",newStep:target,captured:[],finishesToken:false};
  }
  return {newState:t.state,newStep:t.step,captured:[],finishesToken:false};
}
function nextFinishSlot(gs, pi){
  const used=new Set(gs.tokens.filter(t => t.playerIndex===pi && t.state==="finish").map(t=>t.finishSlot).filter(Number.isInteger));
  for(let i=0;i<4;i++) if(!used.has(i)) return i;
  return 0;
}

function finishGameIfResolved(gs){
  const active=gs.players.map((p,i)=>({p,i})).filter(x=>!x.p.forfeited);
  if(active.length===1 && gs.players.length>1){
    const sole=active[0].i;
    if(!gs.winnerOrder.includes(sole)) gs.winnerOrder.unshift(sole);
    gs.phase="finished";
    gameEvent(gs,{type:"game_finished",winner:sole,loser:null});
    addLog(gs,`🏆 ${gs.players[sole].displayName} wins by forfeit.`);
    return true;
  }
  const unfinished=active.filter(x=>gs.stats[x.i].finished<4 && !gs.winnerOrder.includes(x.i));
  if(active.length >= 2 && unfinished.length === 1 && gs.winnerOrder.length >= 1){
    gs.winnerOrder.push(unfinished[0].i);
    addLog(gs, `☠️ ${gs.players[unfinished[0].i].displayName} finishes in last place.`);
    gs.phase="finished";
    gameEvent(gs,{type:"game_finished",winner:gs.winnerOrder[0],loser:unfinished[0].i});
    return true;
  }
  if(active.length && gs.winnerOrder.length >= active.length){ gs.phase="finished"; return true; }
  return false;
}

function applyMove(gs, tokenId){
  const t=gs.tokens.find(x=>x.id===tokenId);
  if(!t) throw new Error("Token not found");
  const die=gs.dice, pi=t.playerIndex, pName=gs.players[pi].displayName, plan=planMove(t,die,gs);
  const from={state:t.state,step:t.step,finishSlot:t.finishSlot};
  const capturedIds=plan.captured.map(v=>v.id);
  t.state=plan.newState; t.step=plan.newStep;
  if(plan.finishesToken) t.finishSlot=nextFinishSlot(gs,pi);
  let capturedCount=0;
  for(const victim of plan.captured){
    victim.state="home"; victim.step=0; victim.finishSlot=null;
    gs.stats[pi].kills++; gs.stats[victim.playerIndex].deaths++; capturedCount++;
  }
  if(capturedCount){ gs.stats[pi].hasCaptured=true; if(!gs.turnLockedTokens.includes(tokenId)) gs.turnLockedTokens.push(tokenId); }
  for(let i=0;i<gs.players.length;i++) gs.stats[i].finished=gs.tokens.filter(x=>x.playerIndex===i&&x.state==="finish").length;
  let wonNow=false;
  if(gs.stats[pi].finished===4 && !gs.winnerOrder.includes(pi)){ gs.winnerOrder.push(pi); wonNow=true; }
  let msg=plan.finishesToken?`🏁 ${pName} finished token ${t.label}!`:capturedCount?`💥 ${pName} captured ${capturedCount} token(s)! Bonus roll.`:(t.state==="track"&&plan.newStep===0)?`${pName} brought out ${t.label}.`:`${pName} moved ${t.label} by ${die}.`;
  gameEvent(gs, capturedCount?{type:"capture",playerIndex:pi,count:capturedCount,tokenId,die,from,to:{state:t.state,step:t.step,finishSlot:t.finishSlot},capturedTokenIds:capturedIds}:plan.finishesToken?{type:"finish_token",playerIndex:pi,tokenId,die,from,to:{state:t.state,step:t.step,finishSlot:t.finishSlot}}:{type:"move",playerIndex:pi,tokenId,die,from,to:{state:t.state,step:t.step,finishSlot:t.finishSlot}});
  if(wonNow){
    const rank=gs.winnerOrder.length;
    msg += rank===1?` 🏆 ${pName} WINS the game!`:` ${pName} finished #${rank}.`;
    gameEvent(gs,{type:"placement",playerIndex:pi,rank,tokenId,finishSlot:t.finishSlot});
  }
  const keepTurn=die===6||capturedCount>0||plan.finishesToken;
  gs.dice=null; gs.movableTokenIds=[];
  if(wonNow){
    if(!finishGameIfResolved(gs)){ gs.phase="await_roll"; advanceTurn(gs); }
  }else if(!keepTurn){ gs.phase="await_roll"; advanceTurn(gs); }
  else gs.phase="await_roll";
  return {logMsg:msg,capturedCount,finishedToken:plan.finishesToken,wonNow};
}

function advanceTurn(gs){
  gs.turnLockedTokens=[]; gs.sixStreak=0; gs.turnChainSnapshot=null;
  const n=gs.players.length;
  for(let offset=1;offset<=n;offset++){
    const next=(gs.current+offset)%n;
    if(!isDone(gs,next)){ gs.current=next; gs.turnId=(gs.turnId||0)+1; return; }
  }
  gs.phase="finished";
}
function skipCurrentTurn(room, reason){
  const gs=room.game; if(!gs || gs.phase==="finished") return;
  const name=gs.players[gs.current]?.displayName || "Player";
  addLog(gs, `⏭️ ${name}'s turn was skipped${reason?` (${reason})`:""}.`);
  gs.dice=null; gs.movableTokenIds=[]; gs.phase="await_roll"; gs.openingBoostChoice=false; gs.openingBoostPending=false;
  advanceTurn(gs); syncRoomPhase(room); touch(room); emitState(room); scheduleTurnTimer(room);
}
function syncRoomPhase(room){ if(room.game?.phase==="finished") room.phase="finished"; }

function publicState(room){
  const gs=room.game, winnerRanks={};
  if(gs) gs.winnerOrder.forEach((pi,i)=>winnerRanks[pi]=i+1);
  return {
    code:room.code, phase:room.phase,
    settings:{mandatoryCapture:true,openingBoost:true,threeSixesFoul:true,captureBonus:true,finishBonus:true,exactFinish:true,turnOrder:"Y-B-R-G",turnTimeoutSeconds:Math.round(TURN_TIMEOUT_MS/1000),animationSpeed:Number(room.settings?.animationSpeed||2)},
    players:room.players.map(p=>({id:p.id,name:p.name,colour:p.colour,connected:!!p.connected,avatar:p.avatar||null,hasAvatar:!!p.avatar,forfeited:!!p.forfeited,disconnectDeadline:p.disconnectDeadline||null})),
    game:gs?{phase:gs.phase,players:gs.players,tokens:gs.tokens,stats:gs.stats,current:gs.current,dice:gs.dice,lastDice:gs.lastDice,movableTokenIds:gs.movableTokenIds,winnerOrder:gs.winnerOrder,winners:gs.winnerOrder,winnerRanks,openingBoostPending:gs.openingBoostPending,openingBoostChoice:gs.openingBoostChoice,log:gs.log.slice(0,30),lastEvent:gs.lastEvent,lastRoll:gs.lastRoll,actionNumber:gs.actionNumber,turnId:gs.turnId}:null,
    playerDefs:PLAYER_DEFS.map(d=>({...d})), track:TRACK,
  };
}
function emitState(room){ syncRoomPhase(room); io.to(room.code).emit("state:update", publicState(room)); }

function scheduleTurnTimer(room){
  clearTimeout(turnTimers.get(room.code)); turnTimers.delete(room.code);
  if(room.phase!=="playing" || !room.game || room.game.phase==="finished") return;
  const seat=roomPlayerForGame(room,room.game.current);
  if(!seat || seat.connected) return;
  seat.disconnectDeadline=now()+TURN_TIMEOUT_MS;
  const timer=setTimeout(()=>{
    const currentRoom=rooms.get(room.code); if(!currentRoom?.game) return;
    const currentSeat=roomPlayerForGame(currentRoom,currentRoom.game.current);
    if(currentSeat && !currentSeat.connected) skipCurrentTurn(currentRoom,"player disconnected");
  },TURN_TIMEOUT_MS);
  turnTimers.set(room.code,timer); touch(room); emitState(room);
}

function requireHost(room,socket,hostToken){ return !!room && room.hostSocketId===socket.id && safeTokenEqual(room.hostToken,hostToken); }
function safeTokenEqual(a,b){
  const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function validateAvatar(value){
  if(typeof value!=="string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(value)) return false;
  const base=value.slice(value.indexOf(",")+1);
  return base.length<=450_000 && Buffer.byteLength(base,"base64")<=330_000;
}

const httpRate = new Map();
function limited(key,max,windowMs){
  const t=now(), rec=httpRate.get(key);
  if(!rec||t-rec.start>windowMs){httpRate.set(key,{start:t,count:1});return false;}
  rec.count++; return rec.count>max;
}
app.post("/avatar",(req,res)=>{
  if(limited(`avatar:${req.ip}`,15,60_000)) return res.status(429).json({ok:false,msg:"Too many uploads"});
  const {code,playerId,playerToken,avatar}=req.body||{};
  const room=rooms.get(String(code||"")); if(!room) return res.status(404).json({ok:false,msg:"Room not found"});
  const p=room.players.find(x=>x.id===playerId); if(!p||!safeTokenEqual(p.playerToken,playerToken)) return res.status(403).json({ok:false,msg:"Not authorised"});
  if(!validateAvatar(avatar)) return res.status(400).json({ok:false,msg:"Invalid or oversized image"});
  p.avatar=avatar;
  if(room.game){ const gp=room.game.players.find(x=>x.id===p.id); if(gp) gp.avatar=avatar; }
  touch(room); emitState(room); res.json({ok:true});
});

io.on("connection",socket=>{
  const eventTimes=[];
  socket.use((packet,next)=>{
    const t=now(); while(eventTimes.length&&t-eventTimes[0]>10_000) eventTimes.shift();
    if(eventTimes.length>=80) return next(new Error("Rate limit"));
    eventTimes.push(t); next();
  });

  socket.on("host:create",(_data,cb)=>{
    const code=makeCode(),room=freshRoom(code); room.hostSocketId=socket.id; rooms.set(code,room);
    socket.join(code); socket.data.roomCode=code; socket.data.isHost=true;
    touch(room); cb?.({ok:true,code,hostToken:room.hostToken,state:publicState(room)});
  });
  socket.on("host:rejoin",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||""));
    if(!room||!safeTokenEqual(room.hostToken,hostToken)) return cb?.({ok:false,msg:"Room or host key invalid"});
    room.hostSocketId=socket.id; room.hostDisconnectedAt=null; socket.join(room.code); socket.data.roomCode=room.code; socket.data.isHost=true;
    touch(room); emitState(room); cb?.({ok:true,hostToken:room.hostToken,state:publicState(room)});
  });
  socket.on("host:start",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    const eligible=room.players.filter(p=>!p.forfeited);
    if(room.phase!=="lobby") return cb?.({ok:false,msg:"Game already started"});
    if(eligible.length<2) return cb?.({ok:false,msg:"Need at least 2 players"});
    room.phase="playing"; room.game=initGame(room);
    const first=room.game.players[0]; addLog(room.game,`Game started! ${first.displayName} (${defByKey(first.key).name}) goes first.`);
    gameEvent(room.game,{type:"game_started",playerIndex:0}); touch(room); emitState(room); scheduleTurnTimer(room); cb?.({ok:true});
  });
  socket.on("host:restart",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    const available=room.players.filter(p=>!p.forfeited);
    if(available.length<2) return cb?.({ok:false,msg:"Need at least 2 active players"});
    room.phase="playing"; room.game=initGame(room); addLog(room.game,"Game restarted."); touch(room); emitState(room); scheduleTurnTimer(room); cb?.({ok:true});
  });
  socket.on("host:lobby",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    room.phase="lobby"; room.game=null; room.players=room.players.filter(p=>!p.forfeited); clearTimeout(turnTimers.get(room.code));
    touch(room); emitState(room); cb?.({ok:true});
  });
  socket.on("host:kick",({code,hostToken,playerId}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    const idx=room.players.findIndex(p=>p.id===playerId); if(idx<0) return cb?.({ok:false,msg:"Player not found"});
    const p=room.players[idx]; io.to(p.socketId||"").emit("kicked");
    if(room.phase==="lobby"){ room.players.splice(idx,1); }
    else{
      p.forfeited=true; p.connected=false; p.socketId=null;
      const pi=room.game?.players.findIndex(x=>x.id===p.id)??-1;
      if(pi>=0){ room.game.players[pi].forfeited=true; addLog(room.game,`${p.name} forfeited and was removed.`); if(room.game.current===pi) advanceTurn(room.game); finishGameIfResolved(room.game); }
    }
    touch(room); emitState(room); scheduleTurnTimer(room); cb?.({ok:true});
  });
  socket.on("host:skip",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    if(!room.game||room.phase!=="playing") return cb?.({ok:false,msg:"No active turn"});
    skipCurrentTurn(room,"host skipped"); cb?.({ok:true});
  });
  socket.on("host:setSpeed",({code,hostToken,level}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    level=Number(level); if(![1,2,3,4].includes(level)) return cb?.({ok:false,msg:"Invalid speed level"});
    room.settings ||= {}; room.settings.animationSpeed=level; touch(room); emitState(room); cb?.({ok:true});
  });
  socket.on("host:undo",({code,hostToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!requireHost(room,socket,hostToken)) return cb?.({ok:false,msg:"Host authorisation failed"});
    const gs=room.game; if(!gs?.undoStack?.length) return cb?.({ok:false,msg:"Nothing to undo"});
    const prev=gs.undoStack.pop(),stack=gs.undoStack; Object.assign(gs,prev,{undoStack:stack}); room.phase="playing"; addLog(gs,"⏪ Last roll undone.");
    touch(room); emitState(room); scheduleTurnTimer(room); cb?.({ok:true});
  });

  socket.on("player:preview",({code}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!room) return cb?.({ok:false,msg:"Room not found"});
    cb?.({ok:true,phase:room.phase,taken:room.players.filter(p=>!p.forfeited).map(p=>p.colour)});
  });
  socket.on("player:join",({code,name,colour}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!room) return cb?.({ok:false,msg:"Room not found"});
    if(room.phase!=="lobby") return cb?.({ok:false,msg:"This game has already started"});
    colour=String(colour||"").toUpperCase(); name=cleanName(name);
    if(!COLOURS.has(colour)) return cb?.({ok:false,msg:"Invalid colour"});
    if(!name) return cb?.({ok:false,msg:"Enter your name"});
    if(room.players.filter(p=>!p.forfeited).length>=4) return cb?.({ok:false,msg:"Room full"});
    if(room.players.some(p=>!p.forfeited&&p.colour===colour)) return cb?.({ok:false,msg:"Colour taken"});
    const p={id:token(12),playerToken:token(),name,colour,socketId:socket.id,connected:true,avatar:null,forfeited:false,joinedAt:now(),disconnectDeadline:null};
    room.players.push(p); socket.join(room.code); socket.data.roomCode=room.code; socket.data.playerId=p.id;
    touch(room); emitState(room); cb?.({ok:true,playerId:p.id,playerToken:p.playerToken,state:publicState(room)});
  });
  socket.on("player:rejoin",({code,playerId,playerToken}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!room) return cb?.({ok:false,msg:"Room not found"});
    const p=room.players.find(x=>x.id===playerId);
    if(!p||p.forfeited||!safeTokenEqual(p.playerToken,playerToken)) return cb?.({ok:false,msg:"Session is no longer valid"});
    p.socketId=socket.id;p.connected=true;p.disconnectDeadline=null;socket.join(room.code);socket.data.roomCode=room.code;socket.data.playerId=p.id;
    touch(room);emitState(room);scheduleTurnTimer(room);cb?.({ok:true,playerId:p.id,playerToken:p.playerToken,state:publicState(room)});
  });

  socket.on("player:roll",({code}={},cb)=>{
    const room=rooms.get(String(code||"")); if(!room||room.phase!=="playing") return cb?.({ok:false,msg:"No active game"});
    const gs=room.game; if(!gs||gs.phase!=="await_roll") return cb?.({ok:false,msg:"It is not time to roll"});
    const pi=gameIndexForSocket(room,socket); if(pi!==gs.current) return cb?.({ok:false,msg:"It is not your turn"});
    pushUndo(gs); if(gs.sixStreak===0) gs.turnChainSnapshot=gameSnapshot(gs);
    const face=rollDie(); gs.dice=face;gs.lastDice=face;gs.stats[pi].rolls++;gs.actionNumber++;gs.lastRoll={id:gs.actionNumber,playerIndex:pi,faces:[face],finalFace:face,at:now()};
    if(face===6){gs.sixStreak++;gs.stats[pi].sixes++;}else gs.sixStreak=0;
    const pName=gs.players[pi].displayName;
    if(gs.sixStreak>=3){
      const chain=gs.turnChainSnapshot,savedUndo=gs.undoStack,rolls=gs.stats[pi].rolls,sixes=gs.stats[pi].sixes;
      Object.assign(gs,chain,{undoStack:savedUndo,turnChainSnapshot:null}); gs.stats[pi].rolls=rolls;gs.stats[pi].sixes=sixes;
      addLog(gs,`🚨 ${pName} rolled three 6s — foul. The whole turn chain was undone.`);gameEvent(gs,{type:"foul",playerIndex:pi});advanceTurn(gs);
      touch(room);emitState(room);scheduleTurnTimer(room);return cb?.({ok:true,face,foul:true});
    }
    if(face===6&&!gs.stats[pi].openingUsed&&gs.tokens.filter(t=>t.playerIndex===pi).every(t=>t.state==="home")){
      const bonus=rollDie();gs.stats[pi].openingUsed=true;gs.stats[pi].rolls++;gs.lastDice=bonus;gs.lastRoll={id:gs.actionNumber,playerIndex:pi,faces:[face,bonus],finalFace:bonus,at:now(),openingBoost:true};
      if(bonus===6){gs.sixStreak++;gs.stats[pi].sixes++;}else gs.sixStreak=0;
      addLog(gs,`⚡ ${pName} opening boost: 6 then ${bonus}.`);
      if(gs.sixStreak>=3){
        const chain=gs.turnChainSnapshot,savedUndo=gs.undoStack,rolls=gs.stats[pi].rolls,sixes=gs.stats[pi].sixes;
        Object.assign(gs,chain,{undoStack:savedUndo,turnChainSnapshot:null});gs.stats[pi].rolls=rolls;gs.stats[pi].sixes=sixes;
        addLog(gs,`🚨 ${pName} opening boost caused three 6s — foul. Turn chain undone.`);gameEvent(gs,{type:"foul",playerIndex:pi});advanceTurn(gs);
      }else if(bonus>=1&&bonus<=4){
        const home=gs.tokens.filter(t=>t.playerIndex===pi&&t.state==="home"),placed=home.slice(0,bonus);placed.forEach(t=>{t.state="track";t.step=0;});
        gs.dice=bonus;const result=applyMove(gs,placed[0].id);if(result.logMsg)addLog(gs,result.logMsg);addLog(gs,`${pName} automatically brought out ${placed.length} token(s).`);
      }else if(bonus===5){
        const t=gs.tokens.find(x=>x.playerIndex===pi&&x.state==="home");t.state="track";t.step=0;gs.dice=5;const result=applyMove(gs,t.id);if(result.logMsg)addLog(gs,result.logMsg);
      }else{
        gs.openingBoostPending=true;gs.openingBoostChoice=true;gs.dice=6;gs.phase="await_opening_choice";addLog(gs,`${pName} must choose opening Option A or B.`);
      }
      touch(room);emitState(room);scheduleTurnTimer(room);return cb?.({ok:true,face,openingBoost:true,bonus});
    }
    addLog(gs,`${pName} rolled ${face}.`);gs.movableTokenIds=computeMovable(gs);
    if(!gs.movableTokenIds.length){addLog(gs,`${pName} has no legal move — turn skipped.`);gs.dice=null;advanceTurn(gs);touch(room);emitState(room);scheduleTurnTimer(room);return cb?.({ok:true,face,noMoves:true});}
    gs.phase="await_token";
    if(gs.movableTokenIds.length===1){const result=applyMove(gs,gs.movableTokenIds[0]);if(result.logMsg)addLog(gs,result.logMsg);}
    touch(room);emitState(room);scheduleTurnTimer(room);cb?.({ok:true,face});
  });

  socket.on("player:openingChoice",({code,option}={},cb)=>{
    const room=rooms.get(String(code||""));if(!room||room.phase!=="playing")return cb?.({ok:false,msg:"No active game"});
    const gs=room.game,pi=gameIndexForSocket(room,socket);if(!gs||gs.phase!=="await_opening_choice"||pi!==gs.current)return cb?.({ok:false,msg:"Opening choice not available"});
    if(option!=="A"&&option!=="B")return cb?.({ok:false,msg:"Invalid opening option"});
    const pName=gs.players[pi].displayName,home=gs.tokens.filter(t=>t.playerIndex===pi&&t.state==="home");gs.openingBoostPending=false;gs.openingBoostChoice=false;
    if(option==="A"){
      const placed=home.slice(0,2);placed.forEach(t=>{t.state="track";t.step=0;});gs.dice=null;gs.phase="await_roll";addLog(gs,`${pName} chose Option A: ${placed.length} token(s) out, then rolls again.`);
    }else{
      const t=home[0];t.state="track";t.step=0;gs.dice=6;const result=applyMove(gs,t.id);if(result.logMsg)addLog(gs,result.logMsg);if(gs.phase!=="finished"){gs.current=pi;gs.phase="await_roll";}addLog(gs,`${pName} chose Option B and rolls again.`);
    }
    touch(room);emitState(room);scheduleTurnTimer(room);cb?.({ok:true});
  });

  socket.on("player:move",({code,tokenId}={},cb)=>{
    const room=rooms.get(String(code||""));if(!room||room.phase!=="playing")return cb?.({ok:false,msg:"No active game"});
    const gs=room.game,pi=gameIndexForSocket(room,socket);if(!gs||gs.phase!=="await_token")return cb?.({ok:false,msg:"It is not time to select a token"});
    if(pi!==gs.current)return cb?.({ok:false,msg:"It is not your turn"});if(!gs.movableTokenIds.includes(tokenId))return cb?.({ok:false,msg:"That token cannot move"});
    const result=applyMove(gs,tokenId);if(result.logMsg)addLog(gs,result.logMsg);touch(room);emitState(room);scheduleTurnTimer(room);cb?.({ok:true});
  });

  socket.on("disconnect",()=>{
    const code=socket.data?.roomCode,room=rooms.get(code);if(!room)return;
    if(socket.data.isHost&&room.hostSocketId===socket.id){room.hostSocketId=null;room.hostDisconnectedAt=now();}
    const p=room.players.find(x=>x.socketId===socket.id);if(p){p.connected=false;p.socketId=null;p.disconnectDeadline=now()+TURN_TIMEOUT_MS;}
    touch(room);emitState(room);scheduleTurnTimer(room);
  });
});

setInterval(()=>{
  const cutoff=now()-ROOM_TTL_MS;
  for(const [code,room] of rooms){
    const noConnected=!room.hostSocketId&&!room.players.some(p=>p.connected);
    if(noConnected&&(room.updatedAt||0)<cutoff){clearTimeout(turnTimers.get(code));turnTimers.delete(code);rooms.delete(code);}
  }
  schedulePersist();
},60*60*1000).unref();

process.on("SIGTERM",()=>{saveRooms();server.close(()=>process.exit(0));});
process.on("SIGINT",()=>{saveRooms();server.close(()=>process.exit(0));});
server.listen(PORT,()=>console.log(`Ludo server running on http://localhost:${PORT}`));
