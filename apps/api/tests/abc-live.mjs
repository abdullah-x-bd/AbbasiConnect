import assert from 'node:assert/strict';
const root = process.env.ABC_API_URL || 'https://abbasiconnect-api.onrender.com';
const resp = await fetch(root + '/abc/health');
assert.equal(resp.status, 200);
const health = await resp.json();
assert.equal(health.service, 'abbasi-bahishti-connections');
console.log('PASS ABC live API health');
