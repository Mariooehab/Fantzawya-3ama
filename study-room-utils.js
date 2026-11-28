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

export function buildStudyRoomCreationDocument({
    name,
    ownerUid,
    ownerUsername,
    mode,
    durationSeconds,
    targetEndAt,
    createdAt
}) {
    const validModes = ["stopwatch", "countdown", "until"];
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 48) {
        throw new Error("The room name must contain 1 to 48 characters.");
    }
    if (typeof ownerUid !== "string" || !ownerUid) {
        throw new Error("A signed-in account is required to create a room.");
    }
    if (typeof ownerUsername !== "string" || ownerUsername.length > 20) {
        throw new Error("The account username is invalid.");
    }
    if (!validModes.includes(mode)) {
        throw new Error("Choose a valid Study Room timer mode.");
    }
    if (!Number.isSafeInteger(durationSeconds) ||
        (mode === "countdown" && (durationSeconds < 60 || durationSeconds > 86400)) ||
        (mode !== "countdown" && durationSeconds !== 0)) {
        throw new Error("The room duration does not match the selected timer mode.");
    }
    if (mode === "until") {
        if (!targetEndAt || typeof targetEndAt.toMillis !== "function" ||
            !Number.isFinite(targetEndAt.toMillis())) {
            throw new Error("Choose a valid end time for this Study Room.");
        }
    } else if (targetEndAt !== null) {
        throw new Error("Only Until rooms may have a target end time.");
    }
    if (createdAt == null) {
        throw new Error("A server creation timestamp is required.");
    }

    return {
        name: name.trim(),
        ownerUid,
        ownerUsername,
        memberUids: [ownerUid],
        readyUids: [],
        mode,
        durationSeconds,
        targetEndAt,
        status: "waiting",
        createdAt,
        startedAt: null,
        endedAt: null,
        isPaused: false,
        pausedAt: null,
        pausedSeconds: 0
    };
}

function getStudyRoomTargetSeconds(room, startedAtMillis) {
    if (room?.mode === "countdown") {
        const duration = Number(room.durationSeconds);
        return Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : null;
    }
    if (room?.mode === "until") {
        const targetEnd = timestampMillis(room.targetEndAt);
        return targetEnd ? Math.max(0, Math.floor((targetEnd - startedAtMillis) / 1000)) : null;
    }
    return room?.mode === "stopwatch" ? Infinity : null;
}

export function getStudyRoomElapsedSeconds(room, endAt = Date.now()) {
    const startedAtMillis = timestampMillis(room?.startedAt);
    if (!startedAtMillis) return null;

    const effectiveEndMillis = room.isPaused === true
        ? timestampMillis(room.pausedAt)
        : timestampMillis(endAt);
    if (!effectiveEndMillis) return null;

    const pausedSeconds = Number(room.pausedSeconds) || 0;
    const elapsedSeconds = Math.floor((effectiveEndMillis - startedAtMillis) / 1000) - Math.max(0, pausedSeconds);
    const targetSeconds = getStudyRoomTargetSeconds(room, startedAtMillis);
    if (targetSeconds === null) return null;
    return Math.max(0, Math.min(elapsedSeconds, targetSeconds));
}

export function getStudyRoomRemainingSeconds(room, now = Date.now()) {
    const elapsedSeconds = getStudyRoomElapsedSeconds(room, now);
    if (elapsedSeconds === null) return null;
    if (room.mode === "stopwatch") return elapsedSeconds;

    const targetSeconds = getStudyRoomTargetSeconds(room, timestampMillis(room.startedAt));
    return targetSeconds === null ? null : Math.max(0, targetSeconds - elapsedSeconds);
}

export function areStudyRoomMembersReady(room) {
    const members = Array.isArray(room?.memberUids) ? room.memberUids : [];
    const readyUids = Array.isArray(room?.readyUids) ? room.readyUids : [];
    return members.length > 0
        && readyUids.length === members.length
        && members.every(uid => readyUids.includes(uid));
}
