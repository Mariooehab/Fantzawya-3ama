function timestampMillis(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function documentEntries(documents) {
    return Array.from(documents || [], item => ({
        id: item.id,
        data: typeof item.data === "function" ? item.data() : item.data || {}
    }));
}

export function normalizeStudyRecords(sessionDocuments, roomDocuments, uid = null) {
    const records = new Map();
    const addRecord = (record, source, id) => {
        const key = `${record.uid}:${source}:${id}`;
        if (!records.has(key)) records.set(key, record);
    };

    documentEntries(sessionDocuments).forEach(({ id, data }) => {
        if (data.status !== "completed" || !data.uid || (uid && data.uid !== uid)) return;
        const durationSeconds = Number(data.durationSeconds);
        const endedAtMillis = timestampMillis(data.endedAt || data.completedAt || data.startedAt);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !endedAtMillis) return;

        addRecord({
            uid: data.uid,
            sessionId: id,
            source: "timer",
            mode: data.mode === "stopwatch" ? "stopwatch" : "countdown",
            durationSeconds: Math.floor(durationSeconds),
            startedAtMillis: timestampMillis(data.startedAt),
            endedAtMillis
        }, "timer", id);
    });

    documentEntries(roomDocuments).forEach(({ id, data }) => {
        if (!data.uid || (uid && data.uid !== uid)) return;
        const durationSeconds = Number(data.durationSeconds);
        const endedAtMillis = timestampMillis(data.endedAt || data.completedAt || data.startedAt);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !endedAtMillis) return;

        const roomId = data.roomId || id;
        addRecord({
            uid: data.uid,
            sessionId: roomId,
            source: "room",
            mode: "studyRoom",
            durationSeconds: Math.floor(durationSeconds),
            startedAtMillis: timestampMillis(data.startedAt),
            endedAtMillis
        }, "room", roomId);
    });

    return [...records.values()].sort((a, b) => b.endedAtMillis - a.endedAtMillis);
}

function validTimeZone(timeZone) {
    if (typeof timeZone !== "string" || !timeZone) return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return timeZone;
    } catch {
        return "UTC";
    }
}

export function getStudyDayKey(timestamp, timeZone = "UTC") {
    const millis = timestampMillis(timestamp);
    if (!millis) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: validTimeZone(timeZone),
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date(millis));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function dayOrdinal(dayKey) {
    const [year, month, day] = dayKey.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function calculateStudyStatistics(records, timeZone = "UTC", now = new Date()) {
    const zone = validTimeZone(timeZone);
    const todayKey = getStudyDayKey(now, zone);
    const todayOrdinal = dayOrdinal(todayKey);
    const dayTotals = new Map();
    const validRecords = (records || []).filter(record =>
        record && record.uid && Number.isFinite(Number(record.durationSeconds)) &&
        Number(record.durationSeconds) > 0 && Number.isFinite(Number(record.endedAtMillis)) &&
        Number(record.endedAtMillis) > 0
    );
    let totalSeconds = 0;
    let countdownSeconds = 0;
    let stopwatchSeconds = 0;
    let studyRoomSeconds = 0;

    validRecords.forEach(record => {
        const seconds = Math.floor(Number(record.durationSeconds));
        const dayKey = getStudyDayKey(Number(record.endedAtMillis), zone);
        if (!dayKey) return;
        totalSeconds += seconds;
        dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + seconds);
        if (record.source === "room") studyRoomSeconds += seconds;
        else if (record.mode === "stopwatch") stopwatchSeconds += seconds;
        else countdownSeconds += seconds;
    });

    const studyDays = [...dayTotals.keys()].sort();
    const ordinals = studyDays.map(dayOrdinal);
    let longestStreak = 0;
    let run = 0;
    let previousOrdinal = null;
    ordinals.forEach(ordinal => {
        run = previousOrdinal !== null && ordinal === previousOrdinal + 1 ? run + 1 : 1;
        longestStreak = Math.max(longestStreak, run);
        previousOrdinal = ordinal;
    });

    let currentStreak = 0;
    const lastOrdinal = ordinals[ordinals.length - 1];
    if (lastOrdinal === todayOrdinal || lastOrdinal === todayOrdinal - 1) {
        const studyDayOrdinals = new Set(ordinals);
        for (let cursor = lastOrdinal; studyDayOrdinals.has(cursor); cursor -= 1) currentStreak += 1;
    }

    let weeklySeconds = 0;
    dayTotals.forEach((seconds, dayKey) => {
        const ordinal = dayOrdinal(dayKey);
        if (ordinal >= todayOrdinal - 6 && ordinal <= todayOrdinal) weeklySeconds += seconds;
    });

    return {
        records: validRecords,
        totalSeconds,
        completedSessions: validRecords.length,
        countdownSeconds,
        stopwatchSeconds,
        studyRoomSeconds,
        studyDays: studyDays.length,
        currentStreak,
        longestStreak,
        todaySeconds: dayTotals.get(todayKey) || 0,
        weeklySeconds,
        dayTotals
    };
}

export function formatStudyDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes) return `${minutes}m`;
    return `${total}s`;
}

export function formatStudyDate(timestamp, timeZone = "UTC", locale) {
    const millis = timestampMillis(timestamp);
    if (!millis) return "Date unavailable";
    return new Intl.DateTimeFormat(locale, {
        timeZone: validTimeZone(timeZone),
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(new Date(millis));
}
