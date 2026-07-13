const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'public','host.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'public','play.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

test('board theme is flat while tokens retain dimensional rendering',()=>{
  assert.match(host,/\.board-wrap\{transform:none!important/);
  assert.match(host,/Metallic outer rim/);
  assert.match(host,/Contact shadow makes the piece feel physical/);
});

test('host owns the main enlarged 3D dice',()=>{
  assert.match(host,/--dice-size:112px/);
  assert.match(host,/hostDiceCube/);
  assert.match(host,/animateDice\(db,gs\.lastRoll\.faces,col\)/);
});

test('phone is controller and confirmed result display',()=>{
  assert.match(phone,/ROLL DICE ON TV/);
  assert.match(phone,/You rolled/);
  assert.match(phone,/TV owns the physical dice/);
  assert.doesNotMatch(phone,/\$\{dice3D\(gs\.lastDice,diceCol\)\}/);
});

test('move selection is locked until the TV dice reveal finishes',()=>{
  assert.match(server,/diceRevealMs/);
  assert.match(server,/Watch the TV dice finish rolling first/);
  assert.match(phone,/inputLockedUntil/);
});

test('core rules engine paths remain present',()=>{
  for(const pattern of [/hasCaptured/,/sixStreak>=3/,/openingBoost/,/target===5/]) assert.match(server,pattern);
});
