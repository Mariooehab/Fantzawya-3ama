const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  }
});

const SYSTEM_PROMPT = `أنت Fantzawya، صاحب وصديق الطالب في المذاكرة، وبتتكلم معاه بالمصري الطبيعي زي كلام الشباب في مصر.\n\nقواعد أسلوب الكلام (مهمة جدًا):\n- اتكلم بالعامية المصرية طول الوقت، مش بالفصحى ومش بالعربي الرسمي أو اللهجات التانية.\n- استخدم تعبيرات طبيعية زي: بص، تمام، تعالى، خلينا، عادي، كده، عشان، إيه رأيك؛ من غير مبالغة أو تصنّع.\n- خلي كلامك بسيط وودود ومباشر، كأنك صاحب بيساعد صاحبه، مش مدرس بيلقي محاضرة.\n- لو السؤال دراسي، اشرح بالمصري مع الحفاظ على المصطلحات العلمية والإنجليزية زي ما هي، ووضّح معناها ببساطة.\n- جاوب بنفس لغة المستخدم لو كتب بلغة غير العربية، إلا لو طلب المصري صراحة.\n- بلاش مقدمات محفوظة أو تكرار السؤال. اختصر من غير ما تخل بالمعلومة، واستخدم نقاط لما تسهّل الفهم.\n\nالمهام والحدود: ساعد في شرح المواد وتنظيم الوقت وحل المشكلات الدراسية. ما تخترعش بيانات أو مواعيد أو مهام. استخدم بيانات الطالب فقط عند الحاجة للتخصيص. لو معلومة أساسية ناقصة اسأل سؤال واحد. ما تطلبش كلمات مرور أو بيانات حساسة. اقترح خطوات فقط وما تدّعيش إنك نفذت تغييرات.`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = allowed === '*' || origin === allowed ? (allowed === '*' ? '*' : origin) : 'null';
    if (request.method === 'OPTIONS') {
      if (corsOrigin === 'null') return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400', 'Vary': 'Origin'
      }});
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, corsOrigin);
    if (corsOrigin === 'null') return json({ error: 'Origin not allowed.' }, 403, 'null');
    if (!env.FIREBASE_API_KEY) return json({ error: 'Worker configuration is incomplete.' }, 500, corsOrigin);

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken || idToken.length > 5000) return json({ error: 'سجّل دخولك الأول لاستخدام المساعد.' }, 401, corsOrigin);

    // Verify Firebase ID token.
    try {
      const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const identity = await verify.json();
      if (!verify.ok || !identity.users?.[0]?.localId) return json({ error: 'جلسة الدخول غير صالحة. سجّل دخولك مرة تانية.' }, 401, corsOrigin);
    } catch {
      return json({ error: 'تعذر التحقق من تسجيل الدخول. حاول مرة أخرى.' }, 503, corsOrigin);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 30000) return json({ error: 'الطلب كبير جدًا.' }, 413, corsOrigin);
      body = JSON.parse(raw);
    } catch { return json({ error: 'طلب غير صالح.' }, 400, corsOrigin); }

    const message = String(body.message || '').trim();
    if (!message || message.length > 1500) return json({ error: 'اكتب سؤالًا من 1 إلى 1500 حرف.' }, 400, corsOrigin);
    const c = body.context || {};
    const safeContext = {
      username: String(c.username || 'Student').slice(0, 30),
      examDate: String(c.examDate || '').slice(0, 40),
      todos: Array.isArray(c.todos) ? c.todos.slice(0, 10).map(t => ({ title: String(t.title || '').slice(0,100), note: String(t.note || '').slice(0,180), dueAt: String(t.dueAt || '').slice(0,40), completed: !!t.completed })) : [],
      sessions: Array.isArray(c.sessions) ? c.sessions.slice(-10).map(s => ({ mode: String(s.mode || ''), status: String(s.status || ''), durationSeconds: Math.max(0, Math.min(604800, Number(s.durationSeconds) || 0)), startedAt: String(s.startedAt || '').slice(0,40) })) : []
    };
    const history = Array.isArray(body.history) ? body.history.slice(-4).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.text || '').slice(0, 900)
    })) : [];
    const userPrompt = `بيانات الطالب الحالية (قد تكون ناقصة):\n${JSON.stringify(safeContext)}\n\nسؤال الطالب: ${message}`;
    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userPrompt }
    ];
    const providerErrors = [];

    // 1) Gemini: primary provider. Retry brief transient failures, then fail over.
    if (env.GEMINI_API_KEY) {
      const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const contents = [
            ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: userPrompt }] }
          ];
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig: { temperature: 0.55, maxOutputTokens: 700 } })
          });
          const data = await r.json().catch(() => ({}));
          const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
          if (r.ok && answer) return json({ answer, provider: 'gemini' }, 200, corsOrigin);
          providerErrors.push({ provider: 'gemini', status: r.status, reason: data?.error?.message || (r.ok ? 'empty_response' : 'request_failed') });
          if (r.status !== 429 && r.status < 500) break;
        } catch (e) {
          providerErrors.push({ provider: 'gemini', status: 503, reason: e?.message || 'network_error' });
        }
        if (attempt === 0) await sleep(500);
      }
    } else {
      providerErrors.push({ provider: 'gemini', reason: 'not_configured' });
    }

    // 2) Groq: optional secret. Uses the OpenAI-compatible Chat Completions API.
    if (env.GROQ_API_KEY) {
      try {
        const model = env.GROQ_MODEL || 'openai/gpt-oss-20b';
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, messages: chatMessages, temperature: 0.4, max_tokens: 700 })
        });
        const data = await r.json().catch(() => ({}));
        const answer = data?.choices?.[0]?.message?.content?.trim();
        if (r.ok && answer) return json({ answer, provider: 'groq' }, 200, corsOrigin);
        providerErrors.push({ provider: 'groq', status: r.status, reason: data?.error?.message || (r.ok ? 'empty_response' : 'request_failed') });
      } catch (e) {
        providerErrors.push({ provider: 'groq', status: 503, reason: e?.message || 'network_error' });
      }
    } else {
      providerErrors.push({ provider: 'groq', reason: 'not_configured' });
    }

    // 3) Cloudflare Workers AI binding. No separate API key is needed when the AI binding is enabled.
    if (env.AI?.run) {
      try {
        const model = env.CF_AI_MODEL || '@cf/meta/llama-3.2-3b-instruct';
        const result = await env.AI.run(model, {
          messages: chatMessages,
          max_tokens: 700,
          temperature: 0.4
        });
        const answer = (result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || '').trim();
        if (answer) return json({ answer, provider: 'cloudflare' }, 200, corsOrigin);
        providerErrors.push({ provider: 'cloudflare', reason: 'empty_response' });
      } catch (e) {
        providerErrors.push({ provider: 'cloudflare', reason: e?.message || 'request_failed' });
      }
    } else {
      providerErrors.push({ provider: 'cloudflare', reason: 'ai_binding_missing' });
    }

    console.error('ALL AI PROVIDERS FAILED:', providerErrors.map(x => ({ provider: x.provider, status: x.status, reason: x.reason })));
    return json({
      error: 'كل خدمات الذكاء الاصطناعي مش متاحة حاليًا. جرّب تاني بعد شوية.',
      providers: providerErrors.map(x => ({ provider: x.provider, status: x.status, reason: x.reason }))
    }, 503, corsOrigin);
  }
};
