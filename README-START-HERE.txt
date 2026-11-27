FANTZAWYA — MULTI-AI (GEMINI + GROQ + CLOUDFLARE)
=================================================

This package adds automatic provider failover to the existing Fantzawya AI chat.
Provider order:
1) Gemini (primary; short retry for temporary overload)
2) Groq (if GROQ_API_KEY is configured)
3) Cloudflare Workers AI (through the AI binding)

The website ai.js keeps the same Worker URL and request format. No frontend change is required.

A) DEPLOY THE WORKER
1. Open Cloudflare > Workers & Pages > fantzawya-ai > Edit code.
2. Replace the Worker code with cloudflare-worker/src/index.js from this package.
3. Ensure the Worker uses the included cloudflare-worker/wrangler.toml settings, especially:
   [ai]
   binding = "AI"
4. Deploy the Worker. If deploying from your computer, open a terminal in cloudflare-worker and run:
   npm install
   npx wrangler deploy

B) CONFIGURE PRODUCTION SECRETS
Cloudflare > Workers & Pages > fantzawya-ai > Settings > Variables and Secrets > Production:

Required:
- FIREBASE_API_KEY: Type Text. Use the Firebase Web API key from your Firebase project.

Recommended (primary provider):
- GEMINI_API_KEY: Type Secret. Use a newly created key from https://aistudio.google.com/apikey
- GEMINI_MODEL: Type Text, value gemini-3.8-flash (or omit to use this default).

Optional (second provider):
- GROQ_API_KEY: Type Secret. Create it at https://console.groq.com/keys
- GROQ_MODEL: Type Text, value openai/gpt-oss-20b (or omit to use this default).

Cloudflare fallback:
- The Worker uses the Workers AI binding named AI. It is declared in wrangler.toml.
- Default model: @cf/meta/llama-3.2-3b-instruct
- Optional override: CF_AI_MODEL (Type Text), only if you choose another currently available model.
- No separate Cloudflare API key is needed when using the binding from the Worker.

Important:
- Never put GEMINI_API_KEY or GROQ_API_KEY in wrangler.toml, ai.js, or browser code. Add them as Secret values in Production.
- If you use Wrangler CLI, secrets can be added with:
  npx wrangler secret put GEMINI_API_KEY
  npx wrangler secret put GROQ_API_KEY
  Run each command from cloudflare-worker and paste the key only into the terminal prompt.
- The included wrangler.toml contains the existing Firebase Web API key. It is a Firebase client configuration key, not a Gemini/Groq secret. If your Firebase project uses a different key, update it before deploying.
- Keep ALLOWED_ORIGIN unset until you know the exact site origin, or set it to the exact origin (no trailing slash), e.g. https://example.com.

C) WEBSITE
- The existing ai.js already calls the current Worker URL.
- You do not need to upload a changed ai.js for this Multi-AI update.
- Live Server can continue to serve the site locally; the Cloudflare Worker itself must be deployed online.

D) TEST
1. Sign in to Fantzawya.
2. Open the AI assistant and send a short question.
3. A successful response may include provider in the Worker JSON (gemini, groq, or cloudflare); the website displays only the answer.
4. If all providers fail, check Cloudflare Worker Logs. Never share API keys, Authorization headers, or Firebase ID tokens.

COST / FREE-TIER NOTES
- Gemini free access has model-specific limits and can experience overload.
- Groq has organization/model-specific RPM, RPD, and token limits; it is not unlimited and limits can change.
- Workers AI currently documents a 10,000-Neuron daily free allocation; after that, requests may fail on Free plan. Some models require paid billing.
- Multi-provider failover improves resilience but cannot guarantee uninterrupted service. If all providers are unavailable or quotas are exhausted, the assistant will return a clear temporary-unavailable message.
- This package does not add persistent per-user rate limiting. For public rollout, add rate limiting / abuse controls to avoid unexpected usage.

SECURITY
- The Worker verifies the Firebase ID token before contacting AI providers.
- Gemini and Groq secrets remain on Cloudflare and are never sent to the browser.
- Revoke any API key that was previously exposed and create a new one. Do not send keys or ID tokens in chat.
