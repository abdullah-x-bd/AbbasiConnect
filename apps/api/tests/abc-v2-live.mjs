import assert from 'node:assert/strict';
const h=await fetch('https://abbasiconnect-api.onrender.com/abc/health');
assert.equal(h.status,200);
console.log('ABC available');
