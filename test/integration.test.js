"use strict";
const assert = require("assert");
const { spawn } = require("child_process");
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = 3217;
const dataDir = path.join(root, ".test-data");
fs.rmSync(dataDir, { recursive:true, force:true });
const child = spawn(process.execPath, ["server.js"], {
  cwd:root,
  env:{...process.env, PORT:String(port), DATA_DIR:dataDir, TURN_TIMEOUT_MS:"1000"},
  stdio:["ignore","pipe","pipe"]
});

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function connect(){ return io(`http://127.0.0.1:${port}`, { transports:["websocket"], reconnection:false }); }
function emit(socket,event,data){ return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`Timeout: ${event}`)),3000);
  socket.emit(event,data,res=>{clearTimeout(timer);resolve(res);});
}); }
async function ready(){
  for(let i=0;i<40;i++){
    try{ const r=await fetch(`http://127.0.0.1:${port}/health`); if(r.ok)return; }catch{}
    await wait(100);
  }
  throw new Error("Server did not start");
}

(async()=>{
  const sockets=[];
  try{
    await ready();
    assert.equal((await fetch(`http://127.0.0.1:${port}/host`)).status,200);
    const host=connect(); sockets.push(host); await new Promise(r=>host.on("connect",r));
    const created=await emit(host,"host:create",{}); assert(created.ok&&created.hostToken&&created.code);
    const p1=connect(),p2=connect();sockets.push(p1,p2);await Promise.all([new Promise(r=>p1.on("connect",r)),new Promise(r=>p2.on("connect",r))]);
    const j1=await emit(p1,"player:join",{code:created.code,name:"Green first join",colour:"G"});
    const j2=await emit(p2,"player:join",{code:created.code,name:"Yellow second join",colour:"Y"});
    assert(j1.ok&&j1.playerToken);assert(j2.ok&&j2.playerToken);
    const badStart=await emit(host,"host:start",{code:created.code,hostToken:"wrong"});assert.equal(badStart.ok,false);
    const started=await emit(host,"host:start",{code:created.code,hostToken:created.hostToken});assert(started.ok);
    const rejoinedHost=await emit(host,"host:rejoin",{code:created.code,hostToken:created.hostToken});
    assert.equal(rejoinedHost.state.game.players[0].key,"Y","Turn order must begin with Yellow when present");
    const p3=connect();sockets.push(p3);await new Promise(r=>p3.on("connect",r));
    const late=await emit(p3,"player:join",{code:created.code,name:"Late",colour:"B"});assert.equal(late.ok,false);
    const rejoinBad=await emit(p3,"player:rejoin",{code:created.code,playerId:j1.playerId,playerToken:"bad"});assert.equal(rejoinBad.ok,false);
    const undoEmpty=await emit(host,"host:undo",{code:created.code,hostToken:created.hostToken});assert.equal(undoEmpty.ok,false);
    console.log("Integration checks passed");
  } finally {
    for(const s of sockets)s.close();
    child.kill("SIGTERM");
    await wait(150);
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);child.kill("SIGTERM");process.exitCode=1;});
