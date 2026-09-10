/**
 * Generate a VAPID keypair for web push and print it (do NOT auto-append to
 * .env — paste manually so secrets never land in logs):
 *
 *   npm run push:generate
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("# Add to .env (do not commit):");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("# Also set WEBPUSH_SUBJECT=mailto:you@example.com");
