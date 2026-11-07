export const signatureExamples = {
 'Node.js': `// Express: mount express.raw({ type: 'application/json' }) before JSON parsing.
import { createHmac, timingSafeEqual } from 'node:crypto';
const signature = req.get('X-Habitoo-Signature') ?? '';
const match = /^t=(\\d+),v1=([a-f0-9]{64})$/.exec(signature);
if (!match || Math.abs(Date.now() / 1000 - Number(match[1])) > 300) {
  return res.sendStatus(401);
}
const secret = Buffer.from(process.env.HABITOO_WEBHOOK_SECRET, 'hex');
const expected = createHmac('sha256', secret)
  .update(match[1] + '.').update(req.body).digest();
if (!timingSafeEqual(expected, Buffer.from(match[2], 'hex'))) {
  return res.sendStatus(401);
}
const event = JSON.parse(req.body.toString('utf8'));
// Persist event.id in a durable inbox with a UNIQUE constraint.
// Atomically enqueue once, then acknowledge; do not process twice.
await saveToInboxOnce(event);
res.sendStatus(204);`,
 PHP: `<?php
$raw = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HABITOO_SIGNATURE'] ?? '';
if (!preg_match('/^t=(\\d+),v1=([a-f0-9]{64})$/', $signature, $m)
    || abs(time() - (int)$m[1]) > 300) {
    http_response_code(401); exit;
}
$secret = hex2bin(getenv('HABITOO_WEBHOOK_SECRET'));
$expected = hash_hmac('sha256', $m[1] . '.' . $raw, $secret);
if (!hash_equals($expected, $m[2])) {
    http_response_code(401); exit;
}
$event = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
// Durable inbox, UNIQUE event.id; enqueue atomically only once.
save_to_inbox_once($event);
http_response_code(204);`,
 Python: `import hashlib, hmac, os, re, time, json
# Flask: read the raw body before decoding JSON.
raw = request.get_data()
match = re.fullmatch(r"t=(\\d+),v1=([a-f0-9]{64})",
                     request.headers.get("X-Habitoo-Signature", ""))
if not match or abs(time.time() - int(match[1])) > 300:
    abort(401)
secret = bytes.fromhex(os.environ["HABITOO_WEBHOOK_SECRET"])
expected = hmac.new(secret, match[1].encode() + b"." + raw,
                    hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, match[2]):
    abort(401)
event = json.loads(raw)
# Durable inbox, UNIQUE event.id; enqueue atomically only once.
save_to_inbox_once(event)
return "", 204`,
};
