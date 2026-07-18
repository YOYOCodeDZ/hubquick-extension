---
name: hubspot-extension-builder
description: Builds a Manifest V3 Chrome Extension that interacts with the HubSpot Line-Items UI and wires up a $0 serverless billing engine.
---
# Purpose
You are an expert engineer building a lightweight, zero-maintenance Chrome Extension targeting HubSpot's line-item sorting issue, backed by a $0-cost serverless license verification stack.

## Architecture Constraints
- **Extension:** Manifest V3, vanilla JS/TS, client-side execution only. Use chrome.storage.local to cache deal-specific sorting preferences.
- **Serverless Backend:** Cloudflare Worker (Wrangler/TypeScript) running on the free tier. 
- **Database:** Supabase Client via standard REST endpoints (no heavy ORMs).
- **Billing:** Stripe Webhook processing (`checkout.session.completed`) to manage license generation.

## Execution Sequence
1. Generate the extension skeleton (`manifest.json`, `content.js`, `popup.html`, `popup.js`).
2. Write DOM observers in `content.js` to securely intercept HubSpot's line item elements.
3. Stub out the background token verification handshake.
4. Generate the Cloudflare Worker script (`index.ts`) and Wrangler configurations.