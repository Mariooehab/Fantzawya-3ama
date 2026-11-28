export const RELIGIONS = Object.freeze({
    MUSLIM: "muslim",
    CHRISTIAN: "christian"
});

export function isValidReligion(value) {
    return value === RELIGIONS.MUSLIM || value === RELIGIONS.CHRISTIAN;
}

export function isValidPrayerTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatAlAdhanDate(dayKey) {
    if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        throw new Error("A valid local calendar date is required.");
    }
    const [year, month, day] = dayKey.split("-");
    return `${day}-${month}-${year}`;
}

export function parsePrayerClock(value) {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/);
    if (!match) return null;
    return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function zonedClockToMillis(dayKey, clock, timeZone) {
    if (!isValidPrayerTime(clock)) throw new Error("A valid prayer time is required.");
    if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        throw new Error("A valid calendar date is required.");
    }
    const [year, month, day] = dayKey.split("-").map(Number);
    const [hour, minute] = clock.split(":").map(Number);
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
    let result = targetUtc;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(new Date(result));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const representedUtc = Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day),
            Number(values.hour),
            Number(values.minute)
        );
        const correction = targetUtc - representedUtc;
        result += correction;
        if (correction === 0) break;
    }

    return result;
}

export function shiftPrayerDate(dayKey, dayOffset) {
    if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) ||
        !Number.isInteger(dayOffset)) {
        throw new Error("A valid date and whole-day offset are required.");
    }
    const [year, month, day] = dayKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.toISOString().slice(0, 10) !== dayKey) throw new Error("A valid calendar date is required.");
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}

export function buildPrayerTimeline({ nowMs, dateKey, timeZone, todayTimings, previousDayTimings, nextDayTimings }) {
    if (!Number.isFinite(nowMs)) throw new Error("A valid current timestamp is required.");
    const prayerKeys = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    const todayPrayers = prayerKeys.map(key => {
        const time = todayTimings?.[key];
        if (!isValidPrayerTime(time)) throw new Error(`A valid ${key} time is required.`);
        return { key, time, dateKey, dueAtMs: zonedClockToMillis(dateKey, time, timeZone) };
    });
    const sunriseTime = todayTimings?.Sunrise;
    if (!isValidPrayerTime(sunriseTime)) throw new Error("A valid Sunrise time is required.");

    const previousPrayer = [...todayPrayers]
        .filter(prayer => prayer.dueAtMs <= nowMs)
        .sort((a, b) => b.dueAtMs - a.dueAtMs)[0] ||
        (isValidPrayerTime(previousDayTimings?.Isha)
            ? {
                key: "Isha",
                time: previousDayTimings.Isha,
                dateKey: shiftPrayerDate(dateKey, -1),
                dueAtMs: zonedClockToMillis(shiftPrayerDate(dateKey, -1), previousDayTimings.Isha, timeZone)
            }
            : null);
    const nextPrayer = [...todayPrayers]
        .filter(prayer => prayer.dueAtMs > nowMs)
        .sort((a, b) => a.dueAtMs - b.dueAtMs)[0] ||
        (isValidPrayerTime(nextDayTimings?.Fajr)
            ? {
                key: "Fajr",
                time: nextDayTimings.Fajr,
                dateKey: shiftPrayerDate(dateKey, 1),
                dueAtMs: zonedClockToMillis(shiftPrayerDate(dateKey, 1), nextDayTimings.Fajr, timeZone)
            }
            : null);

    const sunrise = {
        key: "Sunrise",
        time: sunriseTime,
        dateKey,
        dueAtMs: zonedClockToMillis(dateKey, sunriseTime, timeZone),
        informational: true
    };
    const schedule = [...todayPrayers, sunrise]
        .sort((a, b) => a.dueAtMs - b.dueAtMs)
        .map(entry => ({
            ...entry,
            passed: entry.dueAtMs <= nowMs,
            next: !entry.informational && nextPrayer?.dateKey === dateKey && nextPrayer.key === entry.key
        }));

    return { schedule, previousPrayer, nextPrayer };
}

export function localClockToMillis(dayKey, clock) {
    if (!isValidPrayerTime(clock)) throw new Error("A valid reminder time is required.");
    if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        throw new Error("A valid calendar date is required.");
    }
    const [year, month, day] = dayKey.split("-").map(Number);
    const [hour, minute] = clock.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

export function normalizePrayerSettings(value) {
    const settings = value && typeof value === "object" ? value : {};
    const city = typeof settings.city === "string" ? settings.city.trim().slice(0, 80) : "";
    const country = typeof settings.country === "string" ? settings.country.trim().slice(0, 80) : "";
    return {
        city: city || "Giza",
        country: country || "Egypt",
        enabled: settings.enabled !== false
    };
}
