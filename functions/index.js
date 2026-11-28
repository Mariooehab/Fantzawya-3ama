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
  if (!Array.isArray(room.memberUids) || room.memberUids.some(uid => typeof uid !== 'string')) {
    throw new Error(`Completed study room ${event.params.roomId} has invalid memberUids.`);
  }
  if (!['stopwatch', 'countdown', 'until'].includes(room.mode)) {
    throw new Error(`Completed study room ${event.params.roomId} has invalid mode.`);
  }

  const memberUids = [...new Set(room.memberUids)];
  if (memberUids.length === 0) return;
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

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRoomElapsedSeconds(room, nowMillis) {
  if (!['stopwatch', 'countdown', 'until'].includes(room.mode)) {
    throw new HttpsError('failed-precondition', 'The session timer mode is invalid.');
  }
  const startedAt = timestampMillis(room.startedAt);
  if (!startedAt) throw new HttpsError('failed-precondition', 'The session start time is not available yet.');
  let endedAt = nowMillis;
  if (room.pausedAt) endedAt = Math.min(endedAt, timestampMillis(room.pausedAt));
  if (room.mode === 'countdown') {
    const configuredEnd = timestampMillis(room.targetEndAt) || startedAt + Math.max(0, Number(room.durationSeconds) || 0) * 1000;
    endedAt = Math.min(endedAt, configuredEnd);
  } else if (room.mode === 'until') {
    const targetEndAt = timestampMillis(room.targetEndAt);
    if (!targetEndAt) throw new HttpsError('failed-precondition', 'The session end time is invalid.');
    endedAt = Math.min(endedAt, targetEndAt);
  }
  const pausedSeconds = Math.max(0, Number(room.pausedSeconds) || 0);
  return Math.max(0, Math.floor((endedAt - startedAt) / 1000) - pausedSeconds);
}

exports.manageStudyRoom = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage this Study Session.');

  const { action, roomId, targetUid, inviteId } = request.data || {};
  if (!['ready', 'start', 'pause', 'resume', 'end', 'join', 'leave', 'kick'].includes(action) ||
      typeof roomId !== 'string' || !roomId || roomId.length > 150 || roomId.includes('/')) {
    throw new HttpsError('invalid-argument', 'The Study Session action is invalid.');
  }

  const uid = request.auth.uid;
  const roomRef = adminDb.collection('studyRooms').doc(roomId);
  const now = Timestamp.now();
  const nowMillis = now.toMillis();

  return adminDb.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) throw new HttpsError('not-found', 'This Study Session no longer exists.');
    const room = roomSnapshot.data();
    const members = Array.isArray(room.memberUids) ? room.memberUids : [];
    const kickedUids = Array.isArray(room.kickedUids) ? room.kickedUids : [];

    if (action === 'join') {
      if (typeof inviteId !== 'string' || !inviteId || inviteId.length > 200 || inviteId.includes('/')) {
        throw new HttpsError('invalid-argument', 'The invitation is invalid.');
      }
      const inviteRef = adminDb.collection('studyRoomInvites').doc(inviteId);
      const inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists || inviteSnapshot.data().roomId !== roomId ||
          inviteSnapshot.data().recipientUid !== uid || inviteSnapshot.data().status !== 'pending') {
        throw new HttpsError('permission-denied', 'This invitation is no longer available.');
      }
      if (room.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'You can only join before the host starts the session.');
      }
      if (kickedUids.includes(uid)) {
        throw new HttpsError('permission-denied', 'The host removed you from this session.');
      }
      if (members.includes(uid)) throw new HttpsError('already-exists', 'You are already in this session.');

      transaction.update(roomRef, { memberUids: [...members, uid], readyUids: (Array.isArray(room.readyUids) ? room.readyUids : []).filter(memberUid => memberUid !== uid) });
      transaction.update(inviteRef, { status: 'accepted', respondedAt: now });
      return { status: 'waiting' };
    }

    if (action === 'ready') {
      if (room.status !== 'waiting' || !members.includes(uid)) {
        throw new HttpsError('failed-precondition', 'Readiness can only be changed by a member of a waiting session.');
      }
      if (typeof request.data.ready !== 'boolean') {
        throw new HttpsError('invalid-argument', 'A readiness value is required.');
      }
      const readyUids = Array.isArray(room.readyUids) ? room.readyUids : [];
      const nextReadyUids = request.data.ready
        ? [...new Set([...readyUids, uid])]
        : readyUids.filter(memberUid => memberUid !== uid);
      transaction.update(roomRef, { readyUids: nextReadyUids });
      return { readyUids: nextReadyUids };
    }

    if (action === 'start') {
      if (room.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the host can start this session.');
      if (room.status !== 'waiting' || !members.includes(uid)) {
        throw new HttpsError('failed-precondition', 'This session is not waiting for a start.');
      }
      const readyUids = Array.isArray(room.readyUids) ? room.readyUids : [];
      if (!members.length || !members.every(memberUid => readyUids.includes(memberUid))) {
        throw new HttpsError('failed-precondition', 'Everyone must be READY before the host starts the session.');
      }
      let targetEndAt = '';
      if (room.mode === 'countdown') {
        const durationSeconds = Number(room.durationSeconds);
        if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86400) {
          throw new HttpsError('failed-precondition', 'The countdown duration is invalid.');
        }
        targetEndAt = new Date(nowMillis + durationSeconds * 1000).toISOString();
      } else if (room.mode === 'until') {
        const endMillis = timestampMillis(room.targetEndAt);
        if (!endMillis || endMillis <= nowMillis) {
          throw new HttpsError('failed-precondition', 'The selected end time has already passed.');
        }
      } else if (room.mode !== 'stopwatch') {
        throw new HttpsError('failed-precondition', 'The session timer mode is invalid.');
      }
      transaction.update(roomRef, { status: 'active', startedAt: now, targetEndAt });
      return { status: 'active' };
    }

    if (action === 'pause') {
      if (room.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the host can pause this session.');
      if (room.status !== 'active' || room.pausedAt) throw new HttpsError('failed-precondition', 'This session cannot be paused right now.');
      transaction.update(roomRef, { pausedAt: now });
      return { status: 'paused' };
    }

    if (action === 'resume') {
      if (room.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the host can resume this session.');
      if (room.status !== 'active' || !room.pausedAt) throw new HttpsError('failed-precondition', 'This session is not paused.');
      const pausedAtMillis = timestampMillis(room.pausedAt);
      const pauseDuration = Math.max(0, nowMillis - pausedAtMillis);
      const updates = {
        pausedAt: null,
        pausedSeconds: Math.max(0, Number(room.pausedSeconds) || 0) + Math.floor(pauseDuration / 1000)
      };
      const targetEnd = timestampMillis(room.targetEndAt);
      if (targetEnd) updates.targetEndAt = Timestamp.fromMillis(targetEnd + pauseDuration);
      transaction.update(roomRef, updates);
      return { status: 'active' };
    }

    if (action === 'end') {
      if (room.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the host can end this session.');
      if (room.status !== 'active') throw new HttpsError('failed-precondition', 'This session has already ended.');
      const finalSeconds = getRoomElapsedSeconds(room, nowMillis);
      transaction.update(roomRef, { status: 'completed', endedAt: now, finalSeconds, autoEnded: request.data.autoEnded === true });
      return { status: 'completed', finalSeconds };
    }

    if (action === 'leave') {
      if (!members.includes(uid)) throw new HttpsError('failed-precondition', 'You are not a participant in this session.');
      if (room.status === 'active' && !timestampMillis(room.startedAt)) {
        throw new HttpsError('failed-precondition', 'The session start time is not available yet.');
      }
      const remainingMembers = members.filter(memberUid => memberUid !== uid);
      const isHost = room.ownerUid === uid;
      const nextHostUid = isHost ? remainingMembers[0] : null;
      const profileRef = nextHostUid
        ? adminDb.collection('publicProfiles').doc(nextHostUid)
        : null;
      const completionRef = room.status === 'active'
        ? adminDb.collection('studyRoomCompletions').doc(`${roomId}_${uid}`)
        : null;
      const [profileSnapshot, completionSnapshot] = await Promise.all([
        profileRef ? transaction.get(profileRef) : Promise.resolve(null),
        completionRef ? transaction.get(completionRef) : Promise.resolve(null)
      ]);

      const revision = (Number(room.participantEventRevision) || 0) + 1;
      const updates = {
        memberUids: remainingMembers,
        readyUids: (Array.isArray(room.readyUids) ? room.readyUids : []).filter(memberUid => memberUid !== uid),
        participantEventRevision: revision,
        lastParticipantEvent: { uid, actorUid: uid, action: 'left', revision, createdAt: now }
      };
      if (isHost && nextHostUid) {
        updates.ownerUid = nextHostUid;
        updates.ownerUsername = profileSnapshot?.exists ? profileSnapshot.data().username || 'Member' : 'Member';
      } else if (isHost && !remainingMembers.length && room.status === 'active') {
        updates.status = 'completed';
        updates.endedAt = now;
        updates.finalSeconds = getRoomElapsedSeconds(room, nowMillis);
        updates.autoEnded = false;
      } else if (isHost && !remainingMembers.length && room.status === 'waiting') {
        updates.status = 'cancelled';
        updates.endedAt = now;
      }

      if (completionRef && !completionSnapshot.exists) {
        const durationSeconds = getRoomElapsedSeconds(room, nowMillis);
        if (durationSeconds > 0) {
          transaction.set(completionRef, {
            roomId,
            uid,
            durationSeconds,
            mode: room.mode,
            startedAt: room.startedAt,
            endedAt: now,
            createdAt: now
          });
        }
      }
      transaction.update(roomRef, updates);
      return {
        status: updates.status || room.status,
        ownerUid: updates.ownerUid || room.ownerUid,
        hostTransferred: Boolean(isHost && nextHostUid)
      };
    }

    if (action === 'kick') {
      if (room.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the host can remove participants.');
      if (room.status !== 'waiting' && room.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Participants can only be removed from a live or waiting session.');
      }
      if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 128 || targetUid.includes('/') ||
          targetUid === uid || !members.includes(targetUid)) {
        throw new HttpsError('invalid-argument', 'Choose another current participant to remove.');
      }
      if (room.status === 'active' && !timestampMillis(room.startedAt)) {
        throw new HttpsError('failed-precondition', 'The session start time is not available yet.');
      }
      const remainingMembers = members.filter(memberUid => memberUid !== targetUid);
      const completionRef = room.status === 'active'
        ? adminDb.collection('studyRoomCompletions').doc(`${roomId}_${targetUid}`)
        : null;
      const completionSnapshot = completionRef ? await transaction.get(completionRef) : null;
      const revision = (Number(room.participantEventRevision) || 0) + 1;
      transaction.update(roomRef, {
        memberUids: remainingMembers,
        readyUids: (Array.isArray(room.readyUids) ? room.readyUids : []).filter(memberUid => memberUid !== targetUid),
        kickedUids: [...new Set([...kickedUids, targetUid])],
        participantEventRevision: revision,
        lastParticipantEvent: { uid: targetUid, actorUid: uid, action: 'kicked', revision, createdAt: now }
      });
      transaction.set(adminDb.collection('studyRoomRemovals').doc(`${roomId}_${targetUid}`), {
        roomId,
        uid: targetUid,
        roomName: room.name || 'Study Session',
        type: 'kicked',
        createdAt: now
      });
      if (completionRef && !completionSnapshot.exists) {
        const durationSeconds = getRoomElapsedSeconds(room, nowMillis);
        if (durationSeconds > 0) {
          transaction.set(completionRef, {
            roomId,
            uid: targetUid,
            durationSeconds,
            mode: room.mode,
            startedAt: room.startedAt,
            endedAt: now,
            createdAt: now
          });
        }
      }
      return { status: room.status };
    }

    throw new HttpsError('invalid-argument', 'The Study Session action is not supported.');
  });
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
