import assert from "node:assert/strict";
import test from "node:test";
import {
    areStudyRoomMembersReady,
    buildStudyRoomCreationDocument,
    getStudyRoomElapsedSeconds,
    getStudyRoomRemainingSeconds
} from "./study-room-utils.js";

const start = Date.parse("2026-11-28T10:00:00.000Z");
const room = overrides => ({
    mode: "countdown",
    durationSeconds: 120,
    startedAt: new Date(start),
    pausedSeconds: 0,
    isPaused: false,
    ...overrides
});

test("room pause freezes countdown and resume subtracts the shared paused duration", () => {
    const pausedRoom = room({
        isPaused: true,
        pausedAt: new Date(start + 45_000),
        pausedSeconds: 10
    });
    assert.equal(getStudyRoomElapsedSeconds(pausedRoom, start + 90_000), 35);
    assert.equal(getStudyRoomRemainingSeconds(pausedRoom, start + 90_000), 85);

    const resumedRoom = room({ pausedSeconds: 55 });
    assert.equal(getStudyRoomElapsedSeconds(resumedRoom, start + 90_000), 35);
    assert.equal(getStudyRoomRemainingSeconds(resumedRoom, start + 90_000), 85);
});

test("until and stopwatch modes exclude cumulative and current pause time", () => {
    const untilRoom = room({
        mode: "until",
        targetEndAt: new Date(start + 120_000),
        isPaused: true,
        pausedAt: new Date(start + 45_000),
        pausedSeconds: 10
    });
    assert.equal(getStudyRoomRemainingSeconds(untilRoom, start + 180_000), 85);

    const stopwatchRoom = room({
        mode: "stopwatch",
        isPaused: true,
        pausedAt: new Date(start + 45_000),
        pausedSeconds: 10
    });
    assert.equal(getStudyRoomElapsedSeconds(stopwatchRoom, start + 180_000), 35);
});

test("a new or not-ready member prevents the room from starting", () => {
    assert.equal(areStudyRoomMembersReady({ memberUids: ["owner"], readyUids: [] }), false);
    assert.equal(areStudyRoomMembersReady({
        memberUids: ["owner", "friend"],
        readyUids: ["owner"]
    }), false);
    assert.equal(areStudyRoomMembersReady({
        memberUids: ["owner", "friend"],
        readyUids: ["owner", "friend"]
    }), true);
    assert.equal(areStudyRoomMembersReady({
        memberUids: ["owner"],
        readyUids: ["owner", "stale"]
    }), false);
});

test("room creation documents match the complete Firestore schema for every timer mode", () => {
    const createdAt = { serverTimestamp: true };
    const targetEndAt = { toMillis: () => start + 3_600_000 };
    const expectedKeys = [
        "name", "ownerUid", "ownerUsername", "memberUids", "readyUids", "mode",
        "durationSeconds", "targetEndAt", "status", "createdAt", "startedAt",
        "endedAt", "isPaused", "pausedAt", "pausedSeconds"
    ];

    for (const [mode, durationSeconds, target] of [
        ["stopwatch", 0, null],
        ["countdown", 3600, null],
        ["until", 0, targetEndAt]
    ]) {
        const document = buildStudyRoomCreationDocument({
            name: "  Biology  ",
            ownerUid: "owner-uid",
            ownerUsername: "Mario",
            mode,
            durationSeconds,
            targetEndAt: target,
            createdAt
        });
        assert.deepEqual(Object.keys(document), expectedKeys);
        assert.equal(document.name, "Biology");
        assert.deepEqual(document.memberUids, ["owner-uid"]);
        assert.deepEqual(document.readyUids, []);
        assert.equal(document.durationSeconds, durationSeconds);
        assert.equal(document.targetEndAt, target);
        assert.equal(document.createdAt, createdAt);
        assert.equal(document.status, "waiting");
        assert.equal(document.startedAt, null);
        assert.equal(document.endedAt, null);
        assert.equal(document.isPaused, false);
        assert.equal(document.pausedAt, null);
        assert.equal(document.pausedSeconds, 0);
    }
});

test("room creation rejects invalid names, fractional seconds, and mode mismatches", () => {
    const base = {
        name: "Study",
        ownerUid: "owner-uid",
        ownerUsername: "Mario",
        mode: "countdown",
        durationSeconds: 60,
        targetEndAt: null,
        createdAt: { serverTimestamp: true }
    };

    assert.throws(() => buildStudyRoomCreationDocument({ ...base, name: " " }));
    assert.throws(() => buildStudyRoomCreationDocument({ ...base, durationSeconds: 60.5 }));
    assert.throws(() => buildStudyRoomCreationDocument({ ...base, mode: "stopwatch", durationSeconds: 60 }));
    assert.throws(() => buildStudyRoomCreationDocument({ ...base, mode: "until", durationSeconds: 0 }));
});
