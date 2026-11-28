import assert from "node:assert/strict";
import test from "node:test";
import {
    formatAlAdhanDate,
    buildPrayerTimeline,
    isValidPrayerTime,
    isValidReligion,
    localClockToMillis,
    normalizePrayerSettings,
    parsePrayerClock,
    shiftPrayerDate,
    zonedClockToMillis
} from "./prayer-utils.js";

test("accepts only the two supported religions and strict 24-hour times", () => {
    assert.equal(isValidReligion("muslim"), true);
    assert.equal(isValidReligion("christian"), true);
    assert.equal(isValidReligion("other"), false);
    assert.equal(isValidPrayerTime("00:00"), true);
    assert.equal(isValidPrayerTime("23:59"), true);
    assert.equal(isValidPrayerTime("24:00"), false);
    assert.equal(isValidPrayerTime("9:30"), false);
});

test("formats the requested local date for AlAdhan and parses returned prayer times", () => {
    assert.equal(formatAlAdhanDate("2026-11-28"), "28-11-2026");
    assert.equal(parsePrayerClock("05:17 (EET)"), "05:17");
    assert.equal(parsePrayerClock("invalid"), null);
});

test("converts prayer wall time using the API timezone and custom reminders using local time", () => {
    const cairoPrayer = zonedClockToMillis("2026-11-28", "05:00", "Africa/Cairo");
    const cairoClock = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Cairo",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).format(new Date(cairoPrayer));
    assert.equal(cairoClock, "05:00");

    const localClock = localClockToMillis("2026-11-28", "19:30");
    const localTime = new Date(localClock);
    assert.equal(localTime.getHours(), 19);
    assert.equal(localTime.getMinutes(), 30);
});

test("shifts calendar dates and finds adjacent-day prayers across midnight", () => {
    assert.equal(shiftPrayerDate("2026-11-28", -1), "2026-11-27");
    assert.equal(shiftPrayerDate("2026-11-28", 1), "2026-11-29");
    const today = { Fajr: "05:00", Dhuhr: "12:00", Asr: "15:00", Maghrib: "17:00", Isha: "19:00", Sunrise: "06:30" };
    const adjacent = { ...today, Fajr: "05:05", Isha: "19:05" };
    const afterIsha = buildPrayerTimeline({
        nowMs: zonedClockToMillis("2026-11-28", "21:00", "Africa/Cairo"),
        dateKey: "2026-11-28",
        timeZone: "Africa/Cairo",
        todayTimings: today,
        nextDayTimings: adjacent
    });
    assert.equal(afterIsha.previousPrayer.key, "Isha");
    assert.equal(afterIsha.nextPrayer.key, "Fajr");
    assert.equal(afterIsha.nextPrayer.dateKey, "2026-11-29");

    const beforeFajr = buildPrayerTimeline({
        nowMs: zonedClockToMillis("2026-11-28", "02:00", "Africa/Cairo"),
        dateKey: "2026-11-28",
        timeZone: "Africa/Cairo",
        todayTimings: today,
        previousDayTimings: adjacent
    });
    assert.equal(beforeFajr.previousPrayer.key, "Isha");
    assert.equal(beforeFajr.previousPrayer.dateKey, "2026-11-27");
    assert.equal(beforeFajr.nextPrayer.key, "Fajr");
    assert.equal(beforeFajr.nextPrayer.dateKey, "2026-11-28");
    assert.deepEqual(beforeFajr.schedule.map(item => item.key), [
        "Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"
    ]);
    assert.equal(beforeFajr.schedule.find(item => item.key === "Fajr").next, true);
    assert.equal(beforeFajr.schedule.find(item => item.key === "Sunrise").informational, true);
});

test("normalizes legacy prayer settings without changing religion", () => {
    assert.deepEqual(normalizePrayerSettings({ city: "  ", enabled: false }), {
        city: "Giza",
        country: "Egypt",
        enabled: false
    });
});
