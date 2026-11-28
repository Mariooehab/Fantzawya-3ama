import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateStudyStatistics,
    formatStudyDuration,
    getStudyDayKey,
    normalizeStudyRecords
} from "./study-stats.js";

const userId = "user-1";
const record = (id, day, durationSeconds = 600, mode = "countdown") => ({
    id,
    data: {
        uid: userId,
        status: "completed",
        mode,
        durationSeconds,
        startedAt: new Date(`${day}T12:00:00.000Z`),
        endedAt: new Date(`${day}T12:10:00.000Z`)
    }
});

test("normalizes completed personal and shared records once and ignores incomplete records", () => {
    const sessions = [
        record("timer-1", "2026-05-08"),
        record("timer-1", "2026-05-08"),
        { id: "unfinished", data: { ...record("unused", "2026-05-09").data, status: "active" } },
        { id: "zero", data: { ...record("unused", "2026-05-09").data, durationSeconds: 0 } }
    ];
    const rooms = [
        { id: "room-1_user-1", data: { uid: userId, roomId: "room-1", durationSeconds: 900, completedAt: new Date("2026-05-09T12:10:00Z") } },
        { id: "legacy-duplicate", data: { uid: userId, roomId: "room-1", durationSeconds: 900, completedAt: new Date("2026-05-09T12:10:00Z") } }
    ];

    const records = normalizeStudyRecords(sessions, rooms, userId);

    assert.equal(records.length, 2);
    assert.equal(records.reduce((sum, item) => sum + item.durationSeconds, 0), 1500);
});

test("calculates timezone-aware days and streaks from recorded study duration", () => {
    const dates = ["2026-05-06", "2026-05-08", "2026-05-09", "2026-05-10"];
    const records = dates.map((day, index) => ({
        uid: userId,
        source: "timer",
        mode: "stopwatch",
        durationSeconds: index === 3 ? 5100 : 600,
        endedAtMillis: new Date(`${day}T23:30:00.000Z`).getTime()
    }));
    const now = new Date("2026-05-11T03:00:00.000Z");
    const stats = calculateStudyStatistics(records, "America/Los_Angeles", now);

    assert.equal(getStudyDayKey(records[3].endedAtMillis, "America/Los_Angeles"), "2026-05-10");
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.longestStreak, 3);
    assert.equal(stats.studyDays, 4);
    assert.equal(stats.completedSessions, 4);
    assert.equal(stats.totalSeconds, 6900);
    assert.equal(stats.todaySeconds, 5100);
    assert.equal(stats.weeklySeconds, 6900);
});

test("resets the current streak after a full missed day", () => {
    const stats = calculateStudyStatistics([{
        uid: userId,
        source: "timer",
        mode: "countdown",
        durationSeconds: 60,
        endedAtMillis: new Date("2026-05-08T12:00:00.000Z").getTime()
    }], "UTC", new Date("2026-05-11T12:00:00.000Z"));

    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.longestStreak, 1);
});

test("formats study durations without unnecessary seconds", () => {
    assert.equal(formatStudyDuration(5100), "1h 25m");
    assert.equal(formatStudyDuration(2700), "45m");
    assert.equal(formatStudyDuration(45), "45s");
});
