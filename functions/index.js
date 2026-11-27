const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
initializeApp();
const adminDb = getFirestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

exports.recordCompletedStudyRoom = onDocumentUpdated({
  document: 'studyRooms/{roomId}',
  region: 'us-central1',
  retry: true
}, async (event) => {
  const previousRoom = event.data?.before.data();
  const room = event.data?.after.data();
  if (!previousRoom || !room || previousRoom.status === 'completed' || room.status !== 'completed') return;

  if (!Number.isSafeInteger(room.finalSeconds) || room.finalSeconds < 0) {
    throw new Error(`Completed study room ${event.params.roomId} has invalid finalSeconds.`);
  }
  if (!Array.isArray(room.memberUids) || room.memberUids.length === 0 || room.memberUids.some(uid => typeof uid !== 'string')) {
    throw new Error(`Completed study room ${event.params.roomId} has invalid memberUids.`);
  }
  if (!['stopwatch', 'countdown', 'until'].includes(room.mode)) {
    throw new Error(`Completed study room ${event.params.roomId} has invalid mode.`);
  }

  const memberUids = [...new Set(room.memberUids)];
  if (!memberUids.includes(room.ownerUid)) {
    throw new Error(`Completed study room ${event.params.roomId} is missing its owner from memberUids.`);
  }
  const completedAt = room.endedAt || event.data.after.updateTime;
  for (let i = 0; i < memberUids.length; i += 400) {
    const batch = adminDb.batch();
    memberUids.slice(i, i + 400).forEach(uid => {
      batch.set(adminDb.collection('studyRoomCompletions').doc(`${event.params.roomId}_${uid}`), {
        roomId: event.params.roomId,
        uid,
        durationSeconds: room.finalSeconds,
        mode: room.mode,
        completedAt
      });
    });
    await batch.commit();
  }
});

exports.askFantzawyaAI = onCall({
  region: 'us-central1',
  secrets: [GEMINI_API_KEY],
  enforceAppCheck: false,
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'سجّل دخولك الأول.');
  const message = String(request.data?.message || '').trim();
  if (!message || message.length > 1500) throw new HttpsError('invalid-argument', 'اكتب سؤالًا من 1 إلى 1500 حرف.');
  const usageRef = adminDb.collection('aiUsage').doc(request.auth.uid);
  const now = Date.now();
  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(usageRef);
    const data = snap.exists ? snap.data() : {};
    const windowStart = Number(data.windowStart || 0);
    const count = windowStart && now - windowStart < 60 * 60 * 1000 ? Number(data.count || 0) : 0;
    if (count >= 20) throw new HttpsError('resource-exhausted', 'وصلت للحد المؤقت: 20 رسالة في الساعة. جرّب بعد شوية.');
    tx.set(usageRef, { windowStart: count ? windowStart : now, count: count + 1, updatedAt: Timestamp.now() });
  });
  const context = request.data?.context || {};
  const safeContext = {
    username: String(context.username || 'Student').slice(0, 30),
    examDate: String(context.examDate || '').slice(0, 40),
    todos: Array.isArray(context.todos) ? context.todos.slice(0, 35).map(t => ({title:String(t.title||'').slice(0,100),note:String(t.note||'').slice(0,180),dueAt:String(t.dueAt||'').slice(0,40),completed:!!t.completed})) : [],
    sessions: Array.isArray(context.sessions) ? context.sessions.slice(-40).map(s => ({mode:String(s.mode||''),status:String(s.status||''),durationSeconds:Math.max(0,Math.min(604800,Number(s.durationSeconds)||0)),startedAt:String(s.startedAt||'').slice(0,40)})) : []
  };
  const history = Array.isArray(request.data?.history) ? request.data.history.slice(-8).map(m => ({role:m.role === 'assistant' ? 'model' : 'user',parts:[{text:String(m.text||'').slice(0,1500)}]})) : [];
  const prompt = `أنت Fantzawya AI، مساعد دراسي داخل موقع Fantzawya. أجب باللهجة المصرية الواضحة وبشكل عملي ومنظم. ساعد في شرح المواد، حل المشكلات الدراسية، إدارة الوقت، وبناء جداول واقعية. لا تدّعِ معرفة معلومات غير موجودة. استخدم بيانات الطالب المرفقة فقط عند تخصيص الجدول، ولا تخترع مواعيد امتحانات أو مهام. لو البيانات غير كافية اسأل سؤالًا واحدًا محددًا. لا تطلب كلمات مرور أو بيانات حساسة. لا تقل إنك أضفت مهامًا أو غيّرت الموقع؛ أنت تقترح فقط. اجعل الإجابات مناسبة للطالب، مع تقسيم الجدول لفترات وراحات.

بيانات الطالب الحالية (قد تكون ناقصة):
${JSON.stringify(safeContext)}

سؤال الطالب: ${message}`;
  const contents = [...history, { role: 'user', parts: [{ text: prompt }] }];
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY.value() },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.65, maxOutputTokens: 1400 } })
    });
    const payload = await response.json();
    if (!response.ok) {
      logger.error('Gemini API error', { status: response.status, message: payload?.error?.message });
      throw new HttpsError('internal', 'خدمة الذكاء الاصطناعي لم تستجب. راجع إعداد مفتاح Gemini أو جرّب لاحقًا.');
    }
    const answer = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!answer) throw new HttpsError('internal', 'المساعد لم يرجع إجابة. جرّب صياغة السؤال بطريقة مختلفة.');
    return { answer };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Fantzawya AI request failed', error);
    throw new HttpsError('unavailable', 'تعذر الاتصال بالمساعد حاليًا. حاول مرة أخرى.');
  }
});
