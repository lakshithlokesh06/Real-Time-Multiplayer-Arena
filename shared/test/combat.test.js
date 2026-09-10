import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectilePosition, segmentCircle } from '../game.js';
test('projectile rendering advances smoothly but clamps missing snapshots to 100 ms',()=>{const p={x:100,y:100,directionX:1,directionY:0};assert.equal(projectilePosition(p,50).x,140);assert.equal(projectilePosition(p,10000).x,180);assert.equal(projectilePosition(p,-100).x,100);});
test('projectile rendering never leaves the world',()=>{assert.equal(projectilePosition({x:1590,y:890,directionX:1,directionY:1},100).x,1600);});
test('segment collision handles tangents, misses, stationary segments and starts inside',()=>{assert.equal(segmentCircle(0,0,100,0,50,10,10),.5);assert.equal(segmentCircle(0,0,0,0,50,0,10),null);assert.equal(segmentCircle(0,0,1,0,0,0,10),0);assert.equal(segmentCircle(0,0,10,0,-50,0,10),null);});
