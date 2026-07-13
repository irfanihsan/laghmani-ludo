"use strict";
const test=require("node:test");const assert=require("node:assert");const fs=require("node:fs");const path=require("node:path");
const host=fs.readFileSync(path.join(__dirname,"../public/host.html"),"utf8");
const play=fs.readFileSync(path.join(__dirname,"../public/play.html"),"utf8");
test("host and phone use physical six-face CSS dice",()=>{for(const s of [host,play]){assert.match(s,/transform-style:preserve-3d/);assert.match(s,/dice-front/);assert.match(s,/dice-back/);assert.match(s,/DICE_ORIENTATION/);}});
test("3D dice settles on server supplied face",()=>{for(const s of [host,play]){assert.match(s,/faceTransform\(final/);assert.match(s,/lastRoll/);}});
test("board retains original player colours",()=>{for(const c of ["#22c55e","#eab308","#3b82f6","#ef4444"])assert.ok(host.includes(c));});
test("3D tabletop and raised controller styling exists",()=>{assert.match(host,/3D tabletop theme/);assert.match(host,/shadowOffsetY/);assert.match(play,/3D controller theme/);});
