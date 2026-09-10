import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
test('additive match migration preserves populated account, profile and session rows',async()=>{
 const source=process.env.TEST_DATABASE_URL;if(!source||!new URL(source).pathname.endsWith('_test'))throw new Error('Dedicated _test database required');
 const db=new Client({connectionString:source});await db.connect();const schema=`upgrade_${randomUUID().replaceAll('-','')}`;
 try{await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}"`);await db.query(await readFile('prisma/migrations/20260908050000_player_accounts/migration.sql','utf8'));
 const user=randomUUID();await db.query('INSERT INTO "User" (id,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,now())',[user,'migration@example.com','fixture-hash']);await db.query('INSERT INTO "PlayerProfile" (id,"userId",username,"displayName","updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),user,'migration','Migration Player']);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')',[randomUUID(),user,'f'.repeat(64)]);
 const snapshot=async()=>Promise.all(['User','PlayerProfile','Session'].map(async t=>(await db.query(`SELECT * FROM "${t}" ORDER BY id`)).rows));const before=await snapshot();await db.query(await readFile('prisma/migrations/20260910040000_match_results/migration.sql','utf8'));assert.deepEqual(await snapshot(),before);assert.equal((await db.query('SELECT count(*) FROM "Match"')).rows[0].count,'0');
 }finally{await db.query('SET search_path TO public');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
});
