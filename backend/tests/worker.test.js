const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const BASE_URL = 'http://127.0.0.1:8787';
const TEST_WEBHOOK_SECRET = 'whsec_b0436f8c697e3202c5071498c95e681a758fa42e6f5526ab3b5b21e74e3c4c04';

// Helper to generate HMAC signatures
function makeStripeSignature(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const hash = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${hash}`;
}

test('Hubquick Backend Integration Tests', async (t) => {

  await t.test('GET / responds with active online status', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
  });

  await t.test('GET /verify checks UUID formats and database lookup', async () => {
    // Case 1: Invalid key format
    const res1 = await fetch(`${BASE_URL}/verify?key=invalid-license-code`);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.valid, false);

    // Case 2: Valid UUID format (Checks database lookup return. Key is not registered in Supabase, returns false)
    const res2 = await fetch(`${BASE_URL}/verify?key=00000000-0000-4000-a000-000000000000`);
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.valid, false);
  });

  await t.test('POST /webhook checks valid signature, processes database insertion, and returns key', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_suite_run',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_id',
          customer_details: {
            email: 'test-suite-buyer@example.com'
          }
        }
      }
    });

    const sig = makeStripeSignature(payload, TEST_WEBHOOK_SECRET);

    const res = await fetch(`${BASE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig
      },
      body: payload
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.received, true);
    assert.strictEqual(data.status, 'license_generated');
    assert.strictEqual(data.email, 'test-suite-buyer@example.com');
    // Verify that the generated key follows the UUID v4 standard
    assert.match(data.license_key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  await t.test('POST /webhook blocks requests with invalid signatures', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_bad_sig',
      type: 'checkout.session.completed'
    });

    const res = await fetch(`${BASE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=100000,v1=fakesignaturehash'
      },
      body: payload
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Stripe signature verification failed');
  });

});
