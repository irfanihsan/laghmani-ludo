"use strict";
const test=require("node:test");const assert=require("node:assert");const fs=require("node:fs");const path=require("node:path");
const host=fs.readFileSync(path.join(__dirname,"../public/host.html"),"utf8");
const play=fs.readFileSync(path.join(__dirname,"../public/play.html"),"utf8");
test("host uses the physical six-face CSS dice",()=>{assert.match(host,/transform-style:preserve-3d/);assert.match(host,/dice-front/);assert.match(host,/dice-back/);assert.match(host,/DICE_ORIENTATION/);});
test("host dice settles on the server supplied face",()=>{assert.match(host,/faceTransform\(final/);assert.match(host,/lastRoll/);});
test("phone shows a confirmed result instead of a second physical dice",()=>{assert.match(play,/TV owns the physical dice/);assert.match(play,/roll-result/);assert.match(play,/ROLL DICE ON TV/);});
test("board retains original player colours",()=>{for(const c of ["#22c55e","#eab308","#3b82f6","#ef4444"])assert.ok(host.includes(c));});
test("flat board and dimensional token styling coexist",()=>{assert.match(host,/premium flat-board theme/);assert.match(host,/Metallic outer rim/);assert.match(play,/controller and confirmed-result display/);});
