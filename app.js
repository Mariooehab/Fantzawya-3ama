import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";
import { auth, db } from "./firebase.js";
import {
    calculateStudyStatistics,
    formatStudyDate,
    formatStudyDuration,
    getStudyDayKey,
    normalizeStudyRecords
} from "./study-stats.js";
import {
    formatAlAdhanDate,
    isValidPrayerTime,
    isValidReligion,
    localClockToMillis,
    normalizePrayerSettings,
    parsePrayerClock,
    buildPrayerTimeline,
    shiftPrayerDate,
    zonedClockToMillis
} from "./prayer-utils.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updateEmail,
    updatePassword,
    getIdToken
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const functions = getFunctions(auth.app, "us-central1");
const joinLeagueCallable = httpsCallable(functions, "joinLeague");

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    deleteDoc,
    addDoc,
    orderBy,
    onSnapshot,
    runTransaction,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


const manageStudyRoomCall = httpsCallable(functions, "manageStudyRoom");

/* ELEMENTS */
const authContainer = document.getElementById("authContainer");
const dashboard = document.getElementById("dashboard");
const mobileNav = document.getElementById("mobileNav");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const tabs = document.querySelectorAll(".tab");
const message = document.getElementById("message");
const logoutBtn = document.getElementById("logoutBtn");
const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
const saveExamBtn = document.getElementById("saveExamBtn");
const examDateInput = document.getElementById("examDate");


/* PAGE NAVIGATION */
function showPage(pageName) {
    const validPages = ["overview", "study", "prayers", "exams", "challenges", "leaderboard", "friends", "league", "todo", "profile"];
    const canOpenPrayerPage = pageName !== "prayers" || currentProfile?.religion === "muslim";
    const selected = validPages.includes(pageName) && canOpenPrayerPage ? pageName : "overview";
    document.querySelectorAll(".app-page").forEach(page => page.classList.toggle("active", page.dataset.page === selected));
    document.querySelectorAll("[data-page]").forEach(link => link.classList.toggle("active", link.dataset.page === selected));
    const titles = { overview: "Dashboard", study: "Study Timer", prayers: "Prayers", exams: "Exam Countdown", challenges: "Study Session", leaderboard: "All-time Leaderboard", friends: "Friends", league: "Study League", todo: "To-do & Notes", profile: "My Profile" };
    const heading = document.querySelector(".topbar h2");
    if (heading) heading.textContent = titles[selected];
    if (history.replaceState) history.replaceState(null, "", `#${selected}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (selected === "prayers") updatePrayerPage();
}
document.querySelectorAll(".nav-link[data-page], .mobile-nav-link[data-page]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        showPage(link.dataset.page);
    });
});

window.addEventListener("hashchange", () => {
    const pageFromHash = location.hash.replace("#", "");
    const hashToPage = { study: "study", studyTimer: "study", profileSettings: "profile" };
    showPage(hashToPage[pageFromHash] || pageFromHash || "overview");
});

const countdownModeBtn = document.getElementById("countdownModeBtn");
const stopwatchModeBtn = document.getElementById("stopwatchModeBtn");
const timerSetup = document.getElementById("timerSetup");
const timerHoursInput = document.getElementById("timerHours");
const timerMinutesInput = document.getElementById("timerMinutes");
const timerSecondsInput = document.getElementById("timerSeconds");
const timerBreakIntervalHoursInput = document.getElementById("timerBreakIntervalHours");
const timerBreakIntervalMinutesInput = document.getElementById("timerBreakIntervalMinutes");
const timerBreakMinutesInput = document.getElementById("timerBreakMinutes");
const timerDisplay = document.getElementById("timerDisplay");
const timerState = document.getElementById("timerState");
const timerModeCaption = document.getElementById("timerModeCaption");
const timerProgress = document.getElementById("timerProgress");
const timerStartBtn = document.getElementById("timerStartBtn");
const timerPauseBtn = document.getElementById("timerPauseBtn");
const timerResumeBtn = document.getElementById("timerResumeBtn");
const timerFinishBtn = document.getElementById("timerFinishBtn");
const timerResetBtn = document.getElementById("timerResetBtn");
const timerStartBreakBtn = document.getElementById("timerStartBreakBtn");
const timerStartStudyBtn = document.getElementById("timerStartStudyBtn");
const timerAddTimeControl = document.getElementById("timerAddTimeControl");
const timerAddTimeSelect = document.getElementById("timerAddTimeSelect");
const timerAddTimeCustomInput = document.getElementById("timerAddTimeCustom");
const timerAddTimeBtn = document.getElementById("timerAddTimeBtn");
const timerMessage = document.getElementById("timerMessage");

let currentProfile = null;
function updatePrayerNavigationVisibility() {
    const visible = currentProfile?.religion === "muslim";
    document.querySelectorAll(".prayer-nav-link").forEach(link => {
        link.hidden = !visible;
    });
    if (!visible && location.hash === "#prayers") showPage("overview");
}
// The owner identity is resolved from the authenticated account, then published
// in publicProfiles so every member (including newly registered members) can see it.
const OWNER_EMAIL = "untiban59@gmail.com";
const isOwnerAccount = user => (user?.email || "").trim().toLowerCase() === OWNER_EMAIL;
function getLocalStudyTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function appendOwnerTag(target, text = "👑 OWNER & MAKER", extraClass = "") {
    if (!target || target.querySelector?.(".owner-tag")) return;
    const tag = document.createElement("span");
    tag.className = `owner-tag ${extraClass}`.trim();
    tag.textContent = text;
    tag.setAttribute("aria-label", "Website owner and maker");
    target.append(tag);
}

const requiredReligionDialog = document.getElementById("requiredReligionDialog");
const requiredReligionSelect = document.getElementById("requiredReligionSelect");
const requiredReligionSave = document.getElementById("requiredReligionSave");
const requiredReligionError = document.getElementById("requiredReligionError");
requiredReligionDialog?.addEventListener("cancel", event => event.preventDefault());

function chooseRequiredReligion(user, persistReligion) {
    if (!requiredReligionDialog || !requiredReligionSelect || !requiredReligionSave) {
        return Promise.reject(new Error("The required religion selection dialog is unavailable."));
    }

    requiredReligionSelect.value = "";
    requiredReligionError.textContent = "";
    requiredReligionSave.disabled = false;
    requiredReligionSave.textContent = "SAVE & CONTINUE";
    requiredReligionDialog.showModal();

    return new Promise(resolve => {
        requiredReligionSave.onclick = async () => {
            const religion = requiredReligionSelect.value;
            if (!isValidReligion(religion)) {
                requiredReligionError.textContent = "Choose Muslim or Christian to continue.";
                return;
            }
            requiredReligionSave.disabled = true;
            requiredReligionSave.textContent = "SAVING...";
            requiredReligionError.textContent = "";
            try {
                if (auth.currentUser?.uid !== user.uid) throw new Error("Your sign-in changed. Please sign in again.");
                await persistReligion(religion);
                requiredReligionDialog.close();
                resolve(religion);
            } catch (error) {
                console.error("Could not save required religion:", error);
                requiredReligionError.textContent = error.code === "permission-denied"
                    ? "Firestore denied this update. Publish the current Firestore Rules and retry."
                    : `Could not save your choice (${error.code || "error"}). Check your connection and retry.`;
                requiredReligionSave.disabled = false;
                requiredReligionSave.textContent = "SAVE & CONTINUE";
            }
        };
    });
}

let authFlowInProgress = false;
let activeAuthUid = null;
let dashboardLoadedUid = null;
let countdownInterval = null;
let timerInterval = null;
let timerMode = "countdown";
let activeSession = null;
let finishingSession = false;
let startingSession = false;

let appPopupResolver = null;
let appPopupLastMessage = "";

function showAppPopup(text, { error = false, confirm = false, title = "Fantzawya", okLabel = null, cancelLabel = "Cancel" } = {}) {
    const modal = document.getElementById("appMessageModal");
    if (!modal) return Promise.resolve(true);
    if (appPopupResolver) { appPopupResolver(false); appPopupResolver = null; }
    document.getElementById("appMessageTitle").textContent = title;
    document.getElementById("appMessageText").textContent = String(text ?? "");
    document.getElementById("appMessageIcon").textContent = error ? "!" : (confirm ? "?" : "✦");
    modal.querySelector(".app-message-card").classList.toggle("is-error", error);
    document.getElementById("appMessageCancel").hidden = !confirm;
    document.getElementById("appMessageCancel").textContent = cancelLabel;
    document.getElementById("appMessageOk").textContent = okLabel || (confirm ? "Confirm" : "OK");
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    return new Promise(resolve => { appPopupResolver = resolve; });
}

function closeAppPopup(result) {
    const modal = document.getElementById("appMessageModal");
    if (modal) { modal.hidden = true; modal.setAttribute("aria-hidden", "true"); }
    const resolve = appPopupResolver; appPopupResolver = null;
    if (resolve) resolve(Boolean(result));
}

document.getElementById("appMessageOk")?.addEventListener("click", () => closeAppPopup(true));
document.getElementById("appMessageCancel")?.addEventListener("click", () => closeAppPopup(false));
document.querySelector(".app-message-backdrop")?.addEventListener("click", () => closeAppPopup(false));

// Ordinary action notices are logged instead of interrupting the user with popups.
// The owner invitation uses appChoice(), and logout keeps its dedicated appConfirm().
function appAlert(text) {
    const messageText = String(text ?? "");
    const isError = /could not|failed|error|denied/i.test(messageText);
    (isError ? console.error : console.info)("Fantzawya notice:", messageText);
    return Promise.resolve(true);
}
function appConfirm(text) { return showAppPopup(text, { confirm: true, title: "Please Confirm" }); }
function appChoice(text, options = {}) { return showAppPopup(text, { confirm: true, title: "Fantzawya", ...options }); }

function showMessage(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff6b81" : "#a78bfa";
    if (text) (error ? console.error : console.info)("Fantzawya:", text);
}

function logFirestoreFailure(operation, error) {
    console.error(`Firestore operation failed: ${operation}`, {
        code: error?.code || "unknown",
        message: error?.message || String(error),
        error
    });
}

async function runFirestoreOperation(operation, task) {
    try {
        return await task();
    } catch (error) {
        logFirestoreFailure(operation, error);
        throw error;
    }
}

function reportDashboardFeatureFailure(name, error) {
    logFirestoreFailure(`dashboard feature: ${name}`, error);
    const status = document.getElementById("dashboardLoadStatus");
    if (!status) return;
    const failures = new Set((status.dataset.failures || "").split("|").filter(Boolean));
    failures.add(`${name} (${error.code || "error"})`);
    status.dataset.failures = [...failures].join("|");
    status.textContent = `Some dashboard features could not be loaded: ${[...failures].join(", ")}. Your account is still signed in; reload to retry.`;
    status.hidden = false;
}

async function runDashboardFeature(name, task) {
    try {
        return await task();
    } catch (error) {
        reportDashboardFeatureFailure(name, error);
        return null;
    }
}

function setTimerMessage(text, error = false) {
    timerMessage.textContent = text;
    timerMessage.classList.toggle("error", error);
    if (text) (error ? console.error : console.info)("Study timer:", text);
}


/* AUTH TABS */
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const selected = tab.dataset.tab;
        tabs.forEach(item => item.classList.remove("active"));
        tab.classList.add("active");
        loginForm.hidden = selected !== "login";
        registerForm.hidden = selected !== "register";
        showMessage("");
    });
});


/* AUTH PROFILE RECOVERY
   Firebase Authentication can create the account before a Firestore write fails.
   This repairs that half-created account instead of leaving registration stuck. */
async function ensureAccountDocuments(user, fallbackUsername = "", religion = null) {
    const userRef = doc(db, "users", user.uid);
    let userSnapshot;
    try {
        userSnapshot = await getDoc(userRef);
    } catch (error) {
        logFirestoreFailure("read users/{uid} during account restoration", error);
        throw error;
    }
    let profile = userSnapshot.exists() ? userSnapshot.data() : null;

    if (!profile) {
        const publicRef = doc(db, "publicProfiles", user.uid);
        let publicSnapshot = null;
        try {
            publicSnapshot = await getDoc(publicRef);
        } catch (error) {
            logFirestoreFailure("read publicProfiles/{uid} during account restoration", error);
        }
        const recoveredName = (fallbackUsername || publicSnapshot?.data()?.username || user.displayName || user.email?.split("@")[0] || "New User")
            .trim().replace(/\s+/g, " ").slice(0, 20);
        if (recoveredName.length < 3) throw new Error("Choose a username with at least 3 characters to finish setting up this account.");
        profile = {
            username: recoveredName,
            email: user.email || "",
            createdAt: serverTimestamp(),
            xp: 0,
            streak: 0,
            status: "online",
            avatarUrl: "",
            coverUrl: "",
            studyTimeZone: getLocalStudyTimeZone(),
            ...(isValidReligion(religion) ? { religion } : {})
        };
        try {
            await setDoc(userRef, profile);
        } catch (error) {
            logFirestoreFailure("create users/{uid} during account restoration", error);
            throw error;
        }
        profile = { ...profile, username: recoveredName };
    }

    const username = profile.username || fallbackUsername || user.email?.split("@")[0] || "New User";
    try {
        await setDoc(doc(db, "publicProfiles", user.uid), {
            uid: user.uid,
            username,
            usernameLower: username.toLowerCase(),
            avatarUrl: profile.avatarUrl || "",
            coverUrl: profile.coverUrl || "",
            studyTimeZone: profile.studyTimeZone || getLocalStudyTimeZone(),
            ...(isOwnerAccount(user) ? { isOwner: true } : {}),
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        logFirestoreFailure("create or synchronize publicProfiles/{uid} during account restoration", error);
    }
    return profile;
}

/* REGISTER */
registerForm.addEventListener("submit", async event => {
    event.preventDefault();

    const username = document.getElementById("registerUsername").value.trim().replace(/\s+/g, " ");
    const email = document.getElementById("registerEmail").value.trim().toLowerCase();
    const password = document.getElementById("registerPassword").value;
    const religion = document.getElementById("registerReligion").value;
    const button = registerForm.querySelector(".submit-btn");

    if (Array.from(username).length < 3 || Array.from(username).length > 20) {
        showMessage("Username must be between 3 and 20 characters.", true);
        return;
    }
    if (!isValidReligion(religion)) {
        showMessage("Choose Muslim or Christian before creating your account.", true);
        return;
    }

    authFlowInProgress = true;
    button.disabled = true;
    button.textContent = "CREATING ACCOUNT...";

    try {
        let result;
        try {
            result = await createUserWithEmailAndPassword(auth, email, password);
        } catch (createError) {
            // A previous attempt may have created the Auth user but failed before
            // saving Firestore documents. Sign in with the same credentials and repair it.
            if (createError.code !== "auth/email-already-in-use") throw createError;
            try {
                result = await signInWithEmailAndPassword(auth, email, password);
                const userSnapshot = await getDoc(doc(db, "users", result.user.uid));
                if (!userSnapshot.exists()) {
                    await loadDashboard(result.user, username);
                    registerForm.reset();
                    return;
                }
                const existingProfile = await ensureAccountDocuments(result.user, username);
                if (existingProfile.username && existingProfile.username !== username) {
                    appAlert("This email already has an account. We signed you in and restored its missing profile data.");
                } else {
                    appAlert("Your previous registration was incomplete. Your account has now been repaired.");
                }
                await loadDashboard(result.user);
                registerForm.reset();
                return;
            } catch (recoveryError) {
                if (recoveryError.code === "auth/invalid-credential" || recoveryError.code === "auth/wrong-password" || recoveryError.code === "auth/user-not-found") {
                    throw new Error("Firebase Authentication already has this email. The password doesn't match that account. Try LOGIN or use Forgot Password.");
                }
                throw recoveryError;
            }
        }

        await ensureAccountDocuments(result.user, username, religion);
        registerForm.reset();
        await appAlert("Account created successfully!");
        const dashboardLoaded = await loadDashboard(result.user);
        if (dashboardLoaded) {
            await runDashboardFeature("welcome owner prompt", () => offerOwnerFriendPrompt(result.user));
        }
    } catch (error) {
        console.error("Registration error:", error);
        const errors = {
            "auth/email-already-in-use": "Firebase Authentication already has this email. Try LOGIN or use Forgot Password.",
            "auth/invalid-email": "Invalid email address.",
            "auth/weak-password": "Password must be at least 6 characters.",
            "auth/network-request-failed": "Check your internet connection.",
            "auth/operation-not-allowed": "Email/Password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
            "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
            "permission-denied": "Firestore permission denied. Publish the latest Firestore Rules.",
            "unauthenticated": "Please sign in again and retry."
        };
        appAlert(errors[error.code] || error.message || `${error.code || "Error"}: Registration failed.`);
    } finally {
        authFlowInProgress = false;
        button.disabled = false;
        button.textContent = "CREATE ACCOUNT";
    }
});


/* LOGIN */
loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const button = loginForm.querySelector(".submit-btn");

    authFlowInProgress = true;
    button.disabled = true;
    button.textContent = "LOGGING IN...";

    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await loadDashboard(result.user);
    } catch (error) {
        if (String(error.code || "").startsWith("auth/")) {
            console.error("Firebase Authentication sign-in failed:", { code: error.code, message: error.message, error });
            showMessage(
                error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password"
                    ? "Incorrect email or password. Firebase Authentication rejected these credentials."
                    : error.code === "auth/operation-not-allowed"
                        ? "Enable Email/Password in Firebase Console → Authentication → Sign-in method."
                        : error.message,
                true
            );
        } else {
            console.error("Signed-in user dashboard initialization failed:", { code: error.code || "unknown", message: error.message || String(error), error });
            showMessage(
                auth.currentUser
                    ? `You're signed in, but dashboard initialization failed (${error.code || "error"}). You have not been logged out.`
                    : error.message || "Could not initialize the dashboard.",
                true
            );
        }
    } finally {
        authFlowInProgress = false;
        button.disabled = false;
        button.textContent = "LOGIN";
    }
});


/* DASHBOARD */
async function loadDashboard(user, fallbackUsername = "") {
    if (!user || auth.currentUser?.uid !== user.uid) return false;
    if (activeAuthUid && activeAuthUid !== user.uid) {
        stopAuthenticatedSubscriptions();
        dashboard.hidden = true;
        mobileNav.hidden = true;
        authContainer.hidden = false;
    }
    activeAuthUid = user.uid;
    dashboardLoadedUid = null;

    const featureStatus = document.getElementById("dashboardLoadStatus");
    if (featureStatus) {
        featureStatus.hidden = true;
        featureStatus.textContent = "";
        featureStatus.dataset.failures = "";
    }

    let profile;
    let profileOperation = "read users/{uid} profile";
    try {
        let profileSnapshot = await runFirestoreOperation("read users/{uid} profile", () => getDoc(doc(db, "users", user.uid)));
        if (!profileSnapshot.exists()) {
            profileOperation = "restore missing users/{uid} profile";
            await chooseRequiredReligion(user, religion => ensureAccountDocuments(user, fallbackUsername, religion));
            profileOperation = "read restored users/{uid} profile";
            profileSnapshot = await runFirestoreOperation(profileOperation, () => getDoc(doc(db, "users", user.uid)));
        }
        if (!profileSnapshot.exists()) throw new Error("Could not restore this account profile. Check Firestore Rules.");

        profile = profileSnapshot.data();
        if (!isValidReligion(profile.religion)) {
            profileOperation = "save required users/{uid}.religion";
            profile.religion = await chooseRequiredReligion(user, religion =>
                updateDoc(doc(db, "users", user.uid), { religion })
            );
        }
    } catch (error) {
        if (auth.currentUser?.uid !== user.uid) return false;
        logFirestoreFailure(profileOperation, error);
        authContainer.hidden = false;
        dashboard.hidden = true;
        mobileNav.hidden = true;
        showMessage(`You're signed in, but your profile could not be loaded (${error.code || "error"}). You have not been logged out. Check your connection or Firestore access, then retry.`, true);
        return false;
    }

    if (auth.currentUser?.uid !== user.uid || activeAuthUid !== user.uid) return false;
    const studyTimeZone = getLocalStudyTimeZone();
    if (profile.studyTimeZone !== studyTimeZone) {
        try {
            await updateDoc(doc(db, "users", user.uid), { studyTimeZone });
        } catch (error) {
            reportDashboardFeatureFailure("profile timezone sync", error);
        }
        profile.studyTimeZone = studyTimeZone;
    }
    if (auth.currentUser?.uid !== user.uid || activeAuthUid !== user.uid) return false;
    currentProfile = profile;
    updatePrayerNavigationVisibility();

    await runDashboardFeature("public profile synchronization", async () => {
        const publicProfileRef = doc(db, "publicProfiles", user.uid);
        const publicProfileSnapshot = await runFirestoreOperation("read publicProfiles/{uid} during dashboard load", () => getDoc(publicProfileRef));
        const username = profile.username || "User";
        const requiredFields = {
            uid: user.uid,
            username,
            usernameLower: username.toLowerCase(),
            avatarUrl: profile.avatarUrl || "",
            coverUrl: profile.coverUrl || "",
            studyTimeZone
        };
        const publicProfileUpdates = {};
        if (!publicProfileSnapshot.exists()) {
            Object.assign(publicProfileUpdates, requiredFields);
            if (isOwnerAccount(user)) publicProfileUpdates.isOwner = true;
        } else {
            const publicProfile = publicProfileSnapshot.data();
            Object.entries(requiredFields).forEach(([key, value]) => {
                if (!(key in publicProfile)) publicProfileUpdates[key] = value;
            });
            if (publicProfile.studyTimeZone !== studyTimeZone) publicProfileUpdates.studyTimeZone = studyTimeZone;
            if (isOwnerAccount(user) && publicProfile.isOwner !== true) publicProfileUpdates.isOwner = true;
        }
        if (Object.keys(publicProfileUpdates).length) {
            publicProfileUpdates.updatedAt = serverTimestamp();
            if (publicProfileSnapshot.exists()) {
                await runFirestoreOperation("update publicProfiles/{uid} during dashboard load", () => updateDoc(publicProfileRef, publicProfileUpdates));
            } else {
                await runFirestoreOperation("create publicProfiles/{uid} during dashboard load", () => setDoc(publicProfileRef, publicProfileUpdates));
            }
        }
    });
    if (auth.currentUser?.uid !== user.uid || activeAuthUid !== user.uid) return false;

    const username = profile.username || "User";
    const email = profile.email || user.email || "";
    const xp = Number(profile.xp) || 0;
    const initial = username.charAt(0).toUpperCase();

    document.getElementById("welcomeUsername").textContent = username;
    document.getElementById("sidebarUsername").textContent = username;
    document.getElementById("topbarUsername").textContent = username;
    document.getElementById("profileUsername").textContent = username;
    document.getElementById("profileEmail").textContent = email;
    document.getElementById("profileReligionValue").textContent = profile.religion === "muslim" ? "Muslim" : "Christian";
    document.getElementById("editReligion").value = profile.religion;
    ["sidebarUsername", "topbarUsername", "profileUsername"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll(".owner-tag").forEach(tag => tag.remove());
        if (isOwnerAccount(user)) appendOwnerTag(el);
    });
    const profileBadge = document.querySelector(".profile-badge");
    if (profileBadge) {
        profileBadge.textContent = isOwnerAccount(user) ? "👑 WEBSITE OWNER & MAKER" : "COMMUNITY MEMBER";
        profileBadge.classList.toggle("owner-profile-badge", isOwnerAccount(user));
    }
    ["sidebarAvatar", "topbarAvatar", "profileAvatar"].forEach(id => {
        const avatar = document.getElementById(id);
        if (avatar) avatar.classList.toggle("owner-avatar", isOwnerAccount(user));
    });
    document.getElementById("xpValue").textContent = xp.toLocaleString();
    document.getElementById("streakValue").textContent = "0";
    document.getElementById("profileXP").textContent = `${xp.toLocaleString()} XP`;
    document.getElementById("sidebarAvatar").textContent = initial;
    document.getElementById("topbarAvatar").textContent = initial;
    document.getElementById("profileAvatar").textContent = initial;
    document.getElementById("editUsername").value = username;
    document.getElementById("editAvatarUrl").value = profile.avatarUrl || "";
    document.getElementById("editCoverUrl").value = profile.coverUrl || "";
    applyCover(profile.coverUrl || "");
    document.getElementById("newEmail").value = user.email || email;
    applyAvatar(profile.avatarUrl || "", initial);

    authContainer.hidden = true;
    dashboard.hidden = false;
    mobileNav.hidden = false;
    dashboardLoadedUid = user.uid;
    showPage(location.hash.replace("#", "") || "overview");
    const runForCurrentUser = (name, task) => runDashboardFeature(name, async () => {
        if (auth.currentUser?.uid === user.uid) return task();
    });
    await runForCurrentUser("prayer reminder initialization", async () => initializePrayerReminderSystem(user.uid, profile));
    await runForCurrentUser("exam countdown initialization", async () => loadExamDate(user.uid));
    await runForCurrentUser("study statistics", async () => loadStudyStats(user.uid));
    await runForCurrentUser("community features", async () => loadCommunityFeatures(user.uid));
    await runForCurrentUser("friends", async () => loadFriends(user.uid));
    await runForCurrentUser("study session restoration", async () => restoreStudySession(user.uid));
    return true;
}


/* LOGOUT */
async function logout() {
    const confirmed = await appConfirm("Are you sure you want to log out?");
    if (!confirmed) return;
    try {
        // Keep an active timer intact so the same user can resume it after logging in again.
        await signOut(auth);
        dashboard.hidden = true;
        mobileNav.hidden = true;
        authContainer.hidden = false;
        loginForm.reset();
        registerForm.reset();
        showMessage("You have been logged out.");
        stopTimerTicker();
    } catch (error) {
        console.error("Logout error:", error);
        appAlert("Could not log out. Please try again.");
    }
}

logoutBtn.addEventListener("click", logout);
mobileLogoutBtn.addEventListener("click", logout);


const mobileNavToggle = document.getElementById("mobileNavToggle");
const mobileNavMenu = document.getElementById("mobileNavMenu");
const mobileNavCurrent = document.getElementById("mobileNavCurrent");

if (mobileNavToggle && mobileNavMenu) {
    mobileNavToggle.addEventListener("click", () => {
        const opened = mobileNavMenu.classList.toggle("is-open");
        mobileNavToggle.setAttribute("aria-expanded", String(opened));
        mobileNavToggle.classList.toggle("is-open", opened);
    });

    mobileNavMenu.querySelectorAll("a[data-page]").forEach(link => {
        link.addEventListener("click", () => {
            const label = link.querySelector("small")?.textContent || "Menu";
            if (mobileNavCurrent) mobileNavCurrent.textContent = label;
            mobileNavMenu.classList.remove("is-open");
            mobileNavToggle.classList.remove("is-open");
            mobileNavToggle.setAttribute("aria-expanded", "false");
        });
    });
}

/* NEW MEMBER OWNER INTRO */
async function offerOwnerFriendPrompt(user) {
    if (!user || isOwnerAccount(user)) return;
    const ownRef = doc(db, "users", user.uid);
    const ownSnapshot = await getDoc(ownRef);
    if (!ownSnapshot.exists() || ownSnapshot.data().ownerSuggestionSeen === true) return;

    // Mark it before opening the modal so refreshes or multiple auth events never duplicate it.
    await updateDoc(ownRef, { ownerSuggestionSeen: true, ownerSuggestionSeenAt: serverTimestamp() });

    const ownerQuery = await getDocs(query(collection(db, "publicProfiles"), where("isOwner", "==", true)));
    const ownerDoc = ownerQuery.docs.find(item => item.id !== user.uid);
    if (!ownerDoc) return;

    const owner = { uid: ownerDoc.id, ...ownerDoc.data() };
    const addOwner = await appChoice(
        `Welcome to Fantzawya, ${currentProfile?.username || "new member"}! Would you like to add the website owner to your friends?`,
        { title: "Meet the Owner 👑", okLabel: "ADD OWNER", cancelLabel: "MAYBE LATER" }
    );
    if (!addOwner) return;

    const actionButton = { disabled: false, textContent: "ADD FRIEND" };
    await sendFriendRequest(owner, actionButton);
    if (actionButton.textContent === "REQUEST SENT") {
        appAlert("Friend request sent to the Fantzawya owner! 👑");
    } else if (actionButton.textContent === "REQUEST EXISTS") {
        appAlert("You already have a friend request or friendship with the owner.");
    }
}

/* PROFILE + FRIENDS */
function applyAvatar(url, fallbackInitial) {
    ["sidebarAvatar", "topbarAvatar", "profileAvatar"].forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = "";
        element.style.backgroundImage = url ? `url("${url.replace(/["\\]/g, "")}")` : "";
        element.style.backgroundSize = "cover";
        element.style.backgroundPosition = "center";
        element.style.backgroundColor = "#5540a0";
        if (!url) element.textContent = fallbackInitial || "U";
    });
}

function applyCover(url) {
    const cover = document.getElementById("profileCover");
    if (!cover) return;
    cover.style.backgroundImage = url ? `linear-gradient(90deg, rgba(8,8,20,.25), rgba(8,8,20,.05)), url("${url.replace(/["\\]/g, "")}")` : "";
    cover.classList.toggle("has-cover", Boolean(url));
}

function setInlineStatus(id, text, error = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", error);
}

function normalizeUsername(value) {
    return value.trim().replace(/\s+/g, " ");
}

function validUsername(value) {
    return Array.from(value).length >= 3 && Array.from(value).length <= 20;
}

const saveProfileBtn = document.getElementById("saveProfileBtn");
if (saveProfileBtn) saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const username = normalizeUsername(document.getElementById("editUsername").value);
    const avatarUrl = document.getElementById("editAvatarUrl").value.trim();
    const coverUrl = document.getElementById("editCoverUrl").value.trim();
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        setInlineStatus("profileStatus", "Photo URL must start with https:// or http://", true);
        return;
    }
    if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
        setInlineStatus("profileStatus", "Cover URL must start with https:// or http://", true);
        return;
    }

    if (!validUsername(username)) {
        setInlineStatus("profileStatus", "Username must be between 3 and 20 characters.", true);
        return;
    }

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = "SAVING...";

    try {
        const usernameLower = username.toLowerCase();
        const duplicate = await getDocs(query(
            collection(db, "publicProfiles"),
            where("usernameLower", "==", usernameLower)
        ));

        if (duplicate.docs.some(item => item.id !== user.uid)) {
            throw new Error("This username is already taken.");
        }

        await updateDoc(doc(db, "users", user.uid), { username, avatarUrl, coverUrl });
        await setDoc(doc(db, "publicProfiles", user.uid), {
            uid: user.uid,
            username,
            usernameLower,
            avatarUrl,
            coverUrl,
            studyTimeZone: currentProfile?.studyTimeZone || getLocalStudyTimeZone(),
            ...(isOwnerAccount(user) ? { isOwner: true } : {}),
            updatedAt: serverTimestamp()
        });

        currentProfile = { ...currentProfile, username, avatarUrl, coverUrl, studyTimeZone: currentProfile?.studyTimeZone || getLocalStudyTimeZone() };
        document.getElementById("welcomeUsername").textContent = username;
        document.getElementById("sidebarUsername").textContent = username;
        document.getElementById("topbarUsername").textContent = username;
        document.getElementById("profileUsername").textContent = username;
        document.getElementById("editAvatarUrl").value = avatarUrl;
        document.getElementById("editCoverUrl").value = coverUrl;
        applyAvatar(avatarUrl, username.charAt(0).toUpperCase());
        applyCover(coverUrl);
        setInlineStatus("profileStatus", "Profile updated successfully. Friends will see the latest profile details.");
        await loadFriends(user.uid);
    } catch (error) {
        console.error("Profile update error:", error);
        setInlineStatus("profileStatus", error.message || "Could not update profile. Check Firestore Rules.", true);
    } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.textContent = "SAVE PROFILE";
    }
});

const saveReligionBtn = document.getElementById("saveReligionBtn");
if (saveReligionBtn) saveReligionBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    const religion = document.getElementById("editReligion").value;
    if (!user || !isValidReligion(religion)) {
        setInlineStatus("religionStatus", "Choose Muslim or Christian.", true);
        return;
    }

    saveReligionBtn.disabled = true;
    saveReligionBtn.textContent = "SAVING...";
    try {
        await updateDoc(doc(db, "users", user.uid), { religion });
        currentProfile = { ...currentProfile, religion };
        document.getElementById("profileReligionValue").textContent = religion === "muslim" ? "Muslim" : "Christian";
        setInlineStatus("religionStatus", "Religion updated successfully.");
        synchronizePrayerProfile(currentProfile, user.uid);
    } catch (error) {
        console.error("Religion update failed:", error);
        setInlineStatus("religionStatus", error.code === "permission-denied"
            ? "Firestore denied this update. Publish the current Firestore Rules."
            : `Could not update religion (${error.code || "error"}).`, true);
    } finally {
        saveReligionBtn.disabled = false;
        saveReligionBtn.textContent = "UPDATE RELIGION";
    }
});

/* PRAYER REMINDER STATE */
const MUSLIM_PRAYERS = [
    { key: "Fajr", name: "الفجر", display: "Fajr" },
    { key: "Dhuhr", name: "الظهر", display: "Dhuhr" },
    { key: "Asr", name: "العصر", display: "Asr" },
    { key: "Maghrib", name: "المغرب", display: "Maghrib" },
    { key: "Isha", name: "العشاء", display: "Isha" }
];
const PRAYER_CALCULATION_METHODS = [
    { id: 5, label: "Egyptian General Authority" },
    { id: 3, label: "Muslim World League" },
    { id: 2, label: "Islamic Society of North America" },
    { id: 4, label: "Umm Al-Qura, Makkah" },
    { id: 1, label: "University of Islamic Sciences, Karachi" },
    { id: 12, label: "France (UOIF)" },
    { id: 13, label: "Diyanet, Turkey" }
];
let activePrayerUserId = null;
let activePrayerReligion = null;
let prayerSettings = normalizePrayerSettings(null);
let prayerCalculationMethod = 5;
let prayerTimes = null;
let prayerTimesStale = false;
let prayerYesterdayTimes = null;
let prayerTomorrowTimes = null;
let prayerBoundaryRequestKey = "";
let prayerBoundaryRequest = null;
let prayerBoundaryLoadedKey = "";
let prayerBoundaryRetryUntil = 0;
let prayerBoundaryError = "";
let christianPrayerReminders = [];
let prayerPending = null;
let prayerPauseActive = false;
let prayerTicker = null;
let prayerUserDocumentUnsubscribe = null;
let christianReminderUnsubscribe = null;
let prayerModalHeartbeat = null;
let prayerModalLockToken = null;
let prayerFetchToken = 0;
let prayerFetchInProgress = false;
let prayerLastRequestedDate = null;
let prayerSessionRestoreReady = true;
let prayerNextLabelUpdatedMinute = null;

function createPrayerToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

const prayerTabId = createPrayerToken();

function prayerPendingKey(uid) { return `fantzawya_prayer_pending_${uid}`; }
function prayerConfirmedKey(uid) { return `fantzawya_prayer_confirmed_${uid}`; }
function prayerModalLockKey(uid) { return `fantzawya_prayer_modal_lock_${uid}`; }
function prayerCacheKey(uid) { return `fantzawya_prayer_cache_${uid}`; }
function prayerRetryKey(uid) { return `fantzawya_prayer_retry_${uid}`; }
function prayerMethodKey(uid) { return `fantzawya_prayer_method_${uid}`; }
function prayerDateCacheKey(uid, dayKey, settings) {
    return `${prayerCacheKey(uid)}_${encodeURIComponent(getPrayerLocationKey(settings.city, settings.country, settings.method))}_${dayKey}`;
}

function resetPrayerBoundaryState() {
    prayerBoundaryRequestKey = "";
    prayerBoundaryRequest = null;
    prayerBoundaryLoadedKey = "";
    prayerBoundaryRetryUntil = 0;
    prayerBoundaryError = "";
    prayerYesterdayTimes = null;
    prayerTomorrowTimes = null;
}

function readLocalJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.warn("Could not read local prayer reminder state:", error);
        return fallback;
    }
}

function readPrayerPending(uid = activePrayerUserId) {
    if (!uid) return null;
    const pending = readLocalJson(prayerPendingKey(uid));
    if (!pending || pending.uid !== uid || typeof pending.id !== "string" ||
        typeof pending.reminderId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pending.dateKey) ||
        !["muslim", "christian"].includes(pending.kind) ||
        !Number.isFinite(Number(pending.dueAtMs)) || Number(pending.dueAtMs) <= 0) return null;
    return pending;
}

function prayerReminderIsPending() {
    if (!activePrayerUserId) return false;
    const pending = readPrayerPending(activePrayerUserId);
    if (pending) {
        prayerPending = pending;
        prayerPauseActive = true;
        return true;
    }
    return prayerPauseActive && prayerPending?.uid === activePrayerUserId;
}

function setPrayerStatus(text, error = false) {
    const status = document.getElementById("prayerSettingsStatus");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("error", error);
}

function readConfirmedPrayerIds(uid, dayKey) {
    const stored = readLocalJson(prayerConfirmedKey(uid), {});
    const state = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    return new Set(Array.isArray(state?.[dayKey]) ? state[dayKey] : []);
}

function prayerReminderWasConfirmed(uid, dayKey, reminderId) {
    return readConfirmedPrayerIds(uid, dayKey).has(reminderId);
}

function markPrayerReminderConfirmed(pending) {
    const uid = pending.uid;
    const stored = readLocalJson(prayerConfirmedKey(uid), {});
    const state = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const ids = new Set(Array.isArray(state[pending.dateKey]) ? state[pending.dateKey] : []);
    ids.add(pending.reminderId);
    state[pending.dateKey] = [...ids];
    const oldDates = Object.keys(state).sort();
    oldDates.slice(0, Math.max(0, oldDates.length - 10)).forEach(day => delete state[day]);
    localStorage.setItem(prayerConfirmedKey(uid), JSON.stringify(state));
}

function releasePrayerModalLock(expectedToken = null) {
    const token = expectedToken || prayerModalLockToken;
    if (!token) return;
    if (prayerModalLockToken === token) {
        if (prayerModalHeartbeat) clearInterval(prayerModalHeartbeat);
        prayerModalHeartbeat = null;
        prayerModalLockToken = null;
    }
    if (!activePrayerUserId) return;
    const key = prayerModalLockKey(activePrayerUserId);
    const lock = readLocalJson(key);
    if (lock?.token === token) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn("Could not release the prayer modal tab lock:", error);
        }
    }
}

function closePrayerModalWithoutConfirming() {
    const dialog = document.getElementById("prayerReminderDialog");
    if (dialog?.open) dialog.close();
    releasePrayerModalLock();
}

function renderPrayerReminderModal(pending) {
    const dialog = document.getElementById("prayerReminderDialog");
    if (!dialog || !pending) return;
    const title = document.getElementById("prayerReminderTitle");
    const message = document.getElementById("prayerReminderMessage");
    const icon = dialog.querySelector(".prayer-reminder-icon");
    if (pending.kind === "muslim") {
        title.textContent = `حان الآن وقت أذان ${pending.prayerName} 🕌`;
        message.textContent = "حان وقت الصلاة، خُد استراحة وصلّي، وربنا يتقبل منك ❤️";
        if (icon) icon.textContent = "🕌";
    } else {
        title.textContent = "إخواتنا المسيحيين، حان وقت الصلاة ✝️";
        message.textContent = "خُد وقتك في الصلاة والراحة، ربنا يبارك يومك ❤️";
        if (icon) icon.textContent = "✝️";
    }
    if (!dialog.open) dialog.showModal();
}

function tryShowPendingPrayerModal() {
    if (!prayerSessionRestoreReady || !prayerPending || !activePrayerUserId || prayerPending.uid !== activePrayerUserId) return;
    const dialog = document.getElementById("prayerReminderDialog");
    if (!dialog || dialog.open || prayerModalLockToken || document.hidden) return;

    const key = prayerModalLockKey(activePrayerUserId);
    const currentLock = readLocalJson(key);
    if (currentLock?.expiresAt > Date.now() && currentLock.tabId !== prayerTabId) {
        setPrayerStatus("A prayer reminder is waiting for confirmation in another open tab.");
        return;
    }

    const token = createPrayerToken();
    prayerModalLockToken = token;
    const refreshLock = () => {
        localStorage.setItem(key, JSON.stringify({
            uid: activePrayerUserId,
            reminderId: prayerPending?.reminderId,
            pendingId: prayerPending?.id,
            tabId: prayerTabId,
            token,
            expiresAt: Date.now() + 12000
        }));
    };
    let canCoordinateTabs = true;
    try {
        refreshLock();
    } catch (error) {
        canCoordinateTabs = false;
        console.warn("Could not coordinate the prayer modal between tabs:", error);
        setPrayerStatus("This browser cannot synchronize reminder tabs; confirm the reminder in this tab.", true);
    }
    setTimeout(() => {
        const lock = canCoordinateTabs ? readLocalJson(key) : null;
        if (canCoordinateTabs &&
            (lock?.token !== token || prayerPending?.id !== lock.pendingId || prayerPending?.uid !== lock.uid)) {
            releasePrayerModalLock(token);
            return;
        }
        const currentPending = canCoordinateTabs ? readPrayerPending(activePrayerUserId) : prayerPending;
        if (document.hidden || !currentPending || prayerPending?.uid !== activePrayerUserId ||
            prayerPending?.id !== currentPending.id) {
            releasePrayerModalLock(token);
            return;
        }
        renderPrayerReminderModal(prayerPending);
        if (!canCoordinateTabs) return;
        prayerModalHeartbeat = setInterval(() => {
            if (document.hidden || !prayerPending || prayerPending.uid !== activePrayerUserId) {
                closePrayerModalWithoutConfirming();
                return;
            }
            refreshLock();
        }, 4000);
    }, 40);
}

function forcePauseTimerForPrayer(dueAtMs = Date.now()) {
    if (!activeSession || activeSession.status !== "running") return false;
    const phaseStart = Number(activeSession.phaseStartedAtMs) || Number(dueAtMs) || Date.now();
    const pauseAt = Math.min(Date.now(), Math.max(phaseStart, Number(dueAtMs) || Date.now()));
    advanceManualTimer(activeSession, pauseAt);
    if (activeSession.status === "running") {
        activeSession.phaseElapsedBeforePauseMs = getPhaseElapsedMilliseconds(activeSession, pauseAt);
        activeSession.phaseStartedAtMs = null;
        activeSession.pauseStartedAtMs = pauseAt;
        activeSession.status = "paused";
    }
    stopTimerTicker();
    saveLocalSession();
    renderTimerControls();
    updateTimerDisplay();
    setTimerMessage("Study timer paused for your prayer reminder. It will not resume automatically.");
    return true;
}

function createPendingPrayerReminder(reminder) {
    if (!activePrayerUserId || prayerReminderIsPending()) return;
    const pending = {
        ...reminder,
        uid: activePrayerUserId,
        sessionId: activeSession?.id || null,
        createdAt: Date.now()
    };
    prayerPending = pending;
    prayerPauseActive = true;
    try {
        localStorage.setItem(prayerPendingKey(activePrayerUserId), JSON.stringify(pending));
    } catch (error) {
        console.error("Could not persist the pending prayer reminder:", error);
        setPrayerStatus("The reminder is active, but this browser could not persist it locally. Keep this tab open until you confirm.", true);
    }
    forcePauseTimerForPrayer(pending.dueAtMs);
    renderTimerControls();
    tryShowPendingPrayerModal();
}

function confirmPrayerReminder() {
    const pending = prayerPending;
    if (!pending || pending.uid !== activePrayerUserId) return;
    try {
        markPrayerReminderConfirmed(pending);
        const stored = readPrayerPending(activePrayerUserId);
        if (stored?.id === pending.id) localStorage.removeItem(prayerPendingKey(activePrayerUserId));
        prayerPending = null;
        prayerPauseActive = false;
        closePrayerModalWithoutConfirming();
        setPrayerStatus("Reminder confirmed. Your study timer remains paused; resume it when you are ready.");
        renderTimerControls();
    } catch (error) {
        console.error("Could not confirm prayer reminder:", error);
        setPrayerStatus("Could not save your confirmation. The reminder will remain pending; retry.", true);
    }
}

document.getElementById("prayerReminderDialog")?.addEventListener("cancel", event => event.preventDefault());
document.getElementById("prayerReminderConfirm")?.addEventListener("click", confirmPrayerReminder);

function handlePrayerStorageEvent(event) {
    const uid = activePrayerUserId;
    if (!uid) return;
    if (event.key === prayerPendingKey(uid)) {
        const nextPending = event.newValue ? readLocalJson(prayerPendingKey(uid)) : null;
        if (nextPending?.id) {
            prayerPending = nextPending;
            prayerPauseActive = true;
            forcePauseTimerForPrayer(nextPending.dueAtMs);
            renderTimerControls();
            tryShowPendingPrayerModal();
        } else {
            prayerPending = null;
            prayerPauseActive = false;
            closePrayerModalWithoutConfirming();
            renderTimerControls();
        }
        return;
    }

    if (event.key === getTimerStorageKey(uid) && prayerReminderIsPending() && event.newValue) {
        try {
            const incoming = JSON.parse(event.newValue);
            if (!incoming?.id || (activeSession?.id && incoming.id !== activeSession.id)) return;
            activeSession = incoming;
            if (activeSession.status === "running") forcePauseTimerForPrayer(prayerPending.dueAtMs);
            else {
                stopTimerTicker();
                renderTimerControls();
                updateTimerDisplay();
            }
        } catch (error) {
            console.error("Could not synchronize the prayer pause across tabs:", error);
        }
    }
}

window.addEventListener("storage", handlePrayerStorageEvent);
window.addEventListener("beforeunload", releasePrayerModalLock);
document.addEventListener("visibilitychange", () => {
    if (document.hidden && prayerModalLockToken) closePrayerModalWithoutConfirming();
    else if (!document.hidden && prayerReminderIsPending()) tryShowPendingPrayerModal();
});

function getPrayerTimeZone(value) {
    if (typeof value !== "string" || !value) return getLocalStudyTimeZone();
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return value;
    } catch {
        return getLocalStudyTimeZone();
    }
}

function normalizePrayerMethod(value) {
    const method = Number(value);
    return Number.isInteger(method) && method >= 0 && method <= 23 ? method : 5;
}

function getPrayerLocationKey(city, country, method = prayerCalculationMethod) {
    return `${String(city).trim().toLowerCase()}|${String(country).trim().toLowerCase()}|${normalizePrayerMethod(method)}`;
}

function getPrayerApiSettings() {
    return {
        ...normalizePrayerSettings(prayerSettings),
        method: prayerCalculationMethod
    };
}

function readPrayerCalculationMethod(uid, profileSettings) {
    const storedMethod = readLocalJson(prayerMethodKey(uid));
    if (storedMethod !== null) return normalizePrayerMethod(storedMethod);
    return normalizePrayerMethod(profileSettings?.calculationMethod ?? profileSettings?.method ?? 5);
}

function syncPrayerMethodControl() {
    const select = document.getElementById("prayerCalculationMethod");
    if (!select) return;
    const value = String(prayerCalculationMethod);
    if (!select.querySelector(`option[value="${value}"]`)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = PRAYER_CALCULATION_METHODS.find(method => method.id === prayerCalculationMethod)?.label ||
            `AlAdhan method ${value}`;
        select.append(option);
    }
    select.value = value;
}

async function fetchAlAdhanPrayerTimes(dayKey, settings) {
    const url = new URL(`https://api.aladhan.com/v1/timingsByCity/${formatAlAdhanDate(dayKey)}`);
    url.searchParams.set("city", settings.city);
    url.searchParams.set("country", settings.country);
    url.searchParams.set("method", String(settings.method));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Prayer-time service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload.code !== 200 || !payload.data?.timings) {
        throw new Error(payload.status || "Prayer-time service returned an invalid response.");
    }
    const timings = {};
    for (const prayer of MUSLIM_PRAYERS) {
        timings[prayer.key] = parsePrayerClock(payload.data.timings[prayer.key]);
        if (!timings[prayer.key]) throw new Error(`Prayer-time service did not return ${prayer.display}.`);
    }
    timings.Sunrise = parsePrayerClock(payload.data.timings.Sunrise);
    if (!timings.Sunrise) throw new Error("Prayer-time service did not return Sunrise.");
    return {
        timings,
        timeZone: getPrayerTimeZone(payload.data.meta?.timezone)
    };
}

function renderNextPrayerLabel() {
    const nextLabel = document.getElementById("nextPrayerLabel");
    if (!nextLabel) return;

    if (!prayerTimes) {
        nextLabel.textContent = "Today's prayer times are not available yet.";
        return;
    }

    const today = getStudyDayKey(Date.now(), prayerTimes.timeZone);
    if (prayerTimes.dateKey !== today || prayerTimesStale) {
        nextLabel.textContent = "Showing the last successful prayer times; reminders are paused until today's times load.";
    } else {
        const upcoming = MUSLIM_PRAYERS.map(prayer => ({
            ...prayer,
            clock: prayerTimes.timings[prayer.key],
            dueAtMs: zonedClockToMillis(today, prayerTimes.timings[prayer.key], prayerTimes.timeZone)
        })).find(prayer => prayer.dueAtMs > Date.now());
        nextLabel.textContent = upcoming
            ? `Next prayer: ${upcoming.display} at ${upcoming.clock}`
            : "No upcoming prayer today.";
    }
}

function renderPrayerTimes() {
    const list = document.getElementById("prayerTimesList");
    if (!list) return;
    list.replaceChildren();
    renderNextPrayerLabel();

    if (!prayerTimes) {
        list.textContent = "Connect to the internet to load prayer times.";
        return;
    }

    MUSLIM_PRAYERS.forEach(prayer => {
        const row = document.createElement("div");
        row.className = "prayer-time-row";
        const name = document.createElement("strong");
        name.textContent = prayer.display;
        const time = document.createElement("span");
        time.textContent = prayerTimes.timings[prayer.key] || "—";
        row.append(name, time);
        list.append(row);
    });
}

function cachePrayerSchedule(uid, schedule) {
    try {
        localStorage.setItem(
            prayerDateCacheKey(uid, schedule.dateKey, schedule),
            JSON.stringify(schedule)
        );
    } catch (error) {
        console.warn("Could not cache this day's prayer schedule:", error);
    }
}

async function loadPrayerTimes(force = false) {
    const uid = activePrayerUserId;
    if (!uid || activePrayerReligion !== "muslim" || prayerFetchInProgress) return;
    const settings = getPrayerApiSettings();
    const locationKey = getPrayerLocationKey(settings.city, settings.country, settings.method);
    const cache = readLocalJson(prayerCacheKey(uid));
    const sameLocation = cache && getPrayerLocationKey(cache.city, cache.country, cache.method) === locationKey &&
        MUSLIM_PRAYERS.every(prayer => isValidPrayerTime(cache.timings?.[prayer.key])) &&
        isValidPrayerTime(cache.timings?.Sunrise) &&
        typeof cache.timeZone === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cache.dateKey);
    const dateTimeZone = sameLocation ? getPrayerTimeZone(cache.timeZone) : getLocalStudyTimeZone();
    const requestDate = getStudyDayKey(Date.now(), dateTimeZone);

    if (!force && sameLocation && cache.dateKey === requestDate) {
        prayerTimes = cache;
        prayerTimesStale = false;
        prayerLastRequestedDate = requestDate;
        renderPrayerTimes();
        updatePrayerPage();
        return;
    }

    const retry = readLocalJson(prayerRetryKey(uid));
    if (!force && retry?.locationKey === locationKey && retry?.dateKey === requestDate &&
        retry.expiresAt > Date.now()) {
        prayerTimes = sameLocation ? cache : null;
        prayerTimesStale = Boolean(sameLocation && cache.dateKey !== requestDate);
        renderPrayerTimes();
        return;
    }

    const token = ++prayerFetchToken;
    prayerFetchInProgress = true;
    prayerLastRequestedDate = requestDate;
    if (sameLocation) {
        prayerTimes = cache;
        prayerTimesStale = cache.dateKey !== requestDate;
    }
    const status = document.getElementById("prayerTimesStatus");
    if (status) {
        status.textContent = "Loading today's prayer times…";
        status.classList.remove("error");
    }
    renderPrayerTimes();

    try {
        let response = await fetchAlAdhanPrayerTimes(requestDate, settings);
        let cityDate = getStudyDayKey(Date.now(), response.timeZone);
        if (cityDate !== requestDate) {
            response = await fetchAlAdhanPrayerTimes(cityDate, settings);
            cityDate = getStudyDayKey(Date.now(), response.timeZone);
        }
        if (token !== prayerFetchToken || activePrayerUserId !== uid) return;

        prayerTimes = {
            city: settings.city,
            country: settings.country,
            method: settings.method,
            dateKey: cityDate,
            timeZone: response.timeZone,
            timings: response.timings,
            fetchedAt: Date.now()
        };
        prayerTimesStale = prayerTimes.dateKey !== getStudyDayKey(Date.now(), prayerTimes.timeZone);
        try {
            localStorage.setItem(prayerCacheKey(uid), JSON.stringify(prayerTimes));
            localStorage.removeItem(prayerRetryKey(uid));
        } catch (storageError) {
            console.warn("Could not cache prayer times locally:", storageError);
        }
        cachePrayerSchedule(uid, prayerTimes);
        prayerLastRequestedDate = prayerTimes.dateKey;
        if (status) status.textContent = prayerTimesStale
            ? "Prayer times were updated; the city's local date has changed. Refreshing shortly."
            : "Prayer times updated for today.";
        renderPrayerTimes();
        updatePrayerPage();
        checkPrayerReminders();
    } catch (error) {
        if (token !== prayerFetchToken || activePrayerUserId !== uid) return;
        console.error("Could not load AlAdhan prayer times:", error);
        const retryDate = sameLocation ? getStudyDayKey(Date.now(), getPrayerTimeZone(cache.timeZone)) : requestDate;
        try {
            localStorage.setItem(prayerRetryKey(uid), JSON.stringify({
                locationKey,
                dateKey: retryDate,
                expiresAt: Date.now() + 20 * 60 * 1000
            }));
        } catch (storageError) {
            console.warn("Could not persist the prayer-time retry delay:", storageError);
        }
        prayerTimes = sameLocation ? cache : null;
        prayerTimesStale = Boolean(sameLocation && cache.dateKey !== retryDate);
        if (status) {
            status.textContent = sameLocation
                ? "Prayer-time service is unavailable. Showing the last successful times."
                : "Could not load prayer times. Check the city and your internet connection, then retry.";
            status.classList.add("error");
        }
        renderPrayerTimes();
        updatePrayerPage();
    } finally {
        if (token === prayerFetchToken) prayerFetchInProgress = false;
    }
}

function renderChristianPrayerReminders() {
    const list = document.getElementById("christianPrayerReminderList");
    if (!list) return;
    list.replaceChildren();
    if (!christianPrayerReminders.length) {
        list.textContent = "No prayer reminders yet. Add one above.";
        return;
    }

    christianPrayerReminders.forEach(reminder => {
        const row = document.createElement("div");
        row.className = "prayer-reminder-row";
        const details = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = reminder.title;
        const time = document.createElement("small");
        time.textContent = reminder.time;
        details.append(title, time);

        const actions = document.createElement("div");
        actions.className = "prayer-reminder-row-actions";
        const enabledLabel = document.createElement("label");
        enabledLabel.className = "prayer-enabled-toggle";
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = reminder.enabled;
        enabled.setAttribute("aria-label", `Enable ${reminder.title}`);
        enabled.addEventListener("change", () => setChristianReminderEnabled(reminder, enabled.checked, enabled));
        enabledLabel.append(enabled, document.createTextNode("Enabled"));

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "mini-action";
        edit.textContent = "EDIT";
        edit.addEventListener("click", () => beginEditChristianReminder(reminder));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "mini-action danger-action";
        remove.textContent = "DELETE";
        remove.addEventListener("click", () => deleteChristianReminder(reminder));
        actions.append(enabledLabel, edit, remove);
        row.append(details, actions);
        list.append(row);
    });
}

function beginEditChristianReminder(reminder) {
    document.getElementById("editingChristianReminderTime").value = reminder.time;
    document.getElementById("christianPrayerTitle").value = reminder.title;
    document.getElementById("christianPrayerTime").value = reminder.time;
    document.getElementById("saveChristianPrayerReminder").textContent = "SAVE CHANGES";
    document.getElementById("cancelChristianPrayerEdit").hidden = false;
    document.getElementById("christianPrayerTitle").focus();
}

function resetChristianReminderForm() {
    document.getElementById("christianPrayerReminderForm").reset();
    document.getElementById("editingChristianReminderTime").value = "";
    document.getElementById("saveChristianPrayerReminder").textContent = "ADD REMINDER";
    document.getElementById("cancelChristianPrayerEdit").hidden = true;
}

async function saveChristianPrayerReminder(event) {
    event.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || activePrayerReligion !== "christian") return;
    const title = document.getElementById("christianPrayerTitle").value.trim();
    const time = document.getElementById("christianPrayerTime").value;
    const oldTime = document.getElementById("editingChristianReminderTime").value;
    if (!title || title.length > 80 || !isValidPrayerTime(time)) {
        setPrayerStatus("Enter a reminder title and a valid time.", true);
        return;
    }
    const existing = christianPrayerReminders.find(item => item.time === time);
    if (existing && time !== oldTime) {
        setPrayerStatus("A reminder already exists at that time. Choose a different time.", true);
        return;
    }

    const button = document.getElementById("saveChristianPrayerReminder");
    button.disabled = true;
    const reminderRef = doc(db, "users", uid, "prayerReminders", time);
    const oldRef = oldTime ? doc(db, "users", uid, "prayerReminders", oldTime) : null;
    try {
        await runTransaction(db, async transaction => {
            const targetSnapshot = await transaction.get(reminderRef);
            const oldSnapshot = oldRef && oldTime !== time ? await transaction.get(oldRef) : null;
            if (oldRef && oldTime !== time && !oldSnapshot.exists()) {
                throw new Error("This reminder changed in another tab. Refresh the list and retry.");
            }
            if (targetSnapshot.exists() && oldTime !== time) {
                throw new Error("A reminder already exists at that time.");
            }
            const existingReminder = oldTime
                ? christianPrayerReminders.find(item => item.time === oldTime)
                : null;
            if (oldRef && oldTime !== time) transaction.delete(oldRef);
            transaction.set(reminderRef, {
                title,
                time,
                enabled: existingReminder?.enabled !== false,
                updatedAt: serverTimestamp()
            });
        });
        resetChristianReminderForm();
        setPrayerStatus("Prayer reminder saved.");
    } catch (error) {
        console.error("Could not save Christian prayer reminder:", error);
        setPrayerStatus(error.code === "permission-denied"
            ? "Firestore denied this reminder. Publish the current Firestore Rules."
            : `Could not save reminder (${error.code || "error"}): ${error.message || "Try again."}`, true);
    } finally {
        button.disabled = false;
    }
}

async function setChristianReminderEnabled(reminder, enabled, input) {
    const uid = auth.currentUser?.uid;
    if (!uid || activePrayerReligion !== "christian") return;
    input.disabled = true;
    try {
        await updateDoc(doc(db, "users", uid, "prayerReminders", reminder.time), {
            enabled,
            updatedAt: serverTimestamp()
        });
        setPrayerStatus(enabled ? "Reminder enabled." : "Reminder disabled.");
    } catch (error) {
        console.error("Could not update Christian prayer reminder:", error);
        input.checked = reminder.enabled !== false;
        setPrayerStatus(`Could not update reminder (${error.code || "error"}).`, true);
    } finally {
        input.disabled = false;
    }
}

async function deleteChristianReminder(reminder) {
    const uid = auth.currentUser?.uid;
    if (!uid || activePrayerReligion !== "christian") return;
    try {
        await deleteDoc(doc(db, "users", uid, "prayerReminders", reminder.time));
        setPrayerStatus("Prayer reminder deleted.");
    } catch (error) {
        console.error("Could not delete Christian prayer reminder:", error);
        setPrayerStatus(`Could not delete reminder (${error.code || "error"}).`, true);
    }
}

function subscribeToChristianPrayerReminders(uid) {
    if (christianReminderUnsubscribe) christianReminderUnsubscribe();
    christianReminderUnsubscribe = null;
    christianPrayerReminders = [];
    if (activePrayerReligion !== "christian") {
        renderChristianPrayerReminders();
        return;
    }

    christianReminderUnsubscribe = onSnapshot(collection(db, "users", uid, "prayerReminders"), snapshot => {
        if (activePrayerUserId !== uid || activePrayerReligion !== "christian") return;
        christianPrayerReminders = snapshot.docs.map(item => {
            const data = item.data();
            return {
                id: item.id,
                ...data,
                enabled: data.enabled !== false
            };
        }).filter(item => isValidPrayerTime(item.time) && typeof item.title === "string")
            .sort((a, b) => a.time.localeCompare(b.time));
        renderChristianPrayerReminders();
        checkPrayerReminders();
    }, error => {
        console.error("Could not synchronize Christian prayer reminders:", error);
        setPrayerStatus(`Could not load prayer reminders (${error.code || "error"}).`, true);
    });
}

function renderPrayerSettings() {
    const muslimSettings = document.getElementById("muslimPrayerSettings");
    const christianSettings = document.getElementById("christianPrayerSettings");
    const description = document.getElementById("prayerReligionDescription");
    const isMuslim = activePrayerReligion === "muslim";
    const isChristian = activePrayerReligion === "christian";
    if (muslimSettings) muslimSettings.hidden = !isMuslim;
    if (christianSettings) christianSettings.hidden = !isChristian;
    if (description) {
        description.textContent = isMuslim
            ? "Daily prayer times are calculated for your selected city and kept private to your account."
            : isChristian
                ? "Create private prayer reminders using your device's local time."
                : "Choose a religion in your profile to configure prayer reminders.";
    }
    document.getElementById("prayerCityInput").value = prayerSettings.city;
    document.getElementById("prayerCountryInput").value = prayerSettings.country;
    document.getElementById("muslimPrayerEnabled").checked = prayerSettings.enabled;
    renderPrayerTimes();
    renderChristianPrayerReminders();
}

function synchronizePrayerProfile(data, uid) {
    if (activePrayerUserId !== uid) return;
    const oldReligion = activePrayerReligion;
    const oldSettings = prayerSettings;
    if (isValidReligion(data.religion)) activePrayerReligion = data.religion;
    prayerSettings = normalizePrayerSettings(data.prayerSettings);
    const religionChanged = oldReligion !== activePrayerReligion;
    const settingsChanged = oldSettings.city !== prayerSettings.city ||
        oldSettings.country !== prayerSettings.country ||
        oldSettings.enabled !== prayerSettings.enabled;
    if (currentProfile) currentProfile = {
        ...currentProfile,
        religion: activePrayerReligion,
        prayerSettings
    };
    updatePrayerNavigationVisibility();
    if (!religionChanged && !settingsChanged) return;
    renderPrayerSettings();
    if (religionChanged) {
        prayerFetchToken += 1;
        prayerFetchInProgress = false;
        prayerLastRequestedDate = null;
        prayerTimes = null;
        prayerTimesStale = false;
        resetPrayerBoundaryState();
        subscribeToChristianPrayerReminders(uid);
        if (activePrayerReligion === "muslim") {
            loadPrayerTimes();
        }
    } else if (activePrayerReligion === "muslim" &&
        (oldSettings.city !== prayerSettings.city || oldSettings.country !== prayerSettings.country)) {
        prayerLastRequestedDate = null;
        prayerTimes = null;
        prayerTimesStale = false;
        resetPrayerBoundaryState();
        prayerFetchToken += 1;
        prayerFetchInProgress = false;
        loadPrayerTimes(true);
    } else if (activePrayerReligion === "muslim" && !prayerTimes) {
        loadPrayerTimes();
    }
}

function initializePrayerReminderSystem(uid, profile) {
    if (auth.currentUser?.uid !== uid) return;
    if (prayerTicker) clearInterval(prayerTicker);
    if (prayerUserDocumentUnsubscribe) prayerUserDocumentUnsubscribe();
    prayerUserDocumentUnsubscribe = null;
    if (christianReminderUnsubscribe) christianReminderUnsubscribe();
    christianReminderUnsubscribe = null;
    prayerFetchToken += 1;
    prayerFetchInProgress = false;
    prayerLastRequestedDate = null;

    activePrayerUserId = uid;
    activePrayerReligion = profile.religion;
    prayerSettings = normalizePrayerSettings(profile.prayerSettings);
    prayerCalculationMethod = readPrayerCalculationMethod(uid, profile.prayerSettings);
    prayerTimes = null;
    prayerTimesStale = false;
    resetPrayerBoundaryState();
    prayerPending = readPrayerPending(uid);
    prayerPauseActive = Boolean(prayerPending);
    prayerSessionRestoreReady = false;
    renderPrayerSettings();

    prayerUserDocumentUnsubscribe = onSnapshot(doc(db, "users", uid), snapshot => {
        if (!snapshot.exists()) return;
        synchronizePrayerProfile(snapshot.data(), uid);
    }, error => {
        console.error("Could not synchronize prayer settings:", error);
        setPrayerStatus(`Could not sync prayer settings (${error.code || "error"}).`, true);
    });
    subscribeToChristianPrayerReminders(uid);
    if (activePrayerReligion === "muslim") loadPrayerTimes();
    prayerTicker = setInterval(() => {
        checkPrayerReminders();
        updatePrayerPage();
    }, 1000);
    if (prayerPending) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        tryShowPendingPrayerModal();
    }
    checkPrayerReminders();
}

function stopPrayerReminderSystem() {
    if (prayerTicker) clearInterval(prayerTicker);
    prayerTicker = null;
    if (prayerUserDocumentUnsubscribe) prayerUserDocumentUnsubscribe();
    if (christianReminderUnsubscribe) christianReminderUnsubscribe();
    prayerUserDocumentUnsubscribe = null;
    christianReminderUnsubscribe = null;
    prayerFetchToken += 1;
    prayerFetchInProgress = false;
    closePrayerModalWithoutConfirming();
    activePrayerUserId = null;
    activePrayerReligion = null;
    prayerPending = null;
    prayerPauseActive = false;
    prayerSessionRestoreReady = true;
    prayerTimes = null;
    prayerTimesStale = false;
    resetPrayerBoundaryState();
    christianPrayerReminders = [];
}

function markPrayerSessionRestoreReady(uid) {
    if (activePrayerUserId !== uid) return;
    prayerSessionRestoreReady = true;
    if (prayerReminderIsPending()) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        tryShowPendingPrayerModal();
    }
}

async function saveMuslimPrayerSettings() {
    const uid = auth.currentUser?.uid;
    if (!uid || activePrayerReligion !== "muslim") return;
    const city = document.getElementById("prayerCityInput").value.trim();
    const country = document.getElementById("prayerCountryInput").value.trim();
    if (!city || !country || city.length > 80 || country.length > 80) {
        setPrayerStatus("Enter a valid city and country (up to 80 characters each).", true);
        return;
    }
    const nextSettings = {
        city,
        country,
        enabled: document.getElementById("muslimPrayerEnabled").checked
    };
    const button = document.getElementById("saveMuslimPrayerSettings");
    button.disabled = true;
    try {
        await updateDoc(doc(db, "users", uid), { prayerSettings: nextSettings });
        currentProfile = { ...currentProfile, prayerSettings: nextSettings };
        const locationChanged = getPrayerLocationKey(city, country) !==
            getPrayerLocationKey(prayerSettings.city, prayerSettings.country);
        prayerSettings = nextSettings;
        setPrayerStatus("Prayer settings saved.");
        renderPrayerSettings();
        if (locationChanged) {
            prayerLastRequestedDate = null;
            prayerTimes = null;
            prayerTimesStale = false;
            prayerFetchToken += 1;
            prayerFetchInProgress = false;
            resetPrayerBoundaryState();
            await loadPrayerTimes(true);
        }
    } catch (error) {
        console.error("Could not save Muslim prayer settings:", error);
        setPrayerStatus(error.code === "permission-denied"
            ? "Firestore denied this update. Publish the current Firestore Rules."
            : `Could not save prayer settings (${error.code || "error"}).`, true);
    } finally {
        button.disabled = false;
    }
}

function getPrayerDueAt(dateKey, clock, timeZone) {
    return timeZone
        ? zonedClockToMillis(dateKey, clock, timeZone)
        : localClockToMillis(dateKey, clock);
}

function checkPrayerReminders() {
    if (!activePrayerUserId || !isValidReligion(activePrayerReligion)) return;
    if (prayerReminderIsPending()) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        if (prayerSessionRestoreReady) tryShowPendingPrayerModal();
        return;
    }

    const now = Date.now();
    if (activePrayerReligion === "muslim") {
        const minute = Math.floor(now / 60000);
        if (minute !== prayerNextLabelUpdatedMinute) {
            prayerNextLabelUpdatedMinute = minute;
            renderNextPrayerLabel();
        }
        const timeZone = prayerTimes?.timeZone || getLocalStudyTimeZone();
        const today = getStudyDayKey(now, timeZone);
        if (prayerLastRequestedDate !== today && !prayerFetchInProgress) {
            loadPrayerTimes();
        }
        if (!prayerSettings.enabled || !prayerTimes || prayerTimesStale || prayerTimes.dateKey !== today) return;
        for (const prayer of MUSLIM_PRAYERS) {
            const dueAtMs = getPrayerDueAt(today, prayerTimes.timings[prayer.key], prayerTimes.timeZone);
            const reminderId = `muslim-${prayer.key.toLowerCase()}`;
            if (now >= dueAtMs && now - dueAtMs <= 120000 &&
                !prayerReminderWasConfirmed(activePrayerUserId, today, reminderId)) {
                createPendingPrayerReminder({
                    id: `${today}|${reminderId}`,
                    dateKey: today,
                    reminderId,
                    kind: "muslim",
                    prayerName: prayer.name,
                    dueAtMs
                });
                return;
            }
        }
        return;
    }

    const today = getStudyDayKey(now, getLocalStudyTimeZone());
    for (const reminder of christianPrayerReminders) {
        if (reminder.enabled === false || !isValidPrayerTime(reminder.time)) continue;
        const dueAtMs = localClockToMillis(today, reminder.time);
        const reminderId = `christian-${reminder.time}`;
        if (now >= dueAtMs && now - dueAtMs <= 120000 &&
            !prayerReminderWasConfirmed(activePrayerUserId, today, reminderId)) {
            createPendingPrayerReminder({
                id: `${today}|${reminderId}`,
                dateKey: today,
                reminderId,
                kind: "christian",
                prayerName: reminder.title,
                dueAtMs
            });
            return;
        }
    }
}

function formatPrayerClockForDisplay(timestamp, timeZone, includeSeconds = false) {
    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        ...(includeSeconds ? { second: "2-digit" } : {})
    }).format(new Date(timestamp));
}

function formatPrayerElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
    return days ? `${days}d ${clock}` : clock;
}

function isCompletePrayerSchedule(schedule, settings, dayKey) {
    return schedule?.dateKey === dayKey &&
        getPrayerLocationKey(schedule.city, schedule.country, schedule.method) ===
            getPrayerLocationKey(settings.city, settings.country, settings.method) &&
        typeof schedule.timeZone === "string" &&
        MUSLIM_PRAYERS.every(prayer => isValidPrayerTime(schedule.timings?.[prayer.key])) &&
        isValidPrayerTime(schedule.timings?.Sunrise);
}

async function loadPrayerScheduleForDate(dayKey, settings) {
    const uid = activePrayerUserId;
    if (!uid) throw new Error("Sign in to load prayer times.");
    const cacheKey = prayerDateCacheKey(uid, dayKey, settings);
    const cached = readLocalJson(cacheKey);
    if (isCompletePrayerSchedule(cached, settings, dayKey)) return cached;

    const response = await fetchAlAdhanPrayerTimes(dayKey, settings);
    const schedule = {
        city: settings.city,
        country: settings.country,
        method: settings.method,
        dateKey: dayKey,
        timeZone: response.timeZone,
        timings: response.timings,
        fetchedAt: Date.now()
    };
    try {
        localStorage.setItem(cacheKey, JSON.stringify(schedule));
    } catch (error) {
        console.warn("Could not cache adjacent-day prayer times:", error);
    }
    return schedule;
}

function ensurePrayerBoundaryTimes(today, now) {
    if (!prayerTimes || prayerTimes.dateKey !== today || prayerTimesStale) return;
    const uid = activePrayerUserId;
    if (!uid) return;
    const settings = getPrayerApiSettings();
    const fajrAt = zonedClockToMillis(today, prayerTimes.timings.Fajr, prayerTimes.timeZone);
    const ishaAt = zonedClockToMillis(today, prayerTimes.timings.Isha, prayerTimes.timeZone);
    const previousDate = now < fajrAt ? shiftPrayerDate(today, -1) : null;
    const nextDate = now >= ishaAt ? shiftPrayerDate(today, 1) : null;
    const requestKey = [
        activePrayerUserId,
        getPrayerLocationKey(settings.city, settings.country, settings.method),
        previousDate || "",
        nextDate || ""
    ].join("|");
    if (requestKey === prayerBoundaryRequestKey &&
        (prayerBoundaryRequest || prayerBoundaryLoadedKey === requestKey ||
            prayerBoundaryRetryUntil > Date.now())) return;

    prayerBoundaryRequestKey = requestKey;
    prayerBoundaryLoadedKey = "";
    prayerBoundaryRetryUntil = 0;
    prayerBoundaryError = "";
    prayerYesterdayTimes = null;
    prayerTomorrowTimes = null;
    if (!previousDate && !nextDate) {
        prayerBoundaryLoadedKey = requestKey;
        return;
    }

    prayerBoundaryRequest = (async () => {
        try {
            const [yesterday, tomorrow] = await Promise.all([
                previousDate ? loadPrayerScheduleForDate(previousDate, settings) : null,
                nextDate ? loadPrayerScheduleForDate(nextDate, settings) : null
            ]);
            if (requestKey !== prayerBoundaryRequestKey || activePrayerUserId !== uid) return;
            prayerYesterdayTimes = yesterday;
            prayerTomorrowTimes = tomorrow;
            prayerBoundaryLoadedKey = requestKey;
            updatePrayerPage();
        } catch (error) {
            if (requestKey !== prayerBoundaryRequestKey) return;
            console.error("Could not load adjacent-day prayer times:", error);
            prayerBoundaryRetryUntil = Date.now() + 5 * 60 * 1000;
            prayerBoundaryError = "Some previous/next-day times are unavailable. Check your connection and try again.";
            updatePrayerPage();
        } finally {
            if (requestKey === prayerBoundaryRequestKey) prayerBoundaryRequest = null;
        }
    })();
}

function renderPrayerSchedule(schedule, timeZone) {
    const list = document.getElementById("prayerScheduleList");
    list.replaceChildren();
    schedule.forEach(entry => {
        const row = document.createElement("li");
        row.className = `prayer-schedule-item ${entry.passed ? "is-passed" : "is-upcoming"}${entry.next ? " is-next" : ""}${entry.informational ? " is-informational" : ""}`;
        const details = document.createElement("div");
        details.className = "prayer-schedule-details";
        const name = document.createElement("strong");
        name.textContent = entry.informational ? "Sunrise" : MUSLIM_PRAYERS.find(prayer => prayer.key === entry.key)?.display || entry.key;
        const label = document.createElement("small");
        label.textContent = entry.informational ? "Informational" : entry.next ? "Next prayer" : entry.passed ? "Passed" : "Upcoming";
        details.append(name, label);
        const time = document.createElement("time");
        time.dateTime = `${entry.dateKey}T${entry.time}`;
        time.textContent = formatPrayerClockForDisplay(entry.dueAtMs, timeZone);
        row.append(details, time);
        list.append(row);
    });
}

function updatePrayerPage() {
    const page = document.getElementById("page-prayers");
    if (!page || !page.classList.contains("active") || activePrayerReligion !== "muslim") return;
    const cityLabel = document.getElementById("prayerPageCity");
    const timezoneLabel = document.getElementById("prayerPageTimezone");
    const dateLabel = document.getElementById("prayerPageDate");
    const status = document.getElementById("prayerPageStatus");
    const scheduleList = document.getElementById("prayerScheduleList");
    const now = Date.now();
    const timeZone = prayerTimes?.timeZone || getLocalStudyTimeZone();
    const today = getStudyDayKey(now, timeZone);

    cityLabel.textContent = `${prayerSettings.city}, ${prayerSettings.country}`;
    timezoneLabel.textContent = `Times shown in ${timeZone}`;
    dateLabel.textContent = new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "full"
    }).format(new Date(now));
    document.getElementById("prayerCurrentTime").textContent =
        formatPrayerClockForDisplay(now, timeZone, true);
    syncPrayerMethodControl();

    if (!prayerTimes) {
        status.textContent = document.getElementById("prayerTimesStatus")?.textContent ||
            "Loading today's prayer schedule…";
        status.classList.toggle("error", Boolean(document.getElementById("prayerTimesStatus")?.classList.contains("error")));
        document.getElementById("prayerNextName").textContent = "Unavailable";
        document.getElementById("prayerNextTime").textContent = "--:--";
        document.getElementById("prayerNextCountdown").textContent = "--:--:--";
        document.getElementById("prayerPreviousName").textContent = "Unavailable";
        document.getElementById("prayerPreviousTime").textContent = "--:--";
        document.getElementById("prayerSincePrevious").textContent = "--:--:--";
        scheduleList.replaceChildren();
        const placeholder = document.createElement("li");
        placeholder.className = "prayer-schedule-placeholder";
        placeholder.textContent = "No prayer times are available yet.";
        scheduleList.append(placeholder);
        return;
    }

    if (prayerTimes.dateKey !== today || prayerTimesStale) {
        status.textContent = document.getElementById("prayerTimesStatus")?.textContent ||
            "Today's prayer times are being refreshed. The displayed cached schedule may be outdated.";
        status.classList.add("error");
        document.getElementById("prayerNextName").textContent = "Updating…";
        document.getElementById("prayerNextTime").textContent = "--:--";
        document.getElementById("prayerNextCountdown").textContent = "--:--:--";
        document.getElementById("prayerPreviousName").textContent = "Updating…";
        document.getElementById("prayerPreviousTime").textContent = "--:--";
        document.getElementById("prayerSincePrevious").textContent = "--:--:--";
        renderPrayerSchedule(
            buildPrayerTimeline({
                nowMs: now,
                dateKey: prayerTimes.dateKey,
                timeZone: prayerTimes.timeZone,
                todayTimings: prayerTimes.timings
            }).schedule,
            prayerTimes.timeZone
        );
        return;
    }

    ensurePrayerBoundaryTimes(today, now);
    const timeline = buildPrayerTimeline({
        nowMs: now,
        dateKey: today,
        timeZone,
        todayTimings: prayerTimes.timings,
        previousDayTimings: prayerYesterdayTimes?.dateKey === shiftPrayerDate(today, -1)
            ? prayerYesterdayTimes.timings
            : null,
        nextDayTimings: prayerTomorrowTimes?.dateKey === shiftPrayerDate(today, 1)
            ? prayerTomorrowTimes.timings
            : null
    });
    const apiStatus = document.getElementById("prayerTimesStatus");
    status.textContent = prayerBoundaryError || apiStatus?.textContent || "Prayer schedule is up to date.";
    status.classList.toggle("error", Boolean(prayerBoundaryError || apiStatus?.classList.contains("error")));
    if (timeline.nextPrayer) {
        const nextName = MUSLIM_PRAYERS.find(prayer => prayer.key === timeline.nextPrayer.key)?.display || timeline.nextPrayer.key;
        document.getElementById("prayerNextName").textContent =
            `${nextName}${timeline.nextPrayer.dateKey !== today ? " • Tomorrow" : ""}`;
        document.getElementById("prayerNextTime").textContent =
            formatPrayerClockForDisplay(timeline.nextPrayer.dueAtMs, timeZone);
        document.getElementById("prayerNextCountdown").textContent =
            formatPrayerElapsed(timeline.nextPrayer.dueAtMs - now);
    } else {
        document.getElementById("prayerNextName").textContent =
            prayerBoundaryRequest ? "Loading tomorrow's Fajr…" : "Next prayer unavailable";
        document.getElementById("prayerNextTime").textContent = "--:--";
        document.getElementById("prayerNextCountdown").textContent = "--:--:--";
    }
    if (timeline.previousPrayer) {
        const previousName = MUSLIM_PRAYERS.find(prayer => prayer.key === timeline.previousPrayer.key)?.display || timeline.previousPrayer.key;
        document.getElementById("prayerPreviousName").textContent =
            `${previousName}${timeline.previousPrayer.dateKey !== today ? " • Yesterday" : ""}`;
        document.getElementById("prayerPreviousTime").textContent =
            formatPrayerClockForDisplay(timeline.previousPrayer.dueAtMs, timeZone);
        document.getElementById("prayerSincePrevious").textContent =
            formatPrayerElapsed(now - timeline.previousPrayer.dueAtMs);
    } else {
        document.getElementById("prayerPreviousName").textContent =
            prayerBoundaryRequest ? "Loading yesterday's Isha…" : "Previous prayer unavailable";
        document.getElementById("prayerPreviousTime").textContent = "--:--";
        document.getElementById("prayerSincePrevious").textContent = "--:--:--";
    }
    renderPrayerSchedule(timeline.schedule, timeZone);
}

async function selectPrayerCalculationMethod() {
    const uid = activePrayerUserId;
    if (!uid || activePrayerReligion !== "muslim") return;
    const nextMethod = normalizePrayerMethod(document.getElementById("prayerCalculationMethod").value);
    if (nextMethod === prayerCalculationMethod) return;
    prayerCalculationMethod = nextMethod;
    try {
        localStorage.setItem(prayerMethodKey(uid), JSON.stringify(nextMethod));
    } catch (error) {
        console.warn("Could not persist the selected prayer calculation method:", error);
        setPrayerStatus("Method changed for this session, but this browser could not save the preference.", true);
    }
    prayerFetchToken += 1;
    prayerFetchInProgress = false;
    prayerLastRequestedDate = null;
    prayerTimes = null;
    prayerTimesStale = false;
    resetPrayerBoundaryState();
    const pageStatus = document.getElementById("prayerPageStatus");
    pageStatus.textContent = "Loading times for the selected calculation method…";
    pageStatus.classList.remove("error");
    renderPrayerTimes();
    updatePrayerPage();
    await loadPrayerTimes(true);
}

document.getElementById("saveMuslimPrayerSettings")?.addEventListener("click", saveMuslimPrayerSettings);
document.getElementById("christianPrayerReminderForm")?.addEventListener("submit", saveChristianPrayerReminder);
document.getElementById("cancelChristianPrayerEdit")?.addEventListener("click", resetChristianReminderForm);
document.getElementById("prayerCalculationMethod")?.addEventListener("change", selectPrayerCalculationMethod);

/* EXTERNAL PROFILE PHOTO URL: no Firebase Storage required */

async function reauthenticateCurrentUser(password) {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("Please sign in again.");
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return user;
}

/* CHANGE EMAIL */
const changeEmailBtn = document.getElementById("changeEmailBtn");
if (changeEmailBtn) changeEmailBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    const newEmail = document.getElementById("newEmail").value.trim().toLowerCase();
    const password = document.getElementById("emailCurrentPassword").value;

    if (!user) return;
    if (!newEmail || !password) {
        setInlineStatus("emailStatus", "Enter the new email and your current password.", true);
        return;
    }
    if (newEmail === user.email) {
        setInlineStatus("emailStatus", "This is already your current email.", true);
        return;
    }

    changeEmailBtn.disabled = true;
    changeEmailBtn.textContent = "UPDATING...";

    try {
        await reauthenticateCurrentUser(password);
        await updateEmail(user, newEmail);
        await getIdToken(user, true);
        await updateDoc(doc(db, "users", user.uid), { email: newEmail });
        currentProfile = { ...currentProfile, email: newEmail };
        document.getElementById("profileEmail").textContent = newEmail;
        document.getElementById("emailCurrentPassword").value = "";
        setInlineStatus("emailStatus", "Email updated successfully. Check your new inbox if Firebase requests verification.");
    } catch (error) {
        console.error("Email update error:", error);
        const message = error.code === "auth/requires-recent-login"
            ? "Please log in again, then retry changing your email."
            : error.code === "auth/email-already-in-use"
                ? "This email is already used by another account."
                : error.code === "auth/invalid-credential"
                    ? "Your current password is incorrect."
                    : (error.message || "Could not update email.");
        setInlineStatus("emailStatus", message, true);
    } finally {
        changeEmailBtn.disabled = false;
        changeEmailBtn.textContent = "UPDATE EMAIL";
    }
});

/* CHANGE PASSWORD */
const changePasswordBtn = document.getElementById("changePasswordBtn");
if (changePasswordBtn) changePasswordBtn.addEventListener("click", async () => {
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        setInlineStatus("passwordStatus", "Complete all password fields.", true);
        return;
    }
    if (newPassword.length < 6) {
        setInlineStatus("passwordStatus", "New password must be at least 6 characters.", true);
        return;
    }
    if (newPassword !== confirmPassword) {
        setInlineStatus("passwordStatus", "New passwords do not match.", true);
        return;
    }
    if (currentPassword === newPassword) {
        setInlineStatus("passwordStatus", "Choose a password different from your current one.", true);
        return;
    }

    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = "UPDATING...";

    try {
        const user = await reauthenticateCurrentUser(currentPassword);
        await updatePassword(user, newPassword);
        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("confirmNewPassword").value = "";
        setInlineStatus("passwordStatus", "Password changed successfully.");
    } catch (error) {
        console.error("Password update error:", error);
        const message = error.code === "auth/requires-recent-login"
            ? "Please log in again, then retry changing your password."
            : error.code === "auth/weak-password"
                ? "Choose a stronger password with at least 6 characters."
                : error.code === "auth/invalid-credential"
                    ? "Your current password is incorrect."
                    : (error.message || "Could not change password.");
        setInlineStatus("passwordStatus", message, true);
    } finally {
        changePasswordBtn.disabled = false;
        changePasswordBtn.textContent = "CHANGE PASSWORD";
    }
});

const findFriendBtn = document.getElementById("findFriendBtn");
if (findFriendBtn) findFriendBtn.addEventListener("click", searchFriend);
document.getElementById("friendUsernameInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") searchFriend();
});

async function searchFriend() {
    const user = auth.currentUser;
    const username = normalizeUsername(document.getElementById("friendUsernameInput").value);
    const result = document.getElementById("friendSearchResult");
    result.replaceChildren();
    if (!username) { result.textContent = "Enter a username first."; return; }
    if (username.toLowerCase() === (currentProfile?.username || "").toLowerCase()) { result.textContent = "That's your own username."; return; }
    findFriendBtn.disabled = true;
    findFriendBtn.textContent = "SEARCHING...";
    try {
        const matches = await getDocs(query(collection(db, "publicProfiles"), where("usernameLower", "==", username.toLowerCase())));
        const found = matches.docs.find(item => item.id !== user.uid);
        if (!found) { result.textContent = "No member found with that username."; return; }
        const person = found.data();
        const card = document.createElement("div"); card.className = "friend-person-row";
        const avatar = document.createElement("div"); avatar.className = "friend-avatar";
        if (person.avatarUrl) { avatar.style.backgroundImage = `url("${person.avatarUrl}")`; avatar.classList.add("has-photo"); }
        else avatar.textContent = (person.username || "U").charAt(0).toUpperCase();
        const name = document.createElement("strong"); name.textContent = person.username;
        if (person.isOwner === true) appendOwnerTag(name, "👑 OWNER");
        const add = document.createElement("button"); add.type = "button"; add.className = "community-action-btn"; add.textContent = "ADD FRIEND";
        add.addEventListener("click", () => sendFriendRequest(person, add));
        card.append(avatar, name, add); result.append(card);
    } catch (error) {
        console.error("Friend search error:", error);
        result.textContent = error.code === "permission-denied" ? "Firestore denied the search. Publish the updated Rules." : error.message;
    } finally {
        findFriendBtn.disabled = false; findFriendBtn.textContent = "SEARCH";
    }
}

async function sendFriendRequest(person, button) {
    const user = auth.currentUser;
    button.disabled = true;
    try {
        const existingA = await runFirestoreOperation("query friendRequests sent by the current user", () =>
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", user.uid), where("recipientUid", "==", person.uid))));
        const existingB = await runFirestoreOperation("query friendRequests received from this user", () =>
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", person.uid), where("recipientUid", "==", user.uid))));
        if ([...existingA.docs, ...existingB.docs].some(item => ["pending", "accepted"].includes(item.data().status))) {
            button.textContent = "REQUEST EXISTS"; return false;
        }
        await runFirestoreOperation("create friendRequests/{requestId}", () => addDoc(collection(db, "friendRequests"), {
            senderUid: user.uid,
            senderUsername: currentProfile.username,
            senderAvatarUrl: currentProfile.avatarUrl || "",
            recipientUid: person.uid,
            recipientUsername: person.username,
            recipientAvatarUrl: person.avatarUrl || "",
            status: "pending",
            createdAt: serverTimestamp()
        }));
        button.textContent = "REQUEST SENT";
        await loadFriends(user.uid);
        return true;
    } catch (error) {
        console.error("Friend request operation failed:", { code: error.code || "unknown", message: error.message || String(error), error });
        button.disabled = false;
        appAlert(error.code === "permission-denied" ? "Firestore denied this request. Publish the updated Rules." : error.message);
    }
}

async function loadFriends(uid) {
    const requestsList = document.getElementById("friendRequestsList");
    const friendsList = document.getElementById("friendsList");
    if (!requestsList || !friendsList || auth.currentUser?.uid !== uid) return;
    requestsList.textContent = "Loading requests...";
    friendsList.textContent = "Loading friends...";
    try {
        const requestQueries = [
            ["incoming pending", query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "pending"))],
            ["outgoing pending", query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "pending"))],
            ["incoming accepted", query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "accepted"))],
            ["outgoing accepted", query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "accepted"))]
        ];
        const [incoming, outgoing, acceptedA, acceptedB] = await Promise.all(requestQueries.map(async ([name, requestQuery]) => {
            return runFirestoreOperation(`query friendRequests (${name}, current user is filtered as recipientUid or senderUid)`,
                () => getDocs(requestQuery));
        }));
        if (auth.currentUser?.uid !== uid) return;
        requestsList.replaceChildren();
        const requestDocs = [...incoming.docs.map(d => ({ doc: d, incoming: true })), ...outgoing.docs.map(d => ({ doc: d, incoming: false }))];
        if (!requestDocs.length) requestsList.textContent = "No pending friend requests.";
        requestDocs.forEach(({ doc: requestDoc, incoming: isIncoming }) => {
            const data = requestDoc.data();
            const row = document.createElement("div"); row.className = "friend-list-row";
            const title = document.createElement("strong"); title.textContent = isIncoming ? data.senderUsername : data.recipientUsername;
            const actions = document.createElement("div"); actions.className = "friend-row-actions";
            if (isIncoming) {
                const accept = document.createElement("button"); accept.className = "mini-action accept"; accept.textContent = "ACCEPT";
                accept.addEventListener("click", () => respondToFriendRequest(requestDoc.id, "accepted"));
                const reject = document.createElement("button"); reject.className = "mini-action"; reject.textContent = "DECLINE";
                reject.addEventListener("click", () => respondToFriendRequest(requestDoc.id, "rejected"));
                actions.append(accept, reject);
            } else { const pending = document.createElement("small"); pending.textContent = "PENDING"; actions.append(pending); }
            row.append(title, actions); requestsList.append(row);
        });
        friendsList.replaceChildren();
        const friendUids = [...new Set([
            ...acceptedA.docs.map(d => d.data().senderUid === uid ? d.data().recipientUid : d.data().senderUid),
            ...acceptedB.docs.map(d => d.data().senderUid === uid ? d.data().recipientUid : d.data().senderUid)
        ])];
        if (!friendUids.length) friendsList.textContent = "No friends yet. Search for a username to add someone!";
        const publicProfiles = await Promise.all(friendUids.map(friendUid =>
            runFirestoreOperation("read publicProfiles/{friendUid} for Friends",
                () => getDoc(doc(db, "publicProfiles", friendUid)))));
        const favoriteSnapshots = await Promise.all(friendUids.map(friendUid =>
            runFirestoreOperation("read users/{uid}/friendSettings/{friendUid}",
                () => getDoc(doc(db, "users", uid, "friendSettings", friendUid)))));
        publicProfiles.forEach((profileSnap, index) => {
            if (!profileSnap.exists()) return;
            const person = { ...profileSnap.data(), uid: friendUids[index] };
            const isFavorite = favoriteSnapshots[index].exists() && favoriteSnapshots[index].data().favorite === true;
            const row = document.createElement("div"); row.className = "friend-list-row friend-profile-row";
            const identity = document.createElement("button"); identity.type = "button"; identity.className = "friend-profile-open";
            const avatar = document.createElement("div"); avatar.className = "friend-avatar";
            if (person.avatarUrl) { avatar.style.backgroundImage = `url("${String(person.avatarUrl).replace(/["\\]/g, "")}")`; avatar.classList.add("has-photo"); }
            else avatar.textContent = (person.username || "U").charAt(0).toUpperCase();
            const details = document.createElement("span"); details.className = "friend-identity-text";
            const label = document.createElement("strong"); label.textContent = person.username || "Friend";
            if (person.isOwner === true) appendOwnerTag(label, "👑 OWNER");
            if (person.isOwner === true) avatar.classList.add("owner-avatar");
            const handle = document.createElement("small"); handle.textContent = `@${person.username || "member"}`;
            details.append(label, handle); identity.append(avatar, details);
            identity.addEventListener("click", () => openFriendProfile(person, isFavorite));
            const star = document.createElement("button"); star.type = "button"; star.className = `mini-action favorite-toggle${isFavorite ? " is-favorite" : ""}`; star.textContent = isFavorite ? "★" : "☆"; star.title = isFavorite ? "Remove from favorites" : "Add to favorites";
            star.addEventListener("click", () => toggleFriendFavorite(person.uid, !isFavorite));
            row.append(identity, star); friendsList.append(row);
        });
    } catch (error) {
        console.error("Could not load Friends:", { code: error.code || "unknown", message: error.message || String(error), error });
        if (auth.currentUser?.uid !== uid) return;
        requestsList.textContent = `Could not load requests (${error.code || "error"}).`;
        friendsList.textContent = `Could not load friends (${error.code || "error"}).`;
    }
}

async function respondToFriendRequest(requestId, status) {
    try {
        await updateDoc(doc(db, "friendRequests", requestId), { status, respondedAt: serverTimestamp() });
        await loadFriends(auth.currentUser.uid);
    } catch (error) {
        console.error("Friend response error:", error);
        appAlert(error.code === "permission-denied" ? "Firestore denied this action. Publish the updated Rules." : error.message);
    }
}


/* FRIEND PROFILE POPUP + FAVORITES + REMOVE + LEAGUE INVITE */
let friendStudyStatsUnsubscribers = [];
let friendStudyStatsRefreshTimer = null;
let friendStudyStatsToken = 0;

function stopFriendStudyStats() {
    friendStudyStatsUnsubscribers.forEach(unsubscribe => unsubscribe());
    friendStudyStatsUnsubscribers = [];
    if (friendStudyStatsRefreshTimer) clearTimeout(friendStudyStatsRefreshTimer);
    friendStudyStatsRefreshTimer = null;
    friendStudyStatsToken += 1;
}

function closeFriendProfileModal() {
    const modal = document.getElementById("friendProfileModal");
    if (modal) modal.hidden = true;
    stopFriendStudyStats();
}

function renderFriendStudyStats(stats, timeZone) {
    const statsBox = document.getElementById("friendProfileStats");
    const todayElement = document.getElementById("friendProfileToday");
    const weekElement = document.getElementById("friendProfileWeek");
    const history = document.getElementById("friendProfileStudyHistory");
    if (!statsBox || !history) return;

    statsBox.replaceChildren();
    const cards = [
        [formatStudyDuration(stats.totalSeconds), "TOTAL STUDY TIME"],
        [String(stats.completedSessions), "COMPLETED SESSIONS"],
        [String(stats.currentStreak), "CURRENT STREAK"],
        [`${stats.longestStreak} days`, "LONGEST STREAK"],
        [String(stats.studyDays), "STUDY DAYS"]
    ];
    cards.forEach(([value, label]) => {
        const card = document.createElement("div");
        card.className = "friend-stat-card";
        const amount = document.createElement("strong");
        amount.textContent = value;
        const caption = document.createElement("span");
        caption.textContent = label;
        card.append(amount, caption);
        statsBox.append(card);
    });

    if (todayElement) todayElement.textContent = formatStudyDuration(stats.todaySeconds);
    if (weekElement) weekElement.textContent = formatStudyDuration(stats.weeklySeconds);
    renderStudySessionHistory(history, stats.records, timeZone);
}

async function refreshFriendStudyStats(person, token) {
    const [sessionsSnapshot, roomSessionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "studySessions"), where("uid", "==", person.uid))),
        getDocs(query(collection(db, "studyRoomCompletions"), where("uid", "==", person.uid)))
    ]);
    if (token !== friendStudyStatsToken) return;
    const records = normalizeStudyRecords(sessionsSnapshot.docs, roomSessionsSnapshot.docs, person.uid);
    const stats = calculateStudyStatistics(records, person.studyTimeZone || "UTC");
    renderFriendStudyStats(stats, person.studyTimeZone || "UTC");
}

function watchFriendStudyStats(person) {
    stopFriendStudyStats();
    const token = friendStudyStatsToken;
    const refresh = () => {
        if (friendStudyStatsRefreshTimer) clearTimeout(friendStudyStatsRefreshTimer);
        friendStudyStatsRefreshTimer = setTimeout(() => {
            refreshFriendStudyStats(person, token).catch(error => {
                if (token !== friendStudyStatsToken) return;
                console.error("Could not load friend study stats:", error);
                const history = document.getElementById("friendProfileStudyHistory");
                if (history) history.textContent = "Study statistics are unavailable right now.";
            });
        }, 100);
    };
    friendStudyStatsUnsubscribers = [
        onSnapshot(query(collection(db, "studySessions"), where("uid", "==", person.uid)), refresh, error => {
            console.error("Friend study-session updates failed:", error);
        }),
        onSnapshot(query(collection(db, "studyRoomCompletions"), where("uid", "==", person.uid)), refresh, error => {
            console.error("Friend Study Session updates failed:", error);
        })
    ];
    refresh();
}

function ensureFriendProfileModal() {
    let modal = document.getElementById("friendProfileModal");
    if (modal) return modal;
    modal = document.createElement("div"); modal.id = "friendProfileModal"; modal.className = "friend-profile-modal"; modal.hidden = true;
    modal.innerHTML = `<div class="friend-profile-backdrop" data-close-friend-profile></div><section class="friend-profile-card" role="dialog" aria-modal="true" aria-labelledby="friendProfileName"><button class="friend-profile-close" type="button" data-close-friend-profile aria-label="Close">×</button><div id="friendProfileCover" class="friend-profile-cover"></div><div id="friendProfileAvatar" class="friend-profile-avatar"></div><h3 id="friendProfileName">Friend</h3><p id="friendProfileUsername"></p><div id="friendProfileStats" class="friend-profile-stats"></div><p class="friend-profile-daily">Today: <strong id="friendProfileToday">0s</strong> · Last 7 days: <strong id="friendProfileWeek">0s</strong></p><section class="friend-profile-history"><h4>Study Sessions</h4><div id="friendProfileStudyHistory" class="study-session-history">Loading study history...</div></section><div class="friend-profile-actions"><button id="friendProfileFavorite" class="community-action-btn" type="button">☆ FAVORITE</button><button id="friendProfileRemove" class="mini-action danger-action" type="button">REMOVE FRIEND</button></div><div class="friend-profile-invite"><label for="friendInviteLeague">Invite to a league</label><select id="friendInviteLeague"><option value="">Loading your leagues...</option></select><button id="friendInviteCopy" class="community-action-btn" type="button">COPY INVITE CODE</button><p id="friendInviteStatus" class="community-note"></p></div></section>`;
    document.body.append(modal);
    modal.addEventListener("click", event => { if (event.target.closest("[data-close-friend-profile]")) closeFriendProfileModal(); });
    return modal;
}

async function openFriendProfile(person, favorite) {
    stopFriendStudyStats();
    const modal = ensureFriendProfileModal();
    modal.hidden = false;
    const cover = document.getElementById("friendProfileCover");
    cover.style.backgroundImage = person.coverUrl ? `url("${String(person.coverUrl).replace(/["\\]/g, "")}")` : "";
    cover.classList.toggle("has-cover", !!person.coverUrl);
    const avatar = document.getElementById("friendProfileAvatar");
    avatar.style.backgroundImage = person.avatarUrl ? `url("${String(person.avatarUrl).replace(/["\\]/g, "")}")` : "";
    avatar.textContent = person.avatarUrl ? "" : (person.username || "U").charAt(0).toUpperCase();
    const friendName = document.getElementById("friendProfileName");
    friendName.textContent = person.username || "Friend";
    friendName.querySelectorAll(".owner-tag").forEach(tag => tag.remove());
    if (person.isOwner === true) appendOwnerTag(friendName, "👑 WEBSITE OWNER & MAKER", "owner-tag-large");
    avatar.classList.toggle("owner-avatar", person.isOwner === true);
    document.getElementById("friendProfileUsername").textContent = `@${person.username || "member"}`;
    const statsBox = document.getElementById("friendProfileStats");
    statsBox.textContent = "Loading study statistics...";
    document.getElementById("friendProfileToday").textContent = "—";
    document.getElementById("friendProfileWeek").textContent = "—";
    document.getElementById("friendProfileStudyHistory").textContent = "Loading study history...";
    watchFriendStudyStats(person);
    const fav = document.getElementById("friendProfileFavorite"); fav.textContent = favorite ? "★ FAVORITED" : "☆ ADD TO FAVORITES";
    fav.onclick = async () => { await toggleFriendFavorite(person.uid, !favorite); closeFriendProfileModal(); };
    document.getElementById("friendProfileRemove").onclick = async () => { if (await appConfirm(`Remove ${person.username || "this friend"} from your friends?`)) { await removeFriend(person.uid); closeFriendProfileModal(); } };
    const select = document.getElementById("friendInviteLeague"); select.replaceChildren();
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Choose a league"; select.append(placeholder);
    try {
        const snap = await getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", auth.currentUser.uid)));
        snap.forEach(item => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.data().name || "Study League"; option.dataset.code = item.data().inviteCode || ""; select.append(option); });
        if (snap.empty) placeholder.textContent = "Create a league first";
    } catch (error) { placeholder.textContent = "Could not load leagues"; }
    document.getElementById("friendInviteStatus").textContent = "Share the invite code so your friend can join.";
    document.getElementById("friendInviteCopy").onclick = async () => {
        const option = select.selectedOptions[0];
        if (!option || !option.value) { document.getElementById("friendInviteStatus").textContent = "Choose a league first."; return; }
        const code = option.dataset.code || "";
        try { await navigator.clipboard.writeText(code); document.getElementById("friendInviteStatus").textContent = `Invite code ${code} copied. Send it to ${person.username}.`; }
        catch { document.getElementById("friendInviteStatus").textContent = `Invite code: ${code}`; }
    };
}

async function toggleFriendFavorite(friendUid, favorite) {
    try {
        await setDoc(doc(db, "users", auth.currentUser.uid, "friendSettings", friendUid), { favorite, updatedAt: serverTimestamp() }, { merge: true });
        await loadFriends(auth.currentUser.uid);
    } catch (error) { console.error("Favorite update failed:", error); appAlert(`Could not update favorite (${error.code || error.message}). Publish the latest Firestore Rules.`); }
}

async function removeFriend(friendUid) {
    try {
        const uid = auth.currentUser.uid;
        const [sent, received] = await Promise.all([
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("recipientUid", "==", friendUid), where("status", "==", "accepted"))),
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", friendUid), where("recipientUid", "==", uid), where("status", "==", "accepted")))
        ]);
        const refs = [...sent.docs, ...received.docs];
        if (!refs.length) throw new Error("Friend connection not found. Refresh the page and try again.");
        await Promise.all(refs.map(item => updateDoc(item.ref, { status: "removed", respondedAt: serverTimestamp() })));
        await deleteDoc(doc(db, "users", uid, "friendSettings", friendUid));
        await loadFriends(uid);
    } catch (error) { console.error("Remove friend failed:", error); appAlert(`Could not remove friend (${error.code || error.message}). Publish the latest Firestore Rules.`); }
}

/* EXAM COUNTDOWN */
function getExamStorageKey(uid) {
    return `fantzawya_exam_${uid}`;
}

function loadExamDate(uid) {
    const savedDate = localStorage.getItem(getExamStorageKey(uid));
    examDateInput.value = savedDate || "";

    if (countdownInterval) clearInterval(countdownInterval);

    if (savedDate) {
        updateCountdown(savedDate);
        countdownInterval = setInterval(() => updateCountdown(savedDate), 1000);
    } else {
        resetCountdown();
    }
}

function updateCountdown(dateValue) {
    const examTime = new Date(dateValue).getTime();
    const difference = examTime - Date.now();

    if (!Number.isFinite(examTime) || difference <= 0) {
        resetCountdown(difference <= 0 ? "Your exam date has arrived!" : "Please select a valid exam date.");
        return;
    }

    const days = Math.floor(difference / 86400000);
    const hours = Math.floor((difference / 3600000) % 24);
    const minutes = Math.floor((difference / 60000) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    document.getElementById("daysLeft").textContent = String(days).padStart(2, "0");
    document.getElementById("hoursLeft").textContent = String(hours).padStart(2, "0");
    document.getElementById("minutesLeft").textContent = String(minutes).padStart(2, "0");
    document.getElementById("secondsLeft").textContent = String(seconds).padStart(2, "0");
    document.getElementById("examStatus").textContent = "Time remaining until your next exam.";
}

function resetCountdown(status = "No exam date selected yet.") {
    ["daysLeft", "hoursLeft", "minutesLeft", "secondsLeft"].forEach(id => {
        document.getElementById(id).textContent = "00";
    });
    document.getElementById("examStatus").textContent = status;
}

saveExamBtn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return;

    const selectedDate = examDateInput.value;
    if (!selectedDate) {
        document.getElementById("examStatus").textContent = "Please select an exam date first.";
        return;
    }
    if (new Date(selectedDate).getTime() <= Date.now()) {
        document.getElementById("examStatus").textContent = "Please choose a future date.";
        return;
    }

    localStorage.setItem(getExamStorageKey(user.uid), selectedDate);
    loadExamDate(user.uid);
    document.getElementById("examStatus").textContent = "Exam date saved successfully!";
});


/* STUDY TIMER HELPERS */
function getTimerStorageKey(uid) {
    return `fantzawya_active_study_${uid}`;
}

function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

function formatStudyTotal(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function getPhaseElapsedMilliseconds(session, now = Date.now()) {
    const savedElapsed = Math.max(0, Number(session.phaseElapsedBeforePauseMs) || 0);
    if (session.status !== "running" || !session.phaseStartedAtMs) return savedElapsed;
    return savedElapsed + Math.max(0, now - session.phaseStartedAtMs);
}

function getStudyElapsedMilliseconds(session, now = Date.now()) {
    const completedStudyMs = Math.max(0, Number(session.completedStudyMs) || 0);
    return completedStudyMs + (session.phase === "study" ? getPhaseElapsedMilliseconds(session, now) : 0);
}

function getStudySinceBreakMilliseconds(session, now = Date.now()) {
    const savedStudyMs = Math.max(0, Number(session.studySinceBreakMs) || 0);
    return savedStudyMs + (session.phase === "study" ? getPhaseElapsedMilliseconds(session, now) : 0);
}

function getCurrentBreakDurationMilliseconds(session) {
    return Math.max(0, Number(session.breakDurationSeconds) + (Number(session.breakExtraSeconds) || 0)) * 1000;
}

function advanceManualTimer(session, now = Date.now()) {
    if (!session || session.status !== "running") return false;

    const phaseElapsedMs = getPhaseElapsedMilliseconds(session, now);
    if (session.phase === "break") {
        const breakDurationMs = getCurrentBreakDurationMilliseconds(session);
        if (phaseElapsedMs >= breakDurationMs) {
            session.phaseElapsedBeforePauseMs = breakDurationMs;
            session.phaseStartedAtMs = null;
            session.status = "break-finished";
            return true;
        }
        return false;
    }

    const completedStudyMs = Math.max(0, Number(session.completedStudyMs) || 0);
    const studyDurationMs = Math.max(1000, Number(session.studyDurationSeconds) * 1000);
    if (session.mode === "countdown" && completedStudyMs + phaseElapsedMs >= studyDurationMs) {
        session.completedStudyMs = studyDurationMs;
        session.phaseElapsedBeforePauseMs = 0;
        session.phaseStartedAtMs = null;
        session.status = "completed";
        return true;
    }

    if (!session.breakDue &&
        getStudySinceBreakMilliseconds(session, now) >= Math.max(60000, Number(session.breakIntervalSeconds) * 1000)) {
        session.breakDue = true;
        return true;
    }
    return false;
}

function beginManualBreak(session, now = Date.now()) {
    if (!session || session.phase !== "study" || session.status !== "running") return false;

    advanceManualTimer(session, now);
    if (session.status !== "running" || session.phase !== "study" || !session.breakDue) return false;

    const studyElapsedMs = getPhaseElapsedMilliseconds(session, now);
    session.completedStudyMs = (Number(session.completedStudyMs) || 0) + studyElapsedMs;
    session.studySinceBreakMs = (Number(session.studySinceBreakMs) || 0) + studyElapsedMs;
    session.phase = "break";
    session.phaseElapsedBeforePauseMs = 0;
    session.phaseStartedAtMs = now;
    session.breakDue = false;
    session.breakExtraSeconds = 0;
    return true;
}

function beginManualStudy(session, now = Date.now()) {
    if (!session || session.phase !== "break" || session.status !== "break-finished") return false;

    session.phase = "study";
    session.phaseElapsedBeforePauseMs = 0;
    session.phaseStartedAtMs = now;
    session.studySinceBreakMs = 0;
    session.breakDue = false;
    session.breakExtraSeconds = 0;
    session.status = "running";
    return true;
}

function addMinutesToSession(session, minutes) {
    if (!session || !["running", "paused"].includes(session.status)) {
        throw new Error("Time can only be added to a running or paused session.");
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        throw new Error("Time to add must be between 1 and 1440 whole minutes.");
    }

    const addedSeconds = minutes * 60;
    if (session.phase === "study" && session.mode === "countdown") {
        const newDurationSeconds = Number(session.studyDurationSeconds) + addedSeconds;
        if (newDurationSeconds > 86400) throw new Error("Countdown study time cannot exceed 24 hours.");
        session.studyDurationSeconds = newDurationSeconds;
        session.plannedSeconds = newDurationSeconds;
        return "study";
    }
    if (session.phase === "break") {
        session.breakExtraSeconds = (Number(session.breakExtraSeconds) || 0) + addedSeconds;
        return "break";
    }
    throw new Error("Extra time is available during Countdown study and breaks.");
}

function getPausedMilliseconds(session, now = Date.now()) {
    const pausedTotalMs = Math.max(0, Number(session.pausedTotalMs) || 0);
    const pauseStartedAtMs = Number(session.pauseStartedAtMs);
    return pausedTotalMs + (session.status === "paused" && pauseStartedAtMs > 0
        ? Math.max(0, now - pauseStartedAtMs)
        : 0);
}

function saveLocalSession() {
    const user = auth.currentUser;
    if (!user || !activeSession) return;
    if (activeSession.status === "running" && prayerReminderIsPending()) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        return;
    }
    localStorage.setItem(getTimerStorageKey(user.uid), JSON.stringify(activeSession));
}

function setTimerMode(mode) {
    if (prayerReminderIsPending()) {
        setTimerMessage("Confirm the prayer reminder before changing timer modes.", true);
        return;
    }
    if (activeSession) {
        setTimerMessage("Finish or reset the current session before switching modes.", true);
        return;
    }

    timerMode = mode;
    const isCountdown = mode === "countdown";
    countdownModeBtn.classList.toggle("active", isCountdown);
    stopwatchModeBtn.classList.toggle("active", !isCountdown);
    timerSetup.hidden = false;
    timerModeCaption.textContent = `${isCountdown ? "COUNTDOWN" : "STOPWATCH"} • STUDY`;
    studyTimerSection.classList.remove("is-break");

    let modeError = null;
    try {
        timerDisplay.textContent = isCountdown ? formatDuration(getSelectedCountdownSeconds()) : "00:00:00";
    } catch (error) {
        timerDisplay.textContent = "00:00:00";
        modeError = error;
    }
    timerState.textContent = "READY TO FOCUS";
    setTimerMessage(modeError?.message || (isCountdown ? "Set your duration and start studying." : "Start the stopwatch whenever you're ready."), Boolean(modeError));
    timerProgress.style.setProperty("--progress", "0%");
}

function getSelectedCountdownSeconds() {
    const hours = Number(timerHoursInput.value);
    const minutes = Number(timerMinutesInput.value);
    const seconds = Number(timerSecondsInput.value);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds) ||
        !timerHoursInput.value.trim() || !timerMinutesInput.value.trim() || !timerSecondsInput.value.trim() ||
        hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error("Enter a valid study duration: hours 0-24, minutes and seconds 0-59.");
    }

    const total = hours * 3600 + minutes * 60 + seconds;
    if (total < 1 || total > 86400) {
        throw new Error("Study duration must be between 1 second and 24 hours.");
    }
    return total;
}

function getSelectedBreakSeconds() {
    const minutes = Number(timerBreakMinutesInput.value);
    if (!Number.isInteger(minutes) || !timerBreakMinutesInput.value.trim() || minutes < 1 || minutes > 1440) {
        throw new Error("Break duration must be between 1 and 1440 minutes.");
    }
    return minutes * 60;
}

function getSelectedBreakIntervalSeconds() {
    const hours = Number(timerBreakIntervalHoursInput.value);
    const minutes = Number(timerBreakIntervalMinutesInput.value);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) ||
        !timerBreakIntervalHoursInput.value.trim() || !timerBreakIntervalMinutesInput.value.trim() ||
        hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
        throw new Error("Enter a valid break interval: hours 0-24 and minutes 0-59.");
    }
    const total = hours * 3600 + minutes * 60;
    if (total < 60 || total > 86400) {
        throw new Error("Break interval must be between 1 minute and 24 hours.");
    }
    return total;
}

function getTimerSettings() {
    return {
        studyDurationSeconds: getSelectedCountdownSeconds(),
        breakIntervalSeconds: getSelectedBreakIntervalSeconds(),
        breakDurationSeconds: getSelectedBreakSeconds()
    };
}

function setStudyDurationInputs(totalSeconds) {
    const seconds = Math.max(1, Math.min(86400, Math.floor(Number(totalSeconds) || 0)));
    timerHoursInput.value = String(Math.floor(seconds / 3600));
    timerMinutesInput.value = String(Math.floor((seconds % 3600) / 60));
    timerSecondsInput.value = String(seconds % 60);
}

function setBreakIntervalInputs(totalSeconds) {
    const seconds = Math.max(60, Math.min(86400, Math.floor(Number(totalSeconds) || 0)));
    timerBreakIntervalHoursInput.value = String(Math.floor(seconds / 3600));
    timerBreakIntervalMinutesInput.value = String(Math.floor((seconds % 3600) / 60));
}

function saveTimerSettings(uid = auth.currentUser?.uid, settings = getTimerSettings()) {
    if (!uid) return;
    localStorage.setItem(`fantzawya_timer_settings_${uid}`, JSON.stringify(settings));
}

function loadTimerSettings(uid) {
    const raw = localStorage.getItem(`fantzawya_timer_settings_${uid}`);
    if (!raw) return;

    try {
        const settings = JSON.parse(raw);
        const studyDurationSeconds = Number(settings.studyDurationSeconds);
        const breakIntervalSeconds = settings.breakIntervalSeconds == null ? 3600 : Number(settings.breakIntervalSeconds);
        const breakDurationSeconds = Number(settings.breakDurationSeconds);
        if (!Number.isInteger(studyDurationSeconds) || studyDurationSeconds < 1 || studyDurationSeconds > 86400 ||
            !Number.isInteger(breakIntervalSeconds) || breakIntervalSeconds < 60 || breakIntervalSeconds > 86400 ||
            breakIntervalSeconds % 60 !== 0 ||
            !Number.isInteger(breakDurationSeconds) || breakDurationSeconds < 60 || breakDurationSeconds > 86400 || breakDurationSeconds % 60 !== 0) {
            throw new Error("Saved timer settings are outside the allowed range.");
        }
        setStudyDurationInputs(studyDurationSeconds);
        setBreakIntervalInputs(breakIntervalSeconds);
        timerBreakMinutesInput.value = String(breakDurationSeconds / 60);
    } catch (error) {
        console.warn("Could not restore saved timer settings:", error);
    }
}

function applyTimerSettings() {
    let settings;
    try {
        settings = getTimerSettings();
    } catch (error) {
        setTimerMessage(error.message, true);
        return false;
    }

    if (activeSession) {
        const now = Date.now();
        const previousStatus = activeSession.status;
        const breakWasDue = Boolean(activeSession.breakDue);
        if (activeSession.status === "running") advanceManualTimer(activeSession, now);
        const studyElapsedMs = getStudyElapsedMilliseconds(activeSession, now);
        activeSession.studyDurationSeconds = settings.studyDurationSeconds;
        activeSession.breakIntervalSeconds = settings.breakIntervalSeconds;
        activeSession.breakDurationSeconds = settings.breakDurationSeconds;
        if (activeSession.mode === "countdown") activeSession.plannedSeconds = settings.studyDurationSeconds;
        if (activeSession.status === "running" && activeSession.phase === "study" &&
            !activeSession.breakDue && getStudySinceBreakMilliseconds(activeSession, now) >= settings.breakIntervalSeconds * 1000) {
            activeSession.breakDue = true;
        }
        if (activeSession.mode === "countdown" && studyElapsedMs >= settings.studyDurationSeconds * 1000 &&
            !["completed", "saving"].includes(activeSession.status)) {
            activeSession.completedStudyMs = Math.max(Number(activeSession.completedStudyMs) || 0, studyElapsedMs);
            activeSession.phase = "study";
            activeSession.phaseElapsedBeforePauseMs = 0;
            activeSession.phaseStartedAtMs = null;
            activeSession.breakDue = false;
            if (activeSession.status === "paused") {
                const pauseStartedAtMs = Number(activeSession.pauseStartedAtMs);
                if (pauseStartedAtMs > 0) {
                    activeSession.pausedTotalMs = (Number(activeSession.pausedTotalMs) || 0) +
                        Math.max(0, now - pauseStartedAtMs);
                }
                activeSession.pauseStartedAtMs = null;
            }
            activeSession.status = "completed";
        }
        if (activeSession.phase === "break" && activeSession.status === "running" &&
            getPhaseElapsedMilliseconds(activeSession, now) >= getCurrentBreakDurationMilliseconds(activeSession)) {
            activeSession.phaseElapsedBeforePauseMs = getCurrentBreakDurationMilliseconds(activeSession);
            activeSession.phaseStartedAtMs = null;
            activeSession.status = "break-finished";
        }
        saveLocalSession();
        updateTimerDisplay();
        renderTimerControls();
        if (!breakWasDue && activeSession?.breakDue && activeSession.phase === "study" && activeSession.status !== "saving") {
            setTimerMessage("It's time for a break. Your study timer is still running; start the break when ready.");
        } else if (activeSession?.status === "completed") {
            setTimerMessage("Study duration complete. Finish the session to save your study time.");
        } else if (activeSession?.status === "break-finished") {
            setTimerMessage("Break finished. Start studying when you're ready.");
        } else if (previousStatus === activeSession?.status && !activeSession?.breakDue) {
            setTimerMessage("Timer settings saved.");
        }
    } else {
        timerModeCaption.textContent = `${timerMode === "countdown" ? "COUNTDOWN" : "STOPWATCH"} • STUDY`;
        if (timerMode === "countdown") timerDisplay.textContent = formatDuration(settings.studyDurationSeconds);
    }

    saveTimerSettings();
    if (!activeSession) setTimerMessage("Timer settings saved.");
    return true;
}

function updateTimerDisplay() {
    if (!activeSession) return;
    if (activeSession.status === "running" && prayerReminderIsPending()) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        return;
    }
    if (activeSession.status !== "running") stopTimerTicker();

    const wasBreakDue = Boolean(activeSession.breakDue);
    const changed = advanceManualTimer(activeSession);
    if (changed) {
        saveLocalSession();
        if (activeSession.status === "completed") {
            setTimerMessage("Study duration complete. Finish the session to save your study time.");
            stopTimerTicker();
        } else if (activeSession.status === "break-finished") {
            setTimerMessage("Break finished. Start studying when you're ready.");
            stopTimerTicker();
        } else if (!wasBreakDue && activeSession.breakDue) {
            setTimerMessage("It's time for a break. Your study timer is still running; start the break when ready.");
        }
    }
    studyTimerSection.classList.toggle("is-break", activeSession.phase === "break");

    const phaseDurationMs = activeSession.phase === "break"
        ? getCurrentBreakDurationMilliseconds(activeSession)
        : Math.max(60000, Number(activeSession.breakIntervalSeconds) * 1000);
    const phaseElapsedMs = getPhaseElapsedMilliseconds(activeSession);
    const remainingStudySeconds = Math.max(0,
        Number(activeSession.studyDurationSeconds) - getStudyElapsedMilliseconds(activeSession) / 1000);
    const remainingBreakSeconds = Math.max(0, phaseDurationMs / 1000 - phaseElapsedMs / 1000);

    if (activeSession.phase === "break") {
        timerDisplay.textContent = formatDuration(remainingBreakSeconds);
    } else if (activeSession.mode === "countdown") {
        timerDisplay.textContent = formatDuration(remainingStudySeconds);
    } else {
        timerDisplay.textContent = formatDuration(getStudyElapsedMilliseconds(activeSession) / 1000);
    }

    const progressMs = activeSession.phase === "break"
        ? phaseElapsedMs
        : activeSession.mode === "countdown"
            ? getStudyElapsedMilliseconds(activeSession)
            : getStudySinceBreakMilliseconds(activeSession);
    const progressDurationMs = activeSession.phase === "break"
        ? phaseDurationMs
        : activeSession.mode === "countdown"
            ? Number(activeSession.studyDurationSeconds) * 1000
            : Number(activeSession.breakIntervalSeconds) * 1000;
    timerProgress.style.setProperty("--progress", `${Math.min(100, progressMs / progressDurationMs * 100)}%`);
    timerModeCaption.textContent = activeSession.phase === "break"
        ? "BREAK • STUDY TIME EXCLUDED"
        : `${activeSession.mode === "countdown" ? "COUNTDOWN" : "STOPWATCH"} • STUDY`;
    if (activeSession.status === "paused") {
        timerState.textContent = `SESSION PAUSED • ${activeSession.phase.toUpperCase()}`;
    } else if (activeSession.status === "break-finished") {
        timerState.textContent = "BREAK COMPLETE";
    } else if (activeSession.status === "completed") {
        timerState.textContent = "STUDY DURATION COMPLETE";
    } else if (activeSession.phase === "break") {
        timerState.textContent = "BREAK TIME";
    } else {
        timerState.textContent = activeSession.breakDue ? "BREAK DUE • START WHEN READY" : "FOCUS IN PROGRESS";
    }
    if (changed) renderTimerControls();
}

function renderTimerControls() {
    const hasSession = Boolean(activeSession);
    const prayerPendingActive = prayerReminderIsPending();
    const isPaused = activeSession?.status === "paused";
    const isSaving = activeSession?.status === "saving";
    const isRunning = activeSession?.status === "running";
    const canAdjustTime = hasSession &&
        ["running", "paused"].includes(activeSession.status) &&
        (activeSession.phase === "break" || (activeSession.phase === "study" && activeSession.mode === "countdown"));

    timerStartBtn.hidden = hasSession;
    timerPauseBtn.hidden = !isRunning;
    timerResumeBtn.hidden = !hasSession || !isPaused;
    timerFinishBtn.hidden = !hasSession;
    timerResetBtn.hidden = !hasSession;
    timerStartBreakBtn.hidden = !hasSession || activeSession.phase !== "study" ||
        !activeSession.breakDue || activeSession.status !== "running";
    timerStartStudyBtn.hidden = !hasSession || activeSession.phase !== "break" ||
        activeSession.status !== "break-finished";
    timerAddTimeControl.hidden = !canAdjustTime;
    timerAddTimeCustomInput.hidden = timerAddTimeSelect.value !== "custom";
    timerStartBtn.disabled = startingSession || prayerPendingActive;
    timerPauseBtn.disabled = prayerPendingActive;
    timerResumeBtn.disabled = prayerPendingActive;
    timerFinishBtn.disabled = isSaving || prayerPendingActive;
    timerResetBtn.disabled = isSaving || prayerPendingActive;
    timerStartBreakBtn.disabled = isSaving || prayerPendingActive;
    timerStartStudyBtn.disabled = isSaving || prayerPendingActive;
    timerAddTimeBtn.disabled = isSaving || prayerPendingActive;

    countdownModeBtn.disabled = hasSession || prayerPendingActive;
    stopwatchModeBtn.disabled = hasSession || prayerPendingActive;
    timerHoursInput.disabled = isSaving || prayerPendingActive;
    timerMinutesInput.disabled = isSaving || prayerPendingActive;
    timerSecondsInput.disabled = isSaving || prayerPendingActive;
    timerBreakIntervalHoursInput.disabled = isSaving || prayerPendingActive;
    timerBreakIntervalMinutesInput.disabled = isSaving || prayerPendingActive;
    timerBreakMinutesInput.disabled = isSaving || prayerPendingActive;
}

function startTimerTicker() {
    stopTimerTicker();
    if (activeSession?.status === "running" && prayerReminderIsPending()) {
        forcePauseTimerForPrayer(prayerPending.dueAtMs);
        return;
    }
    updateTimerDisplay();
    if (activeSession?.status === "running") timerInterval = setInterval(updateTimerDisplay, 250);
}

function stopTimerTicker() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

async function startStudySession() {
    const user = auth.currentUser;
    if (prayerReminderIsPending()) {
        setTimerMessage("Confirm the prayer reminder before starting a study session.", true);
        return;
    }
    if (!user) {
        setTimerMessage("Please log in before starting a study session.", true);
        return;
    }
    if (activeSession || startingSession) return;

    let settings;
    try {
        settings = getTimerSettings();
    } catch (error) {
        setTimerMessage(error.message, true);
        return;
    }

    const plannedSeconds = timerMode === "countdown" ? settings.studyDurationSeconds : 0;
    startingSession = true;
    timerStartBtn.disabled = true;
    timerStartBtn.textContent = "STARTING...";

    try {
        const sessionRef = doc(collection(db, "studySessions"));
        const newSession = {
            uid: user.uid,
            username: currentProfile?.username || "Member",
            mode: timerMode,
            plannedSeconds,
            startedAt: serverTimestamp(),
            status: "active",
            pausedSeconds: 0,
            durationSeconds: 0
        };

        await setDoc(sessionRef, newSession);
        const now = Date.now();

        activeSession = {
            id: sessionRef.id,
            mode: timerMode,
            plannedSeconds,
            studyDurationSeconds: settings.studyDurationSeconds,
            breakIntervalSeconds: settings.breakIntervalSeconds,
            breakDurationSeconds: settings.breakDurationSeconds,
            phase: "study",
            phaseElapsedBeforePauseMs: 0,
            phaseStartedAtMs: now,
            completedStudyMs: 0,
            studySinceBreakMs: 0,
            breakDue: false,
            breakExtraSeconds: 0,
            pausedTotalMs: 0,
            pauseStartedAtMs: null,
            status: "running"
        };

        saveTimerSettings(user.uid, settings);
        saveLocalSession();
        renderTimerControls();
        timerSetup.hidden = false;
        setTimerMessage("Your study session has started. Stay focused!");
        startTimerTicker();
    } catch (error) {
        console.error("Could not start study session:", error);
        setTimerMessage(
            error.code === "permission-denied"
                ? "Firestore denied this session. Check the updated Firestore Rules."
                : `Could not start session: ${error.message}`,
            true
        );
    } finally {
        startingSession = false;
        timerStartBtn.disabled = false;
        timerStartBtn.textContent = "▶ START STUDYING";
    }
}

function startManualBreak() {
    if (prayerReminderIsPending()) return;
    const now = Date.now();
    if (!beginManualBreak(activeSession, now)) {
        updateTimerDisplay();
        return;
    }

    saveLocalSession();
    renderTimerControls();
    studyTimerSection.classList.add("is-break");
    setTimerMessage("Break started. Study countdown is paused and break time is excluded from study totals.");
    startTimerTicker();
}

function startManualStudy() {
    if (prayerReminderIsPending()) return;
    if (!beginManualStudy(activeSession)) return;

    saveLocalSession();
    renderTimerControls();
    studyTimerSection.classList.remove("is-break");
    setTimerMessage("Study resumed. The next break interval starts from now.");
    startTimerTicker();
}

function addSelectedTime() {
    if (prayerReminderIsPending()) return;
    if (!activeSession || !["running", "paused"].includes(activeSession.status)) return;

    const selectedValue = timerAddTimeSelect.value;
    const minutes = selectedValue === "custom"
        ? Number(timerAddTimeCustomInput.value)
        : Number(selectedValue);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        setTimerMessage("Choose a valid time amount between 1 and 1440 minutes.", true);
        return;
    }

    let target;
    try {
        target = addMinutesToSession(activeSession, minutes);
    } catch (error) {
        setTimerMessage(error.message, true);
        return;
    }

    if (target === "study") {
        setStudyDurationInputs(activeSession.studyDurationSeconds);
        saveTimerSettings(auth.currentUser?.uid, {
            studyDurationSeconds: activeSession.studyDurationSeconds,
            breakIntervalSeconds: activeSession.breakIntervalSeconds,
            breakDurationSeconds: activeSession.breakDurationSeconds
        });
        setTimerMessage(`${minutes} minute${minutes === 1 ? "" : "s"} added to the study countdown.`);
    } else {
        setTimerMessage(`${minutes} minute${minutes === 1 ? "" : "s"} added to this break.`);
    }

    saveLocalSession();
    updateTimerDisplay();
    renderTimerControls();
}

function pauseStudySession() {
    if (prayerReminderIsPending()) return;
    if (!activeSession || activeSession.status !== "running") return;

    const now = Date.now();
    const wasBreakDue = Boolean(activeSession.breakDue);
    advanceManualTimer(activeSession, now);
    if (activeSession.status !== "running") {
        updateTimerDisplay();
        return;
    }
    activeSession.phaseElapsedBeforePauseMs = getPhaseElapsedMilliseconds(activeSession, now);
    activeSession.phaseStartedAtMs = null;
    activeSession.pauseStartedAtMs = now;
    activeSession.status = "paused";

    stopTimerTicker();
    saveLocalSession();
    renderTimerControls();
    updateTimerDisplay();
    setTimerMessage(!wasBreakDue && activeSession.breakDue
        ? "It's time for a break. Resume, then start the break when ready."
        : "Session paused. Resume when you're ready.");
}

function resumeStudySession() {
    if (prayerReminderIsPending()) {
        setTimerMessage("Confirm the prayer reminder before resuming the timer.", true);
        return;
    }
    if (!activeSession || activeSession.status !== "paused") return;

    const now = Date.now();
    const pauseStartedAtMs = Number(activeSession.pauseStartedAtMs);
    if (pauseStartedAtMs > 0) {
        activeSession.pausedTotalMs = (Number(activeSession.pausedTotalMs) || 0) +
            Math.max(0, now - pauseStartedAtMs);
    }
    activeSession.pauseStartedAtMs = null;
    activeSession.phaseStartedAtMs = now;
    activeSession.status = "running";

    saveLocalSession();
    renderTimerControls();
    setTimerMessage(activeSession.phase === "break"
        ? "Break resumed. Study time remains paused."
        : "You're back. Keep going!");
    startTimerTicker();
}

async function finishStudySession() {
    if (prayerReminderIsPending()) {
        setTimerMessage("Confirm the prayer reminder before finishing this session.", true);
        return;
    }
    if (!activeSession || finishingSession) return;

    const session = activeSession;
    const user = auth.currentUser;
    if (!user || session.status === "saving") return;

    const now = Date.now();
    if (session.status === "running") advanceManualTimer(session, now);
    finishingSession = true;
    session.statusBeforeSaving = session.status;
    const elapsedSeconds = Math.max(0, Math.floor(getStudyElapsedMilliseconds(session, now) / 1000));
    const pausedSeconds = Math.max(0, Math.floor(getPausedMilliseconds(session) / 1000));

    if (elapsedSeconds < 1) {
        finishingSession = false;
        setTimerMessage("Study for at least one second before finishing.", true);
        return;
    }

    if (session.status === "running") {
        session.phaseElapsedBeforePauseMs = getPhaseElapsedMilliseconds(session, now);
        session.phaseStartedAtMs = null;
    }
    session.status = "saving";
    stopTimerTicker();
    renderTimerControls();
    setTimerMessage("Saving your study session...");

    try {
        await updateDoc(doc(db, "studySessions", session.id), {
            endedAt: serverTimestamp(),
            status: "completed",
            durationSeconds: elapsedSeconds,
            plannedSeconds: session.mode === "countdown" ? session.plannedSeconds : 0,
            pausedSeconds
        });

        localStorage.removeItem(getTimerStorageKey(user.uid));
        activeSession = null;
        finishingSession = false;
        renderTimerControls();
        timerState.textContent = "SESSION COMPLETED";
        studyTimerSection.classList.remove("is-break");
        timerDisplay.textContent = formatDuration(elapsedSeconds);
        timerProgress.style.setProperty("--progress", "100%");
        timerModeCaption.textContent = "COMPLETED STUDY TIME";
        setTimerMessage(`Session finished. Saved ${formatStudyTotal(elapsedSeconds)} of study time; breaks were excluded.`);

        await loadStudyStats(user.uid);
        await loadCommunityFeatures(user.uid);
        timerMode = "countdown";
        countdownModeBtn.classList.add("active");
        stopwatchModeBtn.classList.remove("active");
        timerSetup.hidden = false;
    } catch (error) {
        console.error("Could not finish study session:", error);
        session.status = session.statusBeforeSaving || "running";
        if (session.status === "running") session.phaseStartedAtMs = Date.now();
        activeSession = session;
        finishingSession = false;
        saveLocalSession();
        renderTimerControls();
        if (session.status === "running") startTimerTicker();
        setTimerMessage(`Could not save session: ${error.message}`, true);
    }
}

async function resetStudySession() {
    if (prayerReminderIsPending()) {
        setTimerMessage("Confirm the prayer reminder before resetting this session.", true);
        return;
    }
    if (!activeSession) return;

    const confirmed = await appConfirm("Reset this session? Its current study time will not be saved.");
    if (!confirmed) return;

    const user = auth.currentUser;
    const sessionId = activeSession.id;

    // Firestore rules intentionally prevent deleting a session. Marking it completed
    // would count it, so an abandoned active document is left uncounted.
    stopTimerTicker();
    if (user) localStorage.removeItem(getTimerStorageKey(user.uid));
    activeSession = null;
    finishingSession = false;
    renderTimerControls();
    setTimerMode("countdown");
    setTimerMessage("Local timer reset. The unfinished Firebase record is not counted.");
    console.info("Unfinished session left in Firestore:", sessionId);
}

async function restoreStudySession(uid) {
    if (auth.currentUser?.uid !== uid) return;
    loadTimerSettings(uid);
    const raw = localStorage.getItem(getTimerStorageKey(uid));
    if (!raw) {
        activeSession = null;
        renderTimerControls();
        setTimerMode("countdown");
        markPrayerSessionRestoreReady(uid);
        return;
    }

    try {
        const saved = JSON.parse(raw);
        if (!saved.id || !["countdown", "stopwatch"].includes(saved.mode)) {
            throw new Error("Invalid saved session.");
        }

        const sessionSnapshot = await getDoc(doc(db, "studySessions", saved.id));
        if (!sessionSnapshot.exists() || sessionSnapshot.data().status !== "active") {
            localStorage.removeItem(getTimerStorageKey(uid));
            activeSession = null;
            renderTimerControls();
            setTimerMode("countdown");
            markPrayerSessionRestoreReady(uid);
            return;
        }

        const actualNow = Date.now();
        const pendingPrayer = readPrayerPending(uid);
        const now = pendingPrayer
            ? Math.min(actualNow, Number(pendingPrayer.dueAtMs) || actualNow)
            : actualNow;
        const hasManualTimerState = ["study", "break"].includes(saved.phase) &&
            Number.isInteger(Number(saved.studyDurationSeconds)) &&
            Number(saved.studyDurationSeconds) >= 1 && Number(saved.studyDurationSeconds) <= 86400 &&
            Number.isInteger(Number(saved.breakIntervalSeconds)) &&
            Number(saved.breakIntervalSeconds) >= 60 && Number(saved.breakIntervalSeconds) <= 86400 &&
            Number(saved.breakIntervalSeconds) % 60 === 0 &&
            Number.isInteger(Number(saved.breakDurationSeconds)) &&
            Number(saved.breakDurationSeconds) >= 60 && Number(saved.breakDurationSeconds) <= 86400 &&
            Number(saved.breakDurationSeconds) % 60 === 0 &&
            Number.isFinite(Number(saved.phaseElapsedBeforePauseMs)) &&
            Number(saved.phaseElapsedBeforePauseMs) >= 0 &&
            Number.isFinite(Number(saved.completedStudyMs)) &&
            Number.isFinite(Number(saved.studySinceBreakMs)) &&
            Number(saved.studySinceBreakMs) >= 0 &&
            Number.isFinite(Number(saved.breakExtraSeconds)) &&
            Number(saved.breakExtraSeconds) >= 0 &&
            ["running", "paused", "break-finished", "completed", "saving"].includes(saved.status);
        if (!hasManualTimerState) {
            const hasPreviousPomodoroState = ["study", "break"].includes(saved.phase) &&
                Number.isFinite(Number(saved.phaseElapsedBeforePauseMs)) &&
                Number.isFinite(Number(saved.completedStudyMs));
            const legacyElapsedMs = Math.max(0, Number(saved.elapsedBeforePauseMs) || 0) +
                (saved.status === "paused" ? 0 : Math.max(0, now - (Number(saved.segmentStartedAtMs) || now)));
            let settings;
            try {
                settings = getTimerSettings();
            } catch (error) {
                console.warn("Invalid saved break settings; using defaults:", error);
                settings = { studyDurationSeconds: 3600, breakIntervalSeconds: 3600, breakDurationSeconds: 300 };
                setStudyDurationInputs(settings.studyDurationSeconds);
                setBreakIntervalInputs(settings.breakIntervalSeconds);
                timerBreakMinutesInput.value = "5";
            }
            if (hasPreviousPomodoroState) {
                const oldPhaseElapsedMs = Math.max(0, Number(saved.phaseElapsedBeforePauseMs) || 0) +
                    (saved.status === "paused" ? 0 : Math.max(0, now - (Number(saved.phaseStartedAtMs) || now)));
                const completedStudyMs = Math.max(0, Number(saved.completedStudyMs) || 0);
                const oldFocusBlockSeconds = Math.max(1, Number(saved.studyDurationSeconds) || settings.studyDurationSeconds);
                saved.phaseElapsedBeforePauseMs = oldPhaseElapsedMs;
                saved.completedStudyMs = completedStudyMs;
                saved.studyDurationSeconds = saved.mode === "countdown"
                    ? Math.min(86400, Math.max(settings.studyDurationSeconds,
                        Math.ceil(completedStudyMs / 1000) + oldFocusBlockSeconds))
                    : settings.studyDurationSeconds;
                saved.studySinceBreakMs = 0;
                saved.breakDue = saved.phase === "study" &&
                    oldPhaseElapsedMs >= settings.breakIntervalSeconds * 1000;
                saved.phaseStartedAtMs = saved.status === "paused" ? null : Number(saved.phaseStartedAtMs) || now;
            } else {
                saved.phase = "study";
                saved.completedStudyMs = saved.mode === "stopwatch" ? legacyElapsedMs : 0;
                saved.phaseElapsedBeforePauseMs = saved.mode === "countdown" ? legacyElapsedMs : 0;
                saved.studyDurationSeconds = saved.mode === "countdown"
                    ? Math.max(1, Math.min(86400, Number(saved.plannedSeconds) || settings.studyDurationSeconds))
                    : settings.studyDurationSeconds;
                saved.studySinceBreakMs = saved.mode === "stopwatch" ? legacyElapsedMs : 0;
                saved.phaseStartedAtMs = saved.status === "paused"
                    ? null
                    : saved.mode === "countdown" ? now - legacyElapsedMs : now;
                saved.breakDue = saved.studySinceBreakMs >= settings.breakIntervalSeconds * 1000;
            }
            saved.breakIntervalSeconds = settings.breakIntervalSeconds;
            saved.breakDurationSeconds = settings.breakDurationSeconds;
            saved.breakExtraSeconds = 0;
            saved.pausedTotalMs = Math.max(0, Number(saved.pausedTotalMs) || 0);
            saved.pauseStartedAtMs = saved.status === "paused" ? saved.pauseStartedAtMs || now : null;
            saved.status = saved.status === "paused" ? "paused" : "running";
            if (saved.mode === "countdown") saved.plannedSeconds = saved.studyDurationSeconds;
            setStudyDurationInputs(saved.studyDurationSeconds);
            setBreakIntervalInputs(saved.breakIntervalSeconds);
            timerBreakMinutesInput.value = String(saved.breakDurationSeconds / 60);
        } else {
            saved.studyDurationSeconds = Number(saved.studyDurationSeconds);
            saved.breakIntervalSeconds = Number(saved.breakIntervalSeconds);
            saved.breakDurationSeconds = Number(saved.breakDurationSeconds);
            saved.phaseElapsedBeforePauseMs = Math.max(0, Number(saved.phaseElapsedBeforePauseMs));
            saved.completedStudyMs = Math.max(0, Number(saved.completedStudyMs));
            saved.studySinceBreakMs = Math.max(0, Number(saved.studySinceBreakMs));
            saved.breakExtraSeconds = Math.max(0, Number(saved.breakExtraSeconds));
            saved.pausedTotalMs = Math.max(0, Number(saved.pausedTotalMs) || 0);
            if (saved.status === "saving") saved.status = "running";
            if (saved.status === "running" && !(Number(saved.phaseStartedAtMs) > 0)) saved.phaseStartedAtMs = now;
            if (saved.status !== "running") saved.phaseStartedAtMs = null;
            setStudyDurationInputs(saved.studyDurationSeconds);
            setBreakIntervalInputs(saved.breakIntervalSeconds);
            timerBreakMinutesInput.value = String(saved.breakDurationSeconds / 60);
        }

        activeSession = saved;
        if (prayerReminderIsPending() && activeSession.status === "running") {
            forcePauseTimerForPrayer(prayerPending.dueAtMs);
        }
        timerMode = saved.mode;
        saveTimerSettings(uid, {
            studyDurationSeconds: saved.studyDurationSeconds,
            breakIntervalSeconds: saved.breakIntervalSeconds,
            breakDurationSeconds: saved.breakDurationSeconds
        });
        countdownModeBtn.classList.toggle("active", timerMode === "countdown");
        stopwatchModeBtn.classList.toggle("active", timerMode === "stopwatch");
        timerSetup.hidden = false;

        if (activeSession.status === "running") {
            startTimerTicker();
            if (activeSession.status === "running" && activeSession.breakDue) {
                setTimerMessage("It's time for a break. Your study timer is still running; start the break when ready.");
            } else if (activeSession.status === "running") {
                setTimerMessage("Your previous study session has been restored.");
            }
        } else {
            renderTimerControls();
            updateTimerDisplay();
            if (activeSession.status === "paused") {
                setTimerMessage("Your paused study session has been restored.");
            } else if (activeSession.status === "break-finished") {
                setTimerMessage("Break finished. Start studying when you're ready.");
            } else if (activeSession.status === "completed") {
                setTimerMessage("Study duration complete. Finish the session to save your study time.");
            }
        }
        renderTimerControls();
        markPrayerSessionRestoreReady(uid);
    } catch (error) {
        console.error("Could not restore study session:", error);
        localStorage.removeItem(getTimerStorageKey(uid));
        activeSession = null;
        renderTimerControls();
        setTimerMode("countdown");
        markPrayerSessionRestoreReady(uid);
    }
}


/* RESET COMPLETED STUDY SESSIONS */
const resetStudyStatsBtn = document.getElementById("resetStudyStatsBtn");
if (resetStudyStatsBtn) {
    resetStudyStatsBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user || resetStudyStatsBtn.disabled) return;
        const confirmed = await appConfirm("Are you sure you want to reset all your study statistics? This will permanently delete your completed Countdown, Stopwatch, and Study Session records and cannot be undone.");
        if (!confirmed) return;

        resetStudyStatsBtn.disabled = true;
        const originalText = resetStudyStatsBtn.textContent;
        resetStudyStatsBtn.textContent = "RESETTING...";
        try {
            const [sessionsSnapshot, roomSessionsSnapshot] = await Promise.all([
                getDocs(query(
                    collection(db, "studySessions"),
                    where("uid", "==", user.uid)
                )),
                getDocs(query(
                    collection(db, "studyRoomCompletions"),
                    where("uid", "==", user.uid)
                ))
            ]);
            const completedSessions = sessionsSnapshot.docs.filter(item => item.data().status === "completed");
            await Promise.all([
                ...completedSessions.map(sessionDoc => deleteDoc(sessionDoc.ref)),
                ...roomSessionsSnapshot.docs.map(sessionDoc => deleteDoc(sessionDoc.ref))
            ]);
            await loadStudyStats(user.uid);
            await loadCommunityFeatures(user.uid);
            appAlert(`Study statistics reset successfully. ${completedSessions.length} timer sessions and ${roomSessionsSnapshot.size} Study Sessions cleared.`);
        } catch (error) {
            console.error("Could not reset study statistics:", error);
            appAlert(`Could not reset study statistics: ${error.message || error}`);
        } finally {
            resetStudyStatsBtn.disabled = false;
            resetStudyStatsBtn.textContent = originalText;
        }
    });
}

/* All displayed totals derive from the same completed Firestore records. */
let studyStatsDayInterval = null;
let studyStatsDayUid = null;
let studyStatsCurrentDay = null;

function ensureStudyStatsDayRefresh(uid, timeZone) {
    if (studyStatsDayUid === uid && studyStatsDayInterval) return;
    if (studyStatsDayInterval) clearInterval(studyStatsDayInterval);
    studyStatsDayUid = uid;
    studyStatsCurrentDay = getStudyDayKey(Date.now(), timeZone);
    studyStatsDayInterval = setInterval(() => {
        if (auth.currentUser?.uid !== uid) return;
        const day = getStudyDayKey(Date.now(), timeZone);
        if (day === studyStatsCurrentDay) return;
        studyStatsCurrentDay = day;
        loadStudyStats(uid);
    }, 60000);
}

async function fetchStudyRecords(uid) {
    const [sessionsSnapshot, roomSessionsSnapshot] = await Promise.all([
        runFirestoreOperation("query studySessions for the signed-in user's study statistics", () =>
            getDocs(query(collection(db, "studySessions"), where("uid", "==", uid)))),
        runFirestoreOperation("query studyRoomCompletions for the signed-in user's study statistics", () =>
            getDocs(query(collection(db, "studyRoomCompletions"), where("uid", "==", uid))))
    ]);
    return normalizeStudyRecords(sessionsSnapshot.docs, roomSessionsSnapshot.docs, uid);
}

function renderStudySessionHistory(container, records, timeZone) {
    if (!container) return;
    container.replaceChildren();
    if (!records.length) {
        container.textContent = "No completed study sessions yet.";
        return;
    }

    records.forEach(record => {
        const row = document.createElement("div");
        row.className = "study-history-row";
        const date = document.createElement("span");
        date.textContent = formatStudyDate(record.endedAtMillis, timeZone);
        const duration = document.createElement("strong");
        duration.textContent = formatStudyDuration(record.durationSeconds);
        row.append(date, duration);
        container.append(row);
    });
}

async function loadStudyStats(uid) {
    if (auth.currentUser?.uid !== uid) return null;
    try {
        const records = await fetchStudyRecords(uid);
        if (auth.currentUser?.uid !== uid) return null;
        const timeZone = currentProfile?.studyTimeZone || getLocalStudyTimeZone();
        ensureStudyStatsDayRefresh(uid, timeZone);
        const stats = calculateStudyStatistics(records, timeZone);
        const statsError = document.getElementById("studyStatsError");
        if (statsError) {
            statsError.hidden = true;
            statsError.textContent = "";
        }
        const totalStudyTimeEl = document.getElementById("totalStudyTime");
        const completedSessionsEl = document.getElementById("completedSessions");

        if (totalStudyTimeEl) totalStudyTimeEl.textContent = formatStudyDuration(stats.totalSeconds);
        if (completedSessionsEl) completedSessionsEl.textContent = `${stats.completedSessions} completed sessions`;
        const values = {
            streakValue: stats.currentStreak,
            longestStreakValue: stats.longestStreak,
            studyDaysValue: stats.studyDays,
            profileStudyTime: formatStudyDuration(stats.totalSeconds),
            profileSessionCount: stats.completedSessions,
            profileCountdownTime: formatStudyDuration(stats.countdownSeconds),
            profileStopwatchTime: formatStudyDuration(stats.stopwatchSeconds),
            profileStudySessionTime: formatStudyDuration(stats.studyRoomSeconds),
            profileCurrentStreak: stats.currentStreak,
            profileLongestStreak: stats.longestStreak,
            profileStudyDays: stats.studyDays,
            profileTodayStudyTime: formatStudyDuration(stats.todaySeconds),
            profileWeekStudyTime: formatStudyDuration(stats.weeklySeconds)
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value);
        });
        renderStudySessionHistory(document.getElementById("profileStudyHistory"), stats.records, timeZone);
        return stats;
    } catch (error) {
        if (auth.currentUser?.uid !== uid) return null;
        console.error("Could not load study statistics:", {
            code: error.code || "unknown",
            message: error.message || String(error),
            error
        });
        const errorCode = error.code || "unknown-error";
        const statsError = document.getElementById("studyStatsError");
        if (statsError) {
            statsError.textContent = `Study statistics could not be loaded (${errorCode}). Check your connection or Firestore access and retry.`;
            statsError.hidden = false;
        }
        const history = document.getElementById("profileStudyHistory");
        if (history) history.textContent = `Study history is unavailable (${errorCode}).`;
        setTimerMessage(`Could not load study statistics (${errorCode}).`, true);
        return null;
    }
}


/* REAL-TIME SHARED STUDY ROOMS */
let studyRoomUnsubscribe = null;
let studyInviteUnsubscribe = null;
let activeStudyRoomUnsubscribe = null;
let activeStudyRoomRemovalUnsubscribe = null;
let studyRoomChatUnsubscribe = null;
let studyPrivateChatUnsubscribe = null;
let studyPrivateChatTargetUid = null;
let studySessionFilter = "all";
let studyRoomChatSending = false;
let studyRoomStatsUnsubscribe = null;
let studySessionStatsUnsubscribe = null;
let studyStatsRefreshTimer = null;
let activeStudyRoomId = null;
let activeStudyRoomData = null;
let studyRoomTicker = null;
let activeStudyRoomProfiles = new Map();
let studyRoomProfileLoads = new Set();
let studyRoomActionPending = false;
let endingStudyRoom = false;
let activeStudyRoomNotice = "";
let studyFriendsCache = [];

function studyFormatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const sec = String(seconds % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
}
function studyRoomTimestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
function studyRoomRemaining(room) {
    const started = studyRoomTimestampMillis(room?.startedAt);
    if (!started) return null;
    const pausedAt = studyRoomTimestampMillis(room.pausedAt);
    const now = pausedAt || Date.now();
    if (room.mode === "stopwatch") return Math.max(0, Math.floor((now - started - (Number(room.pausedSeconds) || 0) * 1000) / 1000));
    const configuredEnd = studyRoomTimestampMillis(room.targetEndAt);
    const end = configuredEnd || (room.mode === "countdown" ? started + (Number(room.durationSeconds) || 0) * 1000 : 0);
    if (!end) return null;
    return Math.max(0, Math.ceil((end - now) / 1000));
}
function studyRoomElapsedSeconds(room, endAt) {
    const started = studyRoomTimestampMillis(room?.startedAt);
    let ended = studyRoomTimestampMillis(endAt);
    if (!started || !ended) return 0;
    if (room.pausedAt) ended = Math.min(ended, studyRoomTimestampMillis(room.pausedAt) || ended);
    if (room.mode === "countdown") {
        const configuredEnd = studyRoomTimestampMillis(room.targetEndAt) || started + (Number(room.durationSeconds) || 0) * 1000;
        ended = Math.min(ended, configuredEnd);
    }
    if (room.mode === "until") {
        const targetEnd = studyRoomTimestampMillis(room.targetEndAt);
        if (targetEnd) ended = Math.min(ended, targetEnd);
    }
    return Math.max(0, Math.floor((ended - started) / 1000) - Math.max(0, Number(room.pausedSeconds) || 0));
}
function studyRoomErrorMessage(error, action) {
    const messages = {
        "permission-denied": `You are not allowed to ${action} this Study Session.`,
        "not-found": "This Study Session no longer exists.",
        "failed-precondition": "This Study Session has changed. Refresh it and try again.",
        unavailable: "Could not reach Firebase. Your session is unchanged; check your connection and retry.",
        "invalid-argument": "The Study Session data was invalid. Refresh and try again.",
        aborted: "Another participant changed the session at the same time. Refresh and retry.",
        internal: "Firebase could not complete the request. The session remains stopped where applicable; retry once connected."
    };
    return messages[error?.code] || `Could not ${action} the Study Session. Please retry.`;
}
function studyRoomActionError(error, action) {
    return error?.code ? studyRoomErrorMessage(error, action) : error?.message || studyRoomErrorMessage(error, action);
}
async function loadStudyFriends(uid) {
    const select = document.getElementById("studyRoomFriends");
    if (!select) return;
    try {
        const [a, b] = await Promise.all([
            runFirestoreOperation("query accepted friendRequests sent by the current user for Study Rooms", () =>
                getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "accepted")))),
            runFirestoreOperation("query accepted friendRequests received by the current user for Study Rooms", () =>
                getDocs(query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "accepted"))))
        ]);
        const ids = [...new Set([...a.docs, ...b.docs].map(d => d.data().senderUid === uid ? d.data().recipientUid : d.data().senderUid))];
        const profiles = await Promise.all(ids.map(id => getDoc(doc(db, "publicProfiles", id))));
        studyFriendsCache = profiles.filter(x => x.exists()).map(x => ({ uid: x.id, ...x.data() }));
        const addSelect = document.getElementById("studyRoomAddFriends");
        [select, addSelect].filter(Boolean).forEach(target => target.replaceChildren());
        if (!studyFriendsCache.length) {
            [select, addSelect].filter(Boolean).forEach(target => {
                const option=document.createElement("option"); option.disabled=true;
                option.textContent="Add friends first to invite them"; target.append(option);
            });
            return;
        }
        studyFriendsCache.forEach(friend => {
            [select, addSelect].filter(Boolean).forEach(target => {
                const option=document.createElement("option");
                option.value=friend.uid;
                option.textContent=`${friend.username || "Friend"} (@${friend.username || "member"})`;
                target.append(option);
            });
        });
    } catch (error) { console.error("Study friends load failed", error); select.innerHTML="<option disabled>Could not load friends</option>"; }
}

function initStudySessionFilters() {
    const filters = document.getElementById("studySessionFilters");
    if (!filters || filters.dataset.bound === "true") return;
    filters.dataset.bound = "true";
    filters.addEventListener("click", event => {
        const button = event.target.closest("[data-study-filter]");
        if (!button) return;
        studySessionFilter = button.dataset.studyFilter || "all";
        filters.querySelectorAll("[data-study-filter]").forEach(item => item.classList.toggle("active", item === button));
        applyStudySessionFilter();
    });
}
function applyStudySessionFilter() {
    const roomRows = [...document.querySelectorAll("#myStudyRoomsList .study-room-row")];
    const inviteRows = [...document.querySelectorAll("#studyInvitesList .study-invite-row")];
    const isNew = studySessionFilter === "new";
    roomRows.forEach(row => {
        row.hidden = isNew || studySessionFilter === "invited" ||
            (studySessionFilter === "active" && row.dataset.studyStatus !== "active") ||
            (studySessionFilter === "ended" && !["completed","cancelled"].includes(row.dataset.studyStatus));
    });
    inviteRows.forEach(row => { row.hidden = isNew || (studySessionFilter !== "all" && studySessionFilter !== "invited"); });
    const createPanel=document.getElementById("studyRoomCreatePanel"); if(createPanel)createPanel.hidden=!isNew;
    const inboxPanel=document.querySelector(".study-room-inbox"); if(inboxPanel)inboxPanel.hidden=isNew;
    const counts = {
        all: roomRows.length + inviteRows.length,
        active: roomRows.filter(row => row.dataset.studyStatus === "active").length,
        ended: roomRows.filter(row => ["completed","cancelled"].includes(row.dataset.studyStatus)).length,
        invited: inviteRows.length
    };
    Object.entries({all:"studyFilterAllCount",active:"studyFilterActiveCount",ended:"studyFilterEndedCount",invited:"studyFilterInvitedCount"}).forEach(([key,id]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(counts[key]);
    });
}

async function initStudyRooms(uid) {
    initStudySessionFilters();
    if (auth.currentUser?.uid !== uid) return;
    await loadStudyFriends(uid);
    if (auth.currentUser?.uid !== uid) return;
    if (studyRoomUnsubscribe) studyRoomUnsubscribe();
    if (studyInviteUnsubscribe) studyInviteUnsubscribe();
    if (studyRoomStatsUnsubscribe) studyRoomStatsUnsubscribe();
    if (studySessionStatsUnsubscribe) studySessionStatsUnsubscribe();
    const refreshStudyStats = () => {
        if (auth.currentUser?.uid !== uid) return;
        if (studyStatsRefreshTimer) clearTimeout(studyStatsRefreshTimer);
        studyStatsRefreshTimer = setTimeout(() => loadStudyStats(uid), 100);
    };
    studyRoomStatsUnsubscribe = onSnapshot(query(
        collection(db, "studyRoomCompletions"),
        where("uid", "==", uid)
    ), refreshStudyStats, error => console.error("Study Session stats sync failed:", error));
    studySessionStatsUnsubscribe = onSnapshot(query(
        collection(db, "studySessions"),
        where("uid", "==", uid)
    ), refreshStudyStats, error => console.error("Study timer stats sync failed:", error));
    studyRoomUnsubscribe = onSnapshot(query(collection(db, "studyRooms"), where("memberUids", "array-contains", uid)), snap => {
        if (auth.currentUser?.uid !== uid) return;
        const list = document.getElementById("myStudyRoomsList");
        if (!list) return;
        list.replaceChildren();
        if (snap.empty) {
            list.textContent = "No study rooms yet. Create one or accept an invitation.";
            return;
        }
        snap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0)).forEach(item => {
            const data = item.data();
            if (data.status === "completed" && (data.memberUids || []).includes(uid)) {
                saveStudyRoomCompletion(item.id).catch(error => {
                    console.error("Could not save Study Session completion:", error);
                });
            }
            const row = document.createElement("div");
            row.className = "study-room-row";
            row.dataset.studyStatus = data.status || "waiting";
            row.tabIndex = 0;
            const info = document.createElement("span");
            info.className = "study-room-row-info";
            const name = document.createElement("strong");
            name.textContent = data.name || "Study room";
            const meta = document.createElement("small");
            const endMillis = studyRoomTimestampMillis(data.endedAt || data.targetEndAt);
            const endsLabel = endMillis ? new Date(endMillis).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : data.mode === "stopwatch" ? "No fixed end" : "Not started";
            meta.textContent = `${(data.memberUids || []).length} participant(s) • ${data.status === "active" ? "Session live" : data.status === "ending" ? "Session ending" : data.status === "completed" ? "Finished" : data.status === "cancelled" ? "Cancelled" : "Waiting to start"} • ENDS: ${endsLabel}`;
            info.append(name, meta);
            const status = document.createElement("span");
            status.className = `study-room-pill ${data.status || "waiting"}`;
            status.textContent = data.status === "active" ? "LIVE" : data.status === "ending" ? "ENDING" : data.status === "completed" ? "DONE" : data.status === "cancelled" ? "CANCELLED" : "WAITING";
            row.append(info, status);
            row.addEventListener("click", event => {
                if (!event.target.closest(".study-room-list-actions")) openStudyRoom(item.id);
            });
            row.addEventListener("keydown", event => {
                if ((event.key === "Enter" || event.key === " ") && !event.target.closest(".study-room-list-actions")) {
                    event.preventDefault();
                    openStudyRoom(item.id);
                }
            });

            const actions = document.createElement("div");
            actions.className = "study-room-list-actions";
            if (data.status === "completed" && data.ownerUid === uid) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "mini-action danger-action";
                deleteButton.textContent = "DELETE";
                deleteButton.addEventListener("click", async event => {
                    event.stopPropagation();
                    if (!await appConfirm("Delete this completed study room? Study statistics already saved will be kept.")) return;
                    try {
                        await deleteDoc(doc(db, "studyRooms", item.id));
                        if (activeStudyRoomId === item.id) closeActiveStudyRoom();
                    } catch (error) {
                        showAppPopup(`Could not delete room: ${error.message || error.code}`, { error: true });
                    }
                });
                actions.append(deleteButton);
            } else if (["waiting", "active"].includes(data.status)) {
                const leaveButton = document.createElement("button");
                leaveButton.type = "button";
                leaveButton.className = "mini-action";
                leaveButton.textContent = "LEAVE";
                leaveButton.addEventListener("click", event => {
                    event.stopPropagation();
                    leaveStudyRoom(item.id, leaveButton);
                });
                actions.append(leaveButton);
            }
            row.append(actions);
            list.append(row);
        });
        applyStudySessionFilter();
        if (!activeStudyRoomId && snap.docs.length) openStudyRoom(snap.docs[0].id);
    }, error => {
        if (auth.currentUser?.uid !== uid) return;
        console.error("Study room list sync failed:", error);
        document.getElementById("myStudyRoomsList").textContent = `Could not load rooms (${error.code || "error"}).`;
    });
    studyInviteUnsubscribe = onSnapshot(query(collection(db, "studyRoomInvites"), where("recipientUid", "==", uid), where("status", "==", "pending")), snap => {
        if (auth.currentUser?.uid !== uid) return;
        const list = document.getElementById("studyInvitesList");
        const count = document.getElementById("studyInviteCount");
        if (!list) return;
        count.textContent = String(snap.size);
        list.replaceChildren();
        if (snap.empty) {
            list.textContent = "No new study invitations.";
            return;
        }
        snap.forEach(item => {
            const data = item.data();
            const row = document.createElement("div");
            row.className = "study-invite-row";
            row.dataset.studyStatus = "invited";
            const details = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${data.senderUsername || "A friend"} invited you`;
            const subtitle = document.createElement("small");
            subtitle.textContent = `${data.roomName || "Study room"} • ${data.mode || "stopwatch"}`;
            details.append(title, subtitle);
            const actions = document.createElement("div");
            actions.className = "study-invite-actions";
            const accept = document.createElement("button");
            accept.className = "mini-action accept";
            accept.textContent = "JOIN";
            accept.addEventListener("click", () => respondStudyInvite(item.id, data.roomId, true));
            const decline = document.createElement("button");
            decline.className = "mini-action";
            decline.textContent = "DECLINE";
            decline.addEventListener("click", () => respondStudyInvite(item.id, data.roomId, false));
            actions.append(accept, decline);
            row.append(details, actions);
            list.append(row);
        });
        applyStudySessionFilter();
    }, error => {
        if (auth.currentUser?.uid !== uid) return;
        console.error("Study invitation listener failed:", error);
        document.getElementById("studyInvitesList").textContent = `Could not load invitations (${error.code || "error"}).`;
    });
}
const studyModeSelect=document.getElementById("studyRoomMode");
if(studyModeSelect) studyModeSelect.addEventListener("change",()=>{document.getElementById("studyCountdownFields").hidden=studyModeSelect.value!=="countdown";document.getElementById("studyUntilFields").hidden=studyModeSelect.value!=="until";});
const createStudyRoomBtn=document.getElementById("createStudyRoomBtn");
if(createStudyRoomBtn) createStudyRoomBtn.addEventListener("click",createStudyRoom);
async function createStudyRoom(){
    const user=auth.currentUser, status=document.getElementById("studyRoomCreateStatus"), btn=createStudyRoomBtn;
    const name=document.getElementById("studyRoomName").value.trim() || "Group Study Session";
    const mode=document.getElementById("studyRoomMode").value;
    const selected=[...document.getElementById("studyRoomFriends").selectedOptions].map(o=>o.value).filter(Boolean);
    let durationSeconds=0,targetEndAt=null;
    if(mode==="countdown"){durationSeconds=Math.min(86400,Math.max(60,Number(document.getElementById("studyRoomMinutes").value||0)*60));if(!durationSeconds){status.textContent="Enter a valid duration.";return;}}
    if(mode==="until"){const value=document.getElementById("studyRoomEndAt").value, endAt=new Date(value);if(!value||endAt<=new Date()){status.textContent="Choose an end time in the future.";return;}if(endAt.getTime()>Date.now()+7*24*60*60*1000){status.textContent="Choose an end time within the next 7 days.";return;}targetEndAt=Timestamp.fromDate(endAt);}
    btn.disabled=true; status.textContent="Creating your room...";
    try{
        const roomRef=doc(collection(db,"studyRooms"));
        const room={name,ownerUid:user.uid,ownerUsername:currentProfile?.username||"Member",memberUids:[user.uid],readyUids:[],pausedAt:null,pausedSeconds:0,mode,durationSeconds,targetEndAt,status:"waiting",createdAt:serverTimestamp(),startedAt:null,endedAt:null};
        await setDoc(roomRef,room);
        const inviteWrites=selected.map(friendUid=>{const friend=studyFriendsCache.find(f=>f.uid===friendUid);return setDoc(doc(db,"studyRoomInvites",`${roomRef.id}_${friendUid}`),{roomId:roomRef.id,roomName:name,mode,senderUid:user.uid,senderUsername:currentProfile?.username||"Member",recipientUid:friendUid,status:"pending",createdAt:serverTimestamp()});});
        await Promise.all(inviteWrites);
        document.getElementById("studyRoomName").value="";status.textContent=`Room created${selected.length?` and ${selected.length} invitation(s) sent`:""}.`;await openStudyRoom(roomRef.id);
    }catch(error){console.error(error);status.textContent=`Could not create room: ${error.message||error.code}`;}
    finally{btn.disabled=false;}
}
async function respondStudyInvite(inviteId,roomId,accept){
    try {
        if (accept) {
            await runTransaction(db, async transaction => {
                const roomRef = doc(db, "studyRooms", roomId);
                const inviteRef = doc(db, "studyRoomInvites", inviteId);
                const [roomSnapshot, inviteSnapshot] = await Promise.all([
                    transaction.get(roomRef),
                    transaction.get(inviteRef)
                ]);
                const uid = auth.currentUser?.uid;
                if (!roomSnapshot.exists() || !inviteSnapshot.exists()) throw new Error("This invitation is no longer available.");
                const room = roomSnapshot.data();
                const invite = inviteSnapshot.data();
                if (!uid || invite.roomId !== roomId || invite.recipientUid !== uid || invite.status !== "pending" ||
                    !["waiting", "active"].includes(room.status) || (room.kickedUids || []).includes(uid) || (room.memberUids || []).includes(uid)) {
                    throw new Error("This invitation is no longer available.");
                }
                transaction.update(roomRef, { memberUids: [...room.memberUids, uid] });
                transaction.update(inviteRef, { status: "accepted", respondedAt: serverTimestamp() });
            });
            await openStudyRoom(roomId);
        } else {
            await updateDoc(doc(db, "studyRoomInvites", inviteId), { status: "declined", respondedAt: serverTimestamp() });
        }
    }
    catch(error){console.error(error);    showAppPopup(`Could not ${accept?"join":"decline"} invitation: ${error.message||error.code}`, { error: true });}
}
async function openStudyRoom(roomId){
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (activeStudyRoomUnsubscribe) activeStudyRoomUnsubscribe();
    if (activeStudyRoomRemovalUnsubscribe) activeStudyRoomRemovalUnsubscribe();
    stopStudyRoomTicker();
    activeStudyRoomId = roomId;
    activeStudyRoomData = null;
    activeStudyRoomProfiles = new Map();
    studyRoomProfileLoads = new Set();
    activeStudyRoomNotice = "";
    if (studyRoomChatUnsubscribe) studyRoomChatUnsubscribe();
    studyRoomChatUnsubscribe = null;
    if (studyPrivateChatUnsubscribe) studyPrivateChatUnsubscribe();
    studyPrivateChatUnsubscribe = null;
    studyPrivateChatTargetUid = null;
    const panel = document.getElementById("studyRoomLivePanel");
    panel.hidden = false;
    document.getElementById("studyLiveRoomTitle").textContent = "Loading room...";
    activeStudyRoomUnsubscribe = onSnapshot(doc(db, "studyRooms", roomId), snapshot => {
        if (activeStudyRoomId !== roomId || auth.currentUser?.uid !== uid) return;
        if (!snapshot.exists()) {
            closeActiveStudyRoom();
            return;
        }
        const previous = activeStudyRoomData;
        activeStudyRoomData = { id: snapshot.id, ...snapshot.data() };
        if (previous && (Number(activeStudyRoomData.participantEventRevision) || 0) >
            (Number(previous.participantEventRevision) || 0)) {
            activeStudyRoomNotice = activeStudyRoomData.lastParticipantEvent?.action === "kicked"
                ? "A participant was removed by the host."
                : "A participant left the Study Session.";
        }
        renderStudyRoom();
        if (activeStudyRoomData.status === "completed" && uid &&
            (activeStudyRoomData.memberUids || []).includes(uid)) {
            saveStudyRoomCompletion(roomId).catch(error => {
                console.error("Could not save Study Session completion:", error);
            });
        }
        if (previous && previous.status !== "completed" && activeStudyRoomData.status === "completed") {
            stopStudyRoomTicker();
            closeActiveStudyRoom();
            showPage("challenges");
            showAppPopup("The host ended the Study Session. Its final time and participant statistics have been saved.");
        }
    }, error => {
        console.error("Study Session sync failed:", error);
        if (activeStudyRoomId === roomId) {
            const notice = document.getElementById("studyLiveNotice");
            notice.textContent = "Could not sync this room. Check your connection and Firestore Rules.";
            notice.classList.add("error");
        }
    });

    if (uid) {
        studyRoomChatUnsubscribe = onSnapshot(query(
            collection(db, "studyRooms", roomId, "messages"),
            orderBy("createdAt", "asc")
        ), snapshot => {
            if (activeStudyRoomId !== roomId || auth.currentUser?.uid !== uid) return;
            renderStudyRoomChat(snapshot.docs);
        }, error => {
            console.error("Study Session chat sync failed:", error);
            const messages = document.getElementById("studyChatMessages");
            if (messages) messages.textContent = "Chat could not be loaded. Check your connection and Firestore Rules.";
        });
        activeStudyRoomRemovalUnsubscribe = onSnapshot(query(
            collection(db, "studyRoomRemovals"),
            where("roomId", "==", roomId),
            where("uid", "==", uid)
        ), snapshot => {
            const removal = snapshot.docs.find(item => item.data().type === "kicked");
            if (!removal || activeStudyRoomId !== roomId) return;
            const roomName = removal.data().roomName || "this Study Session";
            closeActiveStudyRoom();
            showPage("challenges");
            showAppPopup(`The host removed you from “${roomName}”. You no longer have access to this active session.`);
        }, error => console.error("Study Session removal notice sync failed:", error));
    }
}

function stopStudyRoomTicker() {
    if (studyRoomTicker) clearInterval(studyRoomTicker);
    studyRoomTicker = null;
}

function syncStudyRoomTicker() {
    if (endingStudyRoom) {
        stopStudyRoomTicker();
        return;
    }
    if (activeStudyRoomData?.status === "active" && !activeStudyRoomData.pausedAt) {
        if (!studyRoomTicker) studyRoomTicker = setInterval(tickStudyRoom, 1000);
        tickStudyRoom();
    } else {
        stopStudyRoomTicker();
        tickStudyRoom();
    }
}

function loadStudyRoomParticipantProfiles(room) {
    (room.memberUids || []).forEach(uid => {
        if (activeStudyRoomProfiles.has(uid) || studyRoomProfileLoads.has(uid)) return;
        studyRoomProfileLoads.add(uid);
        getDoc(doc(db, "publicProfiles", uid)).then(snapshot => {
            activeStudyRoomProfiles.set(uid, snapshot.exists() ? snapshot.data() : {});
            if (activeStudyRoomId === room.id && activeStudyRoomData) renderStudyRoom();
        }).catch(error => {
            console.error("Could not load Study Session participant profile:", error);
            activeStudyRoomProfiles.set(uid, {});
            if (activeStudyRoomId === room.id && activeStudyRoomData) renderStudyRoom();
        }).finally(() => studyRoomProfileLoads.delete(uid));
    });
}

function renderStudyRoom(){
    const room = activeStudyRoomData;
    if (!room) return;
    const uid = auth.currentUser?.uid;
    const isHost = room.ownerUid === uid;
    const members = room.memberUids || [];
    document.getElementById("studyLiveRoomTitle").textContent = room.name || "Study Session";
    document.getElementById("studyLiveRoomMembers").textContent = `${members.length} participant(s) • Hosted by ${room.ownerUsername || "Member"}`;
    document.getElementById("studyLiveStatus").textContent = room.status === "active" ? (room.pausedAt ? "PAUSED" : "LIVE") : room.status === "ending" ? "ENDING" : room.status === "completed" ? "COMPLETED" : room.status === "cancelled" ? "CANCELLED" : "WAITING";
    document.getElementById("studyLiveModeLabel").textContent = room.mode === "stopwatch"
        ? "STOPWATCH" : room.mode === "until" ? "UNTIL END TIME" : "COUNTDOWN";
    const invitePanel = document.getElementById("studyRoomInviteMore");
    if (invitePanel) invitePanel.hidden = !isHost || !["waiting", "active"].includes(room.status);
    const addFriendsSelect = document.getElementById("studyRoomAddFriends");
    if (addFriendsSelect) {
        const already = new Set(members);
        [...addFriendsSelect.options].forEach(option => { option.disabled = already.has(option.value); });
    }
    document.getElementById("studyHostControls").hidden = !isHost;
    document.getElementById("studyHostStartBtn").hidden = !isHost || room.status !== "waiting";
    document.getElementById("studyHostStopBtn").hidden = !isHost || !["active", "ending"].includes(room.status);
    const readyUids = Array.isArray(room.readyUids) ? room.readyUids : [];
    const allReady = members.length > 0 && members.every(memberUid => readyUids.includes(memberUid));
    const readyButton = document.getElementById("studyMemberReadyBtn");
    if (readyButton) {
        readyButton.hidden = room.status !== "waiting";
        readyButton.disabled = studyRoomActionPending;
        readyButton.classList.toggle("is-ready", readyUids.includes(uid));
        readyButton.innerHTML = readyUids.includes(uid) ? '<i class="fas fa-check"></i> YOU ARE READY' : '<i class="far fa-circle"></i> MARK AS READY';
    }
    document.getElementById("studyHostStartBtn").disabled = studyRoomActionPending || !allReady;
    document.getElementById("studyHostStopBtn").disabled = studyRoomActionPending;
    const pauseButton = document.getElementById("studyHostPauseBtn");
    const resumeButton = document.getElementById("studyHostResumeBtn");
    if (pauseButton) { pauseButton.hidden = !isHost || room.status !== "active" || !!room.pausedAt; pauseButton.disabled = studyRoomActionPending; }
    if (resumeButton) { resumeButton.hidden = !isHost || room.status !== "active" || !room.pausedAt; resumeButton.disabled = studyRoomActionPending; }
    if (!studyRoomActionPending) {
        document.getElementById("studyHostStartBtn").innerHTML = allReady ? '<i class="fas fa-play"></i> START SESSION' : '<i class="fas fa-hourglass-half"></i> WAITING FOR EVERYONE';
        if (!endingStudyRoom) document.getElementById("studyHostStopBtn").innerHTML = room.status === "ending"
            ? '<i class="fas fa-rotate"></i> RETRY SAVE' : '<i class="fas fa-stop"></i> END SESSION';
    }
    const leaveButton = document.getElementById("studyLeaveRoomBtn");
    leaveButton.hidden = ["ending", "completed", "cancelled"].includes(room.status);
    leaveButton.disabled = studyRoomActionPending;
    const deleteButton = document.getElementById("studyDeleteRoomBtn");
    deleteButton.hidden = !(isHost && room.status === "completed");
    const notice = document.getElementById("studyLiveNotice");
    notice.classList.remove("error");
    notice.textContent = activeStudyRoomNotice || (room.status === "ending"
        ? isHost ? "The timer is stopped. Retry saving the final time if needed." : "The host stopped the timer and is saving its final time."
        : room.status === "waiting" ? `${readyUids.length}/${members.length} members ready. The host can start when everyone is ready.`
        : room.pausedAt ? "The host paused the timer. Your study time is safely on hold."
        : isHost ? "You are the host. You can pause, resume, or end this shared timer." : "The host controls the timer. Your clock stays synchronized with the room.");

    loadStudyRoomParticipantProfiles(room);
    const participants = document.getElementById("studyLiveParticipants");
    participants.replaceChildren();
    members.forEach(memberUid => {
        const profile = activeStudyRoomProfiles.get(memberUid) || {};
        const name = memberUid === room.ownerUid ? room.ownerUsername || profile.username || "Host" : memberUid === uid ? currentProfile?.username || "You" : profile.username || `Member ${memberUid.slice(0, 6)}`;
        const card = document.createElement("div"); card.className = "study-participant-card";
        const open = document.createElement("button"); open.type = "button"; open.className = "study-participant-open";
        const avatar = document.createElement("span"); avatar.className = "study-participant-avatar";
        const photo = profile.avatarUrl || "";
        if (photo) { const img = document.createElement("img"); img.src = photo; img.alt = ""; img.loading = "lazy"; img.onerror = () => { avatar.textContent = (name[0] || "M").toUpperCase(); }; avatar.append(img); }
        else avatar.textContent = (name[0] || "M").toUpperCase();
        const identity = document.createElement("span"); identity.className = "study-participant-identity";
        const label = document.createElement("strong"); label.textContent = name + (memberUid === room.ownerUid ? " · HOST" : memberUid === uid ? " · YOU" : "");
        const state = document.createElement("small"); const isReady = readyUids.includes(memberUid);
        state.className = room.status === "waiting" ? (isReady ? "ready" : "not-ready") : (room.pausedAt ? "not-ready" : "ready"); state.textContent = room.status === "waiting" ? (isReady ? "READY" : "NOT READY") : (room.pausedAt ? "PAUSED" : "IN SESSION");
        identity.append(label, state); open.append(avatar, identity); open.addEventListener("click", () => openStudyMemberProfile(memberUid)); card.append(open);
        if (isHost && memberUid !== uid && ["waiting", "active"].includes(room.status)) {
            const kickButton = document.createElement("button"); kickButton.type = "button"; kickButton.className = "mini-action danger-action";
            kickButton.textContent = studyRoomActionPending ? "REMOVING..." : "REMOVE"; kickButton.disabled = studyRoomActionPending;
            kickButton.setAttribute("aria-label", `Remove ${name} from the Study Session`); kickButton.addEventListener("click", () => kickStudyRoomParticipant(memberUid, name, kickButton)); card.append(kickButton);
        }
        participants.append(card);
    });
    syncStudyRoomTicker();
}

function openStudyMemberProfile(memberUid) {
    const room=activeStudyRoomData;if(!room||!room.memberUids?.includes(memberUid))return;
    const profile=activeStudyRoomProfiles.get(memberUid)||{};
    const name=memberUid===room.ownerUid?room.ownerUsername||profile.username||"Host":memberUid===auth.currentUser?.uid?currentProfile?.username||"You":profile.username||"Member";
    const photo=profile.avatarUrl||"";
    const modal=document.getElementById("studyMemberProfileModal"),avatar=document.getElementById("studyMemberModalAvatar");
    if (!modal || !avatar) return;
    avatar.replaceChildren();
    if(photo){const img=document.createElement("img");img.src=photo;img.alt="";avatar.append(img);}else avatar.textContent=(name[0]||"M").toUpperCase();
    document.getElementById("studyMemberModalName").textContent=name;
    document.getElementById("studyMemberModalUsername").textContent=profile.username?"@"+profile.username:(memberUid===auth.currentUser?.uid?"Your profile":"Study member");
    const ready=(room.readyUids||[]).includes(memberUid),state=document.getElementById("studyMemberModalStatus");
    state.textContent=room.status==="waiting"?(ready?"READY":"NOT READY"):(room.pausedAt?"SESSION PAUSED":"IN SESSION");
    state.className="study-member-modal-status "+(room.status==="waiting"?(ready?"ready":"not-ready"):(room.pausedAt?"not-ready":"ready"));
    const messageButton=document.getElementById("studyMemberMessageBtn");messageButton.hidden=memberUid===auth.currentUser?.uid||!["waiting","active"].includes(room.status);
    messageButton.onclick=()=>{modal.hidden=true;openStudyPrivateChat(memberUid,name);};document.getElementById("studyPrivateChatPanel").hidden=true;modal.hidden=false;
}
async function openStudyPrivateChat(targetUid,targetName) {
    const room=activeStudyRoomData,uid=auth.currentUser?.uid;if(!room||!uid||!room.memberUids?.includes(targetUid)||targetUid===uid)return;
    if(studyPrivateChatUnsubscribe)studyPrivateChatUnsubscribe();studyPrivateChatTargetUid=targetUid;
    document.getElementById("studyPrivateChatPanel").hidden=false;document.getElementById("studyPrivateChatTitle").textContent="Chat with "+targetName;
    const chatId=[uid,targetUid].sort().join("_"),messages=document.getElementById("studyPrivateChatMessages");messages.replaceChildren();
    try {
        const chatRef=doc(db,"studyRooms",room.id,"privateChats",chatId);
        const chatSnapshot=await getDoc(chatRef);
        if(!chatSnapshot.exists()) await setDoc(chatRef,{memberUids:[uid,targetUid].sort(),updatedAt:serverTimestamp()});
        if(activeStudyRoomId!==room.id||studyPrivateChatTargetUid!==targetUid)return;
    } catch(error) { console.error("Could not initialize private chat:",error); messages.textContent="Private chat could not be opened."; return; }
    studyPrivateChatUnsubscribe=onSnapshot(query(collection(db,"studyRooms",room.id,"privateChats",chatId,"messages"),orderBy("createdAt","asc")),snap=>{
        if(activeStudyRoomId!==room.id||studyPrivateChatTargetUid!==targetUid)return;messages.replaceChildren();
        if(snap.empty){const p=document.createElement("p");p.className="study-chat-empty";p.textContent="Start a private conversation.";messages.append(p);return;}
        snap.forEach(item=>{const data=item.data(),bubble=document.createElement("article");bubble.className="study-chat-message"+(data.senderUid===uid?" mine":"");
            const sender=document.createElement("strong");sender.textContent=data.senderUid===uid?"You":data.senderUsername||targetName;
            const body=document.createElement("p");body.textContent=data.text||"";const time=document.createElement("time"),ms=studyRoomTimestampMillis(data.createdAt);
            time.textContent=ms?new Date(ms).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Sending…";bubble.append(sender,body,time);messages.append(bubble);});
        messages.scrollTop=messages.scrollHeight;
    },error=>{console.error("Private Study chat sync failed:",error);messages.textContent="Private chat could not be loaded.";});
}
const privateChatForm=document.getElementById("studyPrivateChatForm");
if(privateChatForm)privateChatForm.addEventListener("submit",async event=>{
    event.preventDefault();const room=activeStudyRoomData,uid=auth.currentUser?.uid,targetUid=studyPrivateChatTargetUid;
    const input=document.getElementById("studyPrivateChatInput"),button=document.getElementById("studyPrivateChatSendBtn"),value=input?.value.trim();
    if(!room||!uid||!targetUid||!value||!room.memberUids?.includes(targetUid)||studyRoomChatSending)return;
    studyRoomChatSending=true;button.disabled=true;
    try{const chatId=[uid,targetUid].sort().join("_");await addDoc(collection(db,"studyRooms",room.id,"privateChats",chatId,"messages"),{senderUid:uid,recipientUid:targetUid,senderUsername:currentProfile?.username||"Member",text:value.slice(0,1000),createdAt:serverTimestamp()});input.value="";input.focus();}
    catch(error){console.error("Private chat send failed:",error);showAppPopup("Could not send your private message.",{error:true});}
    finally{studyRoomChatSending=false;button.disabled=false;}
});
const closeMemberModal=document.getElementById("studyMemberModalClose");
const memberModalBackdrop=document.getElementById("studyMemberModalBackdrop");
if(memberModalBackdrop)memberModalBackdrop.addEventListener("click",()=>closeMemberModal?.click());
if(closeMemberModal)closeMemberModal.addEventListener("click",()=>{if(studyPrivateChatUnsubscribe)studyPrivateChatUnsubscribe();studyPrivateChatUnsubscribe=null;studyPrivateChatTargetUid=null;document.getElementById("studyMemberProfileModal").hidden=true;});
const closePrivateChat=document.getElementById("studyPrivateChatBack");
if(closePrivateChat)closePrivateChat.addEventListener("click",()=>{if(studyPrivateChatUnsubscribe)studyPrivateChatUnsubscribe();studyPrivateChatUnsubscribe=null;studyPrivateChatTargetUid=null;document.getElementById("studyPrivateChatPanel").hidden=true;});

function renderStudyRoomChat(docs) {
    const container = document.getElementById("studyChatMessages");
    if (!container) return;
    container.replaceChildren();
    if (!docs.length) {
        const empty = document.createElement("p");
        empty.className = "study-chat-empty";
        empty.textContent = "Say hello and start planning your study session.";
        container.append(empty);
        return;
    }
    docs.forEach(snapshot => {
        const data = snapshot.data();
        const bubble = document.createElement("article");
        bubble.className = "study-chat-message" + (data.senderUid === auth.currentUser?.uid ? " mine" : "");
        const sender = document.createElement("strong");
        sender.textContent = data.senderUid === auth.currentUser?.uid ? "You" : (data.senderUsername || "Member");
        const body = document.createElement("p");
        body.textContent = data.text || "";
        const time = document.createElement("time");
        const millis = studyRoomTimestampMillis(data.createdAt);
        time.textContent = millis ? new Date(millis).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Sending…";
        bubble.append(sender, body, time);
        container.append(bubble);
    });
    container.scrollTop = container.scrollHeight;
}
const studyChatForm = document.getElementById("studyChatForm");
if (studyChatForm) studyChatForm.addEventListener("submit", async event => {
    event.preventDefault();
    const room = activeStudyRoomData;
    const user = auth.currentUser;
    const input = document.getElementById("studyChatInput");
    const button = document.getElementById("studyChatSendBtn");
    const textValue = input?.value.trim();
    if (!room || !user || !textValue || !(room.memberUids || []).includes(user.uid) || studyRoomChatSending) return;
    studyRoomChatSending = true;
    button.disabled = true;
    try {
        await addDoc(collection(db, "studyRooms", room.id, "messages"), {
            senderUid: user.uid,
            senderUsername: currentProfile?.username || user.displayName || "Member",
            text: textValue.slice(0, 1000),
            createdAt: serverTimestamp()
        });
        input.value = "";
        input.focus();
    } catch (error) {
        console.error("Could not send Study Session chat message:", error);
        showAppPopup("Could not send your message. Check your connection and try again.", { error: true });
    } finally {
        studyRoomChatSending = false;
        button.disabled = false;
    }
});
const addRoomFriendsBtn = document.getElementById("studyRoomAddFriendsBtn");
if (addRoomFriendsBtn) addRoomFriendsBtn.addEventListener("click", async () => {
    const room = activeStudyRoomData;
    const user = auth.currentUser;
    const select = document.getElementById("studyRoomAddFriends");
    const status = document.getElementById("studyRoomAddFriendsStatus");
    if (!room || !user || room.ownerUid !== user.uid || !["waiting", "active"].includes(room.status)) return;
    const selected = [...(select?.selectedOptions || [])].map(option => option.value).filter(Boolean)
        .filter(friendUid => !(room.memberUids || []).includes(friendUid));
    if (!selected.length) { status.textContent = "Choose at least one friend who is not already in this session."; return; }
    addRoomFriendsBtn.disabled = true;
    status.textContent = "Sending invitations...";
    try {
        const existing = await Promise.all(selected.map(friendUid => getDoc(doc(db, "studyRoomInvites", `${room.id}_${friendUid}`))));
        const writes = selected.filter((friendUid, index) => !existing[index].exists()).map(friendUid => {
            return setDoc(doc(db, "studyRoomInvites", `${room.id}_${friendUid}`), {
                roomId: room.id, roomName: room.name || "Study Session", mode: room.mode || "stopwatch",
                senderUid: user.uid, senderUsername: currentProfile?.username || "Member",
                recipientUid: friendUid, status: "pending", createdAt: serverTimestamp()
            });
        });
        await Promise.all(writes);
        status.textContent = writes.length ? `${writes.length} invitation(s) sent to this session.` : "These friends already have an invitation for this session.";
        select.selectedIndex = -1;
    } catch (error) {
        console.error("Could not invite more Study Session participants:", error);
        status.textContent = `Could not send invitations (${error.code || "error"}).`;
    } finally {
        addRoomFriendsBtn.disabled = false;
    }
});

function tickStudyRoom(){
    const room = activeStudyRoomData;
    if (!room) { stopStudyRoomTicker(); return; }
    const clock = document.getElementById("studyLiveClock");
    const subtext = document.getElementById("studyLiveSubtext");
    if (room.status === "waiting") {
        stopStudyRoomTicker();
        clock.textContent = room.mode === "countdown" ? studyFormatClock(room.durationSeconds) : "00:00:00";
        subtext.textContent = "Waiting for everyone to be ready";
        return;
    }
    if (room.status === "ending") {
        stopStudyRoomTicker();
        clock.textContent = studyFormatClock(studyRoomElapsedSeconds(room, room.endRequestedAt || Date.now()));
        subtext.textContent = "Session stopped. Saving final study time…";
        return;
    }
    if (room.status === "completed" || room.status === "cancelled") {
        stopStudyRoomTicker();
        clock.textContent = studyFormatClock(room.finalSeconds || 0);
        subtext.textContent = room.status === "completed" ? "This study session has ended" : "The host left before starting";
        return;
    }
    const value = studyRoomRemaining(room);
    if (room.pausedAt) { clock.textContent = studyFormatClock(value ?? 0); subtext.textContent = "PAUSED BY HOST"; return; }
    if (value === null) {
        clock.textContent = "--:--:--";
        subtext.textContent = "Synchronizing session start…";
        return;
    }
    clock.textContent = studyFormatClock(value);
    subtext.textContent = room.mode === "stopwatch" ? "Elapsed study time" :
        `Time remaining${room.targetEndAt ? ` • ends ${new Date(studyRoomTimestampMillis(room.targetEndAt)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`;
    if (!room.pausedAt && room.mode !== "stopwatch" && value <= 0 && room.ownerUid === auth.currentUser?.uid) endStudyRoom(true);
}
const readyStudyMemberBtn=document.getElementById("studyMemberReadyBtn");
if(readyStudyMemberBtn)readyStudyMemberBtn.addEventListener("click",async()=>{
    const room=activeStudyRoomData, uid=auth.currentUser?.uid;
    if(!room||!uid||room.status!=="waiting"||studyRoomActionPending)return;
    studyRoomActionPending=true;renderStudyRoom();
    try{await manageStudyRoomCall({action:"ready",roomId:room.id,ready:!(room.readyUids||[]).includes(uid)});}
    catch(error){showAppPopup(studyRoomActionError(error,"update readiness"),{error:true});}
    finally{studyRoomActionPending=false;if(activeStudyRoomData)renderStudyRoom();}
});
const startStudyHostBtn=document.getElementById("studyHostStartBtn");
if(startStudyHostBtn)startStudyHostBtn.addEventListener("click",async()=>{
    const room=activeStudyRoomData, roomId=activeStudyRoomId, ready=room?.readyUids||[];
    if(!room||room.ownerUid!==auth.currentUser?.uid||room.status!=="waiting"||!room.memberUids?.length||!room.memberUids.every(memberUid=>ready.includes(memberUid))||studyRoomActionPending)return;
    studyRoomActionPending=true;renderStudyRoom();
    try{await manageStudyRoomCall({action:"start",roomId});}
    catch(error){showAppPopup(studyRoomActionError(error,"start"),{error:true});}
    finally{studyRoomActionPending=false;if(activeStudyRoomId===roomId&&activeStudyRoomData)renderStudyRoom();}
});
const pauseStudyHostBtn=document.getElementById("studyHostPauseBtn");
if(pauseStudyHostBtn)pauseStudyHostBtn.addEventListener("click",async()=>{
    const room=activeStudyRoomData;if(!room||room.ownerUid!==auth.currentUser?.uid||room.status!=="active"||room.pausedAt||studyRoomActionPending)return;
    studyRoomActionPending=true;renderStudyRoom();try{await manageStudyRoomCall({action:"pause",roomId:room.id});}
    catch(error){showAppPopup(studyRoomActionError(error,"pause"),{error:true});}
    finally{studyRoomActionPending=false;if(activeStudyRoomData)renderStudyRoom();}
});
const resumeStudyHostBtn=document.getElementById("studyHostResumeBtn");
if(resumeStudyHostBtn)resumeStudyHostBtn.addEventListener("click",async()=>{
    const room=activeStudyRoomData;if(!room||room.ownerUid!==auth.currentUser?.uid||room.status!=="active"||!room.pausedAt||studyRoomActionPending)return;
    studyRoomActionPending=true;renderStudyRoom();try{await manageStudyRoomCall({action:"resume",roomId:room.id});}
    catch(error){showAppPopup(studyRoomActionError(error,"resume"),{error:true});}
    finally{studyRoomActionPending=false;if(activeStudyRoomData)renderStudyRoom();}
});
const stopStudyHostBtn=document.getElementById("studyHostStopBtn");
if(stopStudyHostBtn)stopStudyHostBtn.addEventListener("click",()=>endStudyRoom(false));
async function endStudyRoom(auto){
    const room = activeStudyRoomData;
    if (!room || room.ownerUid !== auth.currentUser?.uid ||
        !["active", "ending"].includes(room.status) || endingStudyRoom || studyRoomActionPending) return;
    endingStudyRoom = true;
    stopStudyRoomTicker();
    const stopButton = document.getElementById("studyHostStopBtn");
    if (stopButton) {
        stopButton.disabled = true;
        stopButton.textContent = room.status === "ending" ? "RETRYING..." : "ENDING...";
    }
    if (room.status === "active" && !auto &&
        !await appConfirm("End this Study Session for everyone? Final study time and participant statistics will be saved.")) {
        endingStudyRoom = false;
        if (activeStudyRoomData) renderStudyRoom();
        return;
    }

    const roomId = room.id;
    studyRoomActionPending = true;
    if (room.status === "active") {
        activeStudyRoomData = { ...room, status: "ending", endRequestedAt: new Date(), autoEnded: auto };
        renderStudyRoom();
    }
    document.getElementById("studyLiveSubtext").textContent = "Saving final session time…";
    try {
        await runTransaction(db, async transaction => {
            const roomRef = doc(db, "studyRooms", roomId);
            const snapshot = await transaction.get(roomRef);
            if (!snapshot.exists()) throw new Error("This Study Session no longer exists.");
            const latest = snapshot.data();
            if (latest.status === "ending" || latest.status === "completed") return;
            if (latest.ownerUid !== auth.currentUser?.uid || latest.status !== "active") {
                throw new Error("Only the host can end an active Study Session.");
            }
            transaction.update(roomRef, {
                status: "ending",
                endRequestedAt: serverTimestamp(),
                autoEnded: auto
            });
        });
        const finalized = await runTransaction(db, async transaction => {
            const roomRef = doc(db, "studyRooms", roomId);
            const snapshot = await transaction.get(roomRef);
            if (!snapshot.exists()) throw new Error("This Study Session no longer exists.");
            const latest = snapshot.data();
            if (latest.status === "completed") return latest;
            if (latest.ownerUid !== auth.currentUser?.uid || latest.status !== "ending" || !latest.endRequestedAt) {
                throw new Error("The Study Session is not ready to be finalized.");
            }
            const finalSeconds = studyRoomElapsedSeconds(latest, latest.endRequestedAt);
            transaction.update(roomRef, {
                status: "completed",
                endedAt: latest.endRequestedAt,
                finalSeconds,
                autoEnded: latest.autoEnded === true
            });
            return { ...latest, status: "completed", endedAt: latest.endRequestedAt, finalSeconds, autoEnded: latest.autoEnded === true };
        });
        if (activeStudyRoomId === roomId && activeStudyRoomData?.status !== "completed") {
            activeStudyRoomData = { ...activeStudyRoomData, ...finalized };
            if ((activeStudyRoomData.memberUids || []).includes(auth.currentUser?.uid)) {
                saveStudyRoomCompletion(roomId).catch(error => {
                    console.error("Could not save Study Session completion:", error);
                });
            }
            renderStudyRoom();
            closeActiveStudyRoom();
            showPage("challenges");
            showAppPopup("Study Session ended. Final study time and participant statistics have been saved.");
        }
    } catch (error) {
        console.error("Could not end Study Session:", error);
        if (activeStudyRoomId === roomId && activeStudyRoomData) {
            renderStudyRoom();
            showAppPopup(
                activeStudyRoomData.status === "ending"
                    ? `The timer is stopped, but saving the final session time did not finish: ${studyRoomActionError(error, "end")} Use RETRY SAVE when the connection is available.`
                    : studyRoomActionError(error, "end"),
                { error: true }
            );
        }
    } finally {
        studyRoomActionPending = false;
        endingStudyRoom = false;
        if (activeStudyRoomId === roomId && activeStudyRoomData) renderStudyRoom();
    }
}


function closeActiveStudyRoom(){
    if (studyRoomChatUnsubscribe) studyRoomChatUnsubscribe();
    studyRoomChatUnsubscribe = null;
    if (studyPrivateChatUnsubscribe) studyPrivateChatUnsubscribe();
    studyPrivateChatUnsubscribe = null; studyPrivateChatTargetUid = null;
    if (activeStudyRoomUnsubscribe) activeStudyRoomUnsubscribe();
    if (activeStudyRoomRemovalUnsubscribe) activeStudyRoomRemovalUnsubscribe();
    activeStudyRoomUnsubscribe = null;
    activeStudyRoomRemovalUnsubscribe = null;
    activeStudyRoomId = null;
    activeStudyRoomData = null;
    activeStudyRoomProfiles = new Map();
    studyRoomProfileLoads = new Set();
    stopStudyRoomTicker();
    const panel = document.getElementById("studyRoomLivePanel");
    if (panel) panel.hidden = true;
}

async function saveStudyRoomCompletion(roomId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const roomRef = doc(db, "studyRooms", roomId);
    const completionRef = doc(db, "studyRoomCompletions", `${roomId}_${uid}`);
    await runTransaction(db, async transaction => {
        const [roomSnapshot, completionSnapshot] = await Promise.all([
            transaction.get(roomRef),
            transaction.get(completionRef)
        ]);
        if (!roomSnapshot.exists() || completionSnapshot.exists()) return;
        const room = roomSnapshot.data();
        if (room.status !== "completed" || !(room.memberUids || []).includes(uid)) return;
        transaction.set(completionRef, {
            roomId,
            uid,
            durationSeconds: room.finalSeconds,
            mode: room.mode,
            startedAt: room.startedAt,
            endedAt: room.endedAt,
            completedAt: room.endedAt
        });
    });
}

async function leaveStudyRoomTransaction(roomId) {
    const response = await manageStudyRoomCall({ action: "leave", roomId });
    return response.data || {};
}

async function kickStudyRoomParticipantTransaction(roomId, targetUid) {
    const response = await manageStudyRoomCall({ action: "kick", roomId, targetUid });
    return response.data || {};
}

async function leaveStudyRoom(roomId = activeStudyRoomId, button = document.getElementById("studyLeaveRoomBtn")) {
    if (!roomId || !auth.currentUser || studyRoomActionPending) return;
    if (!await appConfirm("Leave this Study Session? If you are the host, host controls will transfer to another participant.")) return;
    studyRoomActionPending = true;
    const originalText = button?.textContent || "LEAVE SESSION";
    if (button) { button.disabled = true; button.textContent = "LEAVING..."; }
    try {
        const response = await leaveStudyRoomTransaction(roomId);
        if (activeStudyRoomId === roomId) closeActiveStudyRoom();
        showPage("challenges");
        showAppPopup(response.status === "completed"
            ? "You left the session. No participants remained, so the session was ended and your study time was saved."
            : response.hostTransferred
                ? "You left the Study Session. Host controls were transferred safely."
                : "You left the Study Session.");
    } catch (error) {
        console.error("Could not leave Study Session:", error);
        showAppPopup(studyRoomActionError(error, "leave"), { error: true });
    } finally {
        studyRoomActionPending = false;
        if (button) { button.disabled = false; button.textContent = originalText; }
        if (activeStudyRoomData) renderStudyRoom();
    }
}

async function kickStudyRoomParticipant(targetUid, participantName, button) {
    const room = activeStudyRoomData;
    if (!room || room.ownerUid !== auth.currentUser?.uid || studyRoomActionPending ||
        !["waiting", "active"].includes(room.status)) return;
    if (!await appConfirm(`Remove ${participantName} from this Study Session? They will not be able to rejoin this session.`)) return;
    const roomId = room.id;
    studyRoomActionPending = true;
    if (button) { button.disabled = true; button.textContent = "REMOVING..."; }
    renderStudyRoom();
    try {
        await kickStudyRoomParticipantTransaction(roomId, targetUid);
        activeStudyRoomNotice = `${participantName} was removed by the host.`;
        if (activeStudyRoomData && activeStudyRoomId === roomId) renderStudyRoom();
    } catch (error) {
        console.error("Could not remove Study Session participant:", error);
        showAppPopup(studyRoomActionError(error, "remove"), { error: true });
    } finally {
        studyRoomActionPending = false;
        if (activeStudyRoomData && activeStudyRoomId === roomId) renderStudyRoom();
    }
}

const leaveStudyRoomBtn=document.getElementById("studyLeaveRoomBtn");
if(leaveStudyRoomBtn) leaveStudyRoomBtn.addEventListener("click",()=>leaveStudyRoom());
const deleteStudyRoomBtn=document.getElementById("studyDeleteRoomBtn");
if(deleteStudyRoomBtn) deleteStudyRoomBtn.addEventListener("click",async()=>{
    const r=activeStudyRoomData, uid=auth.currentUser?.uid;
    if(!r||r.ownerUid!==uid||r.status!=="completed")return;
    if(!await appConfirm("Permanently delete this completed Study Session? Saved study statistics will be kept."))return;
    try{await deleteDoc(doc(db,"studyRooms",r.id));closeActiveStudyRoom();}
    catch(e){showAppPopup(`Could not delete room: ${e.message||e.code}`, { error: true });}
});


const studyFullscreenBtn = document.getElementById("studyFullscreenBtn");
const studyClockPanel = document.getElementById("studyClockPanel");
const studyFullscreenExitBtn = document.getElementById("studyFullscreenExitBtn");
const timerFullscreenBtn = document.getElementById("timerExpandBtn");
const timerFullscreenExitBtn = document.getElementById("timerFullscreenExitBtn");
const studyTimerSection = document.getElementById("studyTimer");
let screenWakeLock = null;
let fullscreenTouchY = null;

if (studyTimerSection) {
    studyTimerSection.addEventListener("touchstart", event => {
        fullscreenTouchY = document.fullscreenElement === studyTimerSection && event.touches.length === 1
            ? event.touches[0].clientY
            : null;
    }, { passive: true });

    studyTimerSection.addEventListener("touchmove", event => {
        if (document.fullscreenElement !== studyTimerSection || fullscreenTouchY === null || event.touches.length !== 1) return;

        const currentY = event.touches[0].clientY;
        const scrollDelta = fullscreenTouchY - currentY;
        fullscreenTouchY = currentY;
        if (!scrollDelta || !event.cancelable) return;

        const maxScroll = studyTimerSection.scrollHeight - studyTimerSection.clientHeight;
        const nextScrollTop = Math.max(0, Math.min(maxScroll, studyTimerSection.scrollTop + scrollDelta));
        if (nextScrollTop !== studyTimerSection.scrollTop) {
            studyTimerSection.scrollTop = nextScrollTop;
            event.preventDefault();
        }
    }, { passive: false });

    studyTimerSection.addEventListener("touchend", () => {
        fullscreenTouchY = null;
    }, { passive: true });

    studyTimerSection.addEventListener("touchcancel", () => {
        fullscreenTouchY = null;
    }, { passive: true });
}

function isClockFullscreen() {
    return document.fullscreenElement === studyTimerSection ||
        document.fullscreenElement === studyClockPanel;
}

function showFullscreenNotice(text, error = false) {
    if (document.fullscreenElement === studyTimerSection) {
        setTimerMessage(text, error);
        return;
    }

    const notice = document.getElementById("studyLiveNotice");
    if (notice) {
        notice.textContent = text;
        notice.classList.toggle("error", error);
    }
}

async function lockClockOrientation() {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (typeof screen.orientation?.lock !== "function") {
        showFullscreenNotice("Rotate your phone to landscape for the best view.");
        return;
    }

    try {
        await screen.orientation.lock("landscape");
    } catch (error) {
        console.warn("Could not lock the phone to landscape:", error);
        showFullscreenNotice("Rotate your phone to landscape for the best view.");
    }
}

async function keepScreenAwake() {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (!navigator.wakeLock) {
        showFullscreenNotice("This browser cannot keep the screen awake. Check its screen timeout settings.");
        return;
    }
    if (screenWakeLock && !screenWakeLock.released) return;

    try {
        const wakeLock = await navigator.wakeLock.request("screen");
        screenWakeLock = wakeLock;
        wakeLock.addEventListener("release", () => {
            if (screenWakeLock === wakeLock) screenWakeLock = null;
        });
    } catch (error) {
        console.warn("Could not keep the phone screen awake:", error);
        showFullscreenNotice("Your browser could not keep the screen awake. Check its screen timeout settings.", true);
    }
}

function releaseScreenWakeLock() {
    if (!screenWakeLock) return;
    const wakeLock = screenWakeLock;
    screenWakeLock = null;
    wakeLock.release().catch(error => {
        console.warn("Could not release the screen wake lock:", error);
    });
}

async function setFullscreen(element, shouldEnter, errorMessage) {
    try {
        if (shouldEnter && document.fullscreenElement && document.fullscreenElement !== element) {
            await document.exitFullscreen();
        }
        if (shouldEnter && document.fullscreenElement !== element) {
            await element.requestFullscreen();
            if (element === studyTimerSection || element === studyClockPanel) {
                await lockClockOrientation();
            }
        } else if (!shouldEnter && document.fullscreenElement === element) {
            await document.exitFullscreen();
        }
    } catch (error) {
        console.error(errorMessage, error);
        if (element === studyTimerSection) {
            setTimerMessage(errorMessage, true);
        } else {
            const notice = document.getElementById("studyLiveNotice");
            if (notice) notice.textContent = errorMessage;
        }
    }
}

if (studyFullscreenBtn && studyClockPanel) {
    studyFullscreenBtn.addEventListener("click", () => {
        setFullscreen(
            studyClockPanel,
            document.fullscreenElement !== studyClockPanel,
            "Could not change the study room full screen."
        );
    });
    studyFullscreenExitBtn?.addEventListener("click", () => {
        setFullscreen(studyClockPanel, false, "Could not exit the study room full screen.");
    });
}

if (timerFullscreenBtn && studyTimerSection) {
    timerFullscreenBtn.addEventListener("click", () => {
        setFullscreen(
            studyTimerSection,
            document.fullscreenElement !== studyTimerSection,
            "Could not change the timer full screen."
        );
    });
    timerFullscreenExitBtn?.addEventListener("click", () => {
        setFullscreen(studyTimerSection, false, "Could not exit the timer full screen.");
    });
}

document.addEventListener("fullscreenchange", () => {
    const timerIsFullscreen = document.fullscreenElement === studyTimerSection;
    const studyIsFullscreen = document.fullscreenElement === studyClockPanel;

    if (isClockFullscreen()) {
        keepScreenAwake();
    } else {
        releaseScreenWakeLock();
        if (window.matchMedia("(pointer: coarse)").matches) {
            try {
                screen.orientation?.unlock?.();
            } catch (error) {
                console.warn("Could not unlock the phone orientation:", error);
            }
        }
    }

    if (timerFullscreenBtn) {
        timerFullscreenBtn.innerHTML = timerIsFullscreen
            ? '<i class="fas fa-compress"></i> <span>EXIT FULL SCREEN</span>'
            : '<i class="fas fa-expand"></i> <span>FULL SCREEN TIMER</span>';
        timerFullscreenBtn.setAttribute("aria-expanded", String(timerIsFullscreen));
        timerFullscreenBtn.setAttribute("aria-label", timerIsFullscreen ? "Exit full screen" : "Enter full screen");
    }
    if (studyFullscreenBtn) {
        studyFullscreenBtn.innerHTML = studyIsFullscreen
            ? '<i class="fas fa-compress"></i> EXIT FULL SCREEN'
            : '<i class="fas fa-expand"></i> FULL SCREEN TIMER';
    }
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeSession?.status === "running") updateTimerDisplay();
    if (!document.hidden && isClockFullscreen()) {
        keepScreenAwake();
    }
});

/* COMMUNITY CHALLENGES + WEEKLY LEADERBOARD */
const CHALLENGE_DEFINITIONS = [
    { id: "daily_2h", title: "Daily Focus", description: "Complete 2 hours of study today.", targetSeconds: 7200, period: "daily", unit: "study time", icon: "☀️" },
    { id: "weekly_5h", title: "Weekly Warrior", description: "Study for 5 hours in the last 7 days.", targetSeconds: 18000, period: "weekly", unit: "study time", icon: "⚡" },
    { id: "weekly_5sessions", title: "Consistency King", description: "Complete 5 study sessions in 7 days.", targetSessions: 5, period: "weekly", unit: "sessions", icon: "🔥" }
];

function getSessionStartMillis(data) {
    return data.startedAt?.toMillis?.() || 0;
}

function formatChallengeTime(seconds) {
    return formatStudyTotal(seconds);
}

async function loadCommunityFeatures(uid) {
    await runDashboardFeature("weekly leaderboard", () => loadWeeklyLeaderboard(uid));
    await runDashboardFeature("leaderboard updates", async () => initStudyLeaderboardUpdates(uid));
    await Promise.all([
        runDashboardFeature("study rooms", () => initStudyRooms(uid)),
        runDashboardFeature("leagues", () => loadMyLeagues()),
        runDashboardFeature("to-do list", () => loadTodoList())
    ]);
}

async function loadChallenges(uid) {
    const grid = document.getElementById("challengeGrid");
    try {
        const [joinedSnapshot, sessionsSnapshot] = await Promise.all([
            getDocs(collection(db, "users", uid, "challenges")),
            getDocs(query(collection(db, "studySessions"), where("uid", "==", uid)))
        ]);
        const joinedAtById = new Map(joinedSnapshot.docs.map(item => [item.id, item.data().joinedAt?.toMillis?.() || 0]));
        const joined = new Set(joinedAtById.keys());
        const sessions = sessionsSnapshot.docs.map(item => item.data()).filter(item => item.status === "completed");
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

        grid.replaceChildren();
        CHALLENGE_DEFINITIONS.forEach(challenge => {
            const isJoined = joined.has(challenge.id);
            const periodThreshold = challenge.period === "daily" ? todayStart : weekStart;
            const threshold = Math.max(periodThreshold, joinedAtById.get(challenge.id) || 0);
            const relevant = sessions.filter(session => getSessionStartMillis(session) >= threshold);
            const seconds = relevant.reduce((sum, session) => sum + (Number(session.durationSeconds) || 0), 0);
            const count = relevant.length;
            const progress = challenge.targetSeconds
                ? Math.min(100, Math.round(seconds / challenge.targetSeconds * 100))
                : Math.min(100, Math.round(count / challenge.targetSessions * 100));
            const current = challenge.targetSeconds ? Math.min(seconds, challenge.targetSeconds) : Math.min(count, challenge.targetSessions);
            const target = challenge.targetSeconds ? challenge.targetSeconds : challenge.targetSessions;
            const card = document.createElement("article");
            card.className = "challenge-card";
            const icon = document.createElement("div");
            icon.className = "challenge-card-icon";
            icon.textContent = challenge.icon;
            const title = document.createElement("h4");
            title.textContent = challenge.title;
            const desc = document.createElement("p");
            desc.textContent = challenge.description;
            const meta = document.createElement("div");
            meta.className = "challenge-progress-meta";
            const currentText = challenge.targetSeconds ? formatChallengeTime(current) : `${current} / ${target}`;
            const targetText = challenge.targetSeconds ? formatChallengeTime(target) : `${target} sessions`;
            meta.innerHTML = `<span>${isJoined ? currentText : "Not joined"}</span><span>${targetText}</span>`;
            const track = document.createElement("div");
            track.className = "challenge-track";
            const fill = document.createElement("div");
            fill.className = "challenge-fill";
            fill.style.width = `${isJoined ? progress : 0}%`;
            track.append(fill);
            const button = document.createElement("button");
            button.type = "button";
            button.className = isJoined ? "challenge-join-btn joined" : "challenge-join-btn";
            button.textContent = isJoined ? (progress >= 100 ? "COMPLETED ✓" : "JOINED") : "JOIN CHALLENGE";
            button.disabled = isJoined;
            button.addEventListener("click", () => joinChallenge(uid, challenge));
            card.append(icon, title, desc, meta, track, button);
            grid.append(card);
        });
    } catch (error) {
        console.error("Could not load challenges:", error);
        grid.textContent = "Could not load challenges. Check Firestore Rules.";
    }
}

async function joinChallenge(uid, challenge) {
    const button = [...document.querySelectorAll(".challenge-join-btn")]
        .find(item => item.textContent === "JOIN CHALLENGE" && item.closest(".challenge-card")?.querySelector("h4")?.textContent === challenge.title);
    if (button) { button.disabled = true; button.textContent = "JOINING..."; }
    try {
        await setDoc(doc(db, "users", uid, "challenges", challenge.id), {
            challengeId: challenge.id,
            title: challenge.title,
            joinedAt: serverTimestamp()
        });
        await loadChallenges(uid);
    } catch (error) {
        console.error("Could not join challenge:", error);
        if (button) { button.disabled = false; button.textContent = "JOIN CHALLENGE"; }
        appAlert(error.code === "permission-denied" ? "Firestore denied joining this challenge. Publish the updated rules." : error.message);
    }
}

async function loadWeeklyLeaderboard(currentUid) {
    if (auth.currentUser?.uid !== currentUid) return;
    const list = document.getElementById("leaderboardList");
    try {
        const [sessionsSnapshot, roomSessionsSnapshot, profilesSnapshot] = await Promise.all([
            runFirestoreOperation("read studySessions for the global leaderboard", () => getDocs(collection(db, "studySessions"))),
            runFirestoreOperation("read studyRoomCompletions for the global leaderboard", () => getDocs(collection(db, "studyRoomCompletions"))),
            runFirestoreOperation("read publicProfiles for the global leaderboard", () => getDocs(collection(db, "publicProfiles")))
        ]);
        if (auth.currentUser?.uid !== currentUid) return;
        const records = normalizeStudyRecords(sessionsSnapshot.docs, roomSessionsSnapshot.docs);
        const sessionNames = new Map();
        sessionsSnapshot.forEach(item => {
            const data = item.data();
            if (data.uid && data.username) sessionNames.set(data.uid, data.username);
        });
        const profiles = new Map(profilesSnapshot.docs.map(item => [item.id, item.data()]));
        const recordsByUser = new Map();
        records.forEach(record => {
            if (!recordsByUser.has(record.uid)) recordsByUser.set(record.uid, []);
            recordsByUser.get(record.uid).push(record);
        });
        const ranked = [...recordsByUser.entries()].map(([uid, userRecords]) => {
            const profile = profiles.get(uid) || {};
            const stats = calculateStudyStatistics(userRecords, profile.studyTimeZone || "UTC");
            return {
                uid,
                username: profile.username || sessionNames.get(uid) || (uid === currentUid ? currentProfile?.username : "Community Member") || "Community Member",
                stats
            };
        }).sort((a, b) => b.stats.totalSeconds - a.stats.totalSeconds || a.username.localeCompare(b.username)).slice(0, 10);
        list.replaceChildren();
        if (!ranked.length) {
            const empty = document.createElement("p");
            empty.className = "community-loading";
            empty.textContent = "No completed sessions yet. Be the first to get on the all-time board!";
            list.append(empty);
            return;
        }
        ranked.forEach((member, index) => {
            const row = document.createElement("div");
            row.className = `leaderboard-row${member.uid === currentUid ? " is-current-user" : ""}`;
            const left = document.createElement("div");
            left.className = "leaderboard-member";
            const rank = document.createElement("span");
            rank.className = `leaderboard-rank rank-${index + 1}`;
            rank.textContent = String(index + 1).padStart(2, "0");
            const name = document.createElement("strong");
            name.textContent = member.username + (member.uid === currentUid ? " (YOU)" : "");
            left.append(rank, name);
            const time = document.createElement("strong");
            time.className = "leaderboard-time";
            time.textContent = `${formatStudyDuration(member.stats.totalSeconds)} total`;
            time.title = `${member.stats.completedSessions} completed sessions · ${member.stats.studyDays} study days`;
            row.append(left, time);
            list.append(row);
        });
    } catch (error) {
        console.error("Could not load leaderboard:", error);
        list.textContent = `Could not load leaderboard (${error.code || "error"}).`;
    }
}

let studyLeaderboardUnsubscribers = [];
let studyLeaderboardUid = null;
let studyLeaderboardRefreshTimer = null;

function stopStudyLeaderboardUpdates() {
    studyLeaderboardUnsubscribers.forEach(unsubscribe => unsubscribe());
    studyLeaderboardUnsubscribers = [];
    studyLeaderboardUid = null;
    if (studyLeaderboardRefreshTimer) clearTimeout(studyLeaderboardRefreshTimer);
    studyLeaderboardRefreshTimer = null;
}

function initStudyLeaderboardUpdates(uid) {
    if (auth.currentUser?.uid !== uid) return;
    if (studyLeaderboardUid === uid && studyLeaderboardUnsubscribers.length) return;
    stopStudyLeaderboardUpdates();
    studyLeaderboardUid = uid;
    const refresh = () => {
        if (studyLeaderboardRefreshTimer) clearTimeout(studyLeaderboardRefreshTimer);
        studyLeaderboardRefreshTimer = setTimeout(() => {
            if (auth.currentUser?.uid === uid) loadWeeklyLeaderboard(uid);
        }, 150);
    };
    studyLeaderboardUnsubscribers = [
        onSnapshot(collection(db, "studySessions"), refresh, error => console.error("Leaderboard timer updates failed:", error)),
        onSnapshot(collection(db, "studyRoomCompletions"), refresh, error => console.error("Leaderboard Study Session updates failed:", error))
    ];
}


/* STUDY LEAGUES + SHARED TASKS + PERSONAL TODO */
let activeLeagueId = null;
let activeLeagueData = null;

function makeInviteCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => alphabet[byte % alphabet.length]).join("");
}

async function loadMyLeagues() {
    const list = document.getElementById("myLeaguesList");
    if (!list || !auth.currentUser) return;
    list.textContent = "Loading leagues...";
    try {
        const snap = await runFirestoreOperation("query leagues where memberUids array-contains the signed-in UID",
            () => getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", auth.currentUser.uid))));
        list.replaceChildren();
        if (snap.empty) { list.textContent = "You are not in a league yet. Create one or join with a code."; return; }
        snap.forEach(item => {
            const league = item.data();
            const row = document.createElement("div"); row.className = "friend-list-row";
            const title = document.createElement("strong"); title.textContent = league.name || "Study League";
            const button = document.createElement("button"); button.className = "mini-action"; button.textContent = "OPEN";
            button.addEventListener("click", () => openLeague(item.id, league));
            row.append(title, button); list.append(row);
        });
        if (!activeLeagueId && !snap.empty) openLeague(snap.docs[0].id, snap.docs[0].data());
    } catch (error) {
        logFirestoreFailure("query leagues where memberUids array-contains the signed-in UID", error);
        list.textContent = `Could not load leagues (${error.code || error.message}).`;
    }
}

async function createLeague() {
    const user = auth.currentUser;
    const name = document.getElementById("leagueNameInput").value.trim();
    const status = document.getElementById("leagueCreateStatus");
    if (!user || name.length < 3) { status.textContent = "Enter a league name with at least 3 characters."; return; }
    const btn = document.getElementById("createLeagueBtn"); btn.disabled = true; btn.textContent = "CREATING...";
    try {
        const code = makeInviteCode();
        const ref = doc(collection(db, "leagues"));
        const league = { name, ownerUid: user.uid, inviteCode: code, memberUids: [user.uid], createdAt: serverTimestamp() };
        await setDoc(ref, league);
        status.textContent = `League created! Invite code: ${code}`;
        document.getElementById("leagueNameInput").value = "";
        await loadMyLeagues();
        await openLeague(ref.id, { ...league, createdAt: new Date() });
    } catch (error) { console.error(error); status.textContent = `Could not create league (${error.code || "error"}): ${error.message || "Unknown error"}. Firebase project: fantzawya-3ama. Check Firestore Rules in this exact project.`; }
    finally { btn.disabled = false; btn.textContent = "CREATE LEAGUE"; }
}

async function joinLeague() {
    const user = auth.currentUser;
    const code = document.getElementById("leagueCodeInput").value.trim().toUpperCase();
    const status = document.getElementById("leagueJoinStatus");
    if (!user || !code) { status.textContent = "Enter an invite code."; return; }

    const btn = document.getElementById("joinLeagueBtn");
    btn.disabled = true;
    btn.textContent = "JOINING...";
    try {
        const result = await runFirestoreOperation("join a Study League using its invite code", () =>
            joinLeagueCallable({ inviteCode: code }));
        const league = result.data;
        if (!league?.leagueId || !Array.isArray(league.memberUids)) {
            throw new Error("The server returned an invalid Study League response.");
        }

        status.textContent = `Joined ${league.name}!`;
        document.getElementById("leagueCodeInput").value = "";
        await loadMyLeagues();
        await openLeague(league.leagueId, league);
    } catch (error) {
        console.error("Could not join Study League:", error);
        const message = error.message || "Unknown error";
        status.textContent = `Could not join: ${message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = "JOIN LEAGUE";
    }
}

async function openLeague(leagueId, league) {
    activeLeagueId = leagueId; activeLeagueData = league;
    document.getElementById("activeLeagueTitle").textContent = league.name || "Study League";
    document.getElementById("activeLeagueCode").textContent = `Invite code: ${league.inviteCode || "—"} • Share this code with friends.`;
    await Promise.all([loadLeagueTasks(), loadLeagueRanking()]);
}

async function loadLeagueTasks() {
    const list = document.getElementById("leagueTasksList");
    if (!activeLeagueId || !list) return;
    list.textContent = "Loading tasks...";
    try {
        const snap = await runFirestoreOperation("read leagues/{leagueId}/tasks as a league member",
            () => getDocs(collection(db, "leagues", activeLeagueId, "tasks")));
        list.replaceChildren();
        if (snap.empty) { list.textContent = "No shared tasks yet. Add the first one above."; return; }
        snap.forEach(taskDoc => {
            const task = taskDoc.data(); const row = document.createElement("div"); row.className = "friend-list-row";
            const label = document.createElement("strong"); label.textContent = task.title || "Task";
            const count = document.createElement("small"); count.textContent = `${(task.completedBy || []).length}/${(activeLeagueData.memberUids || []).length} completed`;
            const button = document.createElement("button"); button.className = "mini-action";
            const done = (task.completedBy || []).includes(auth.currentUser.uid);
            button.textContent = done ? "DONE ✓" : "MARK DONE"; button.disabled = done;
            button.addEventListener("click", async () => {
                try { await updateDoc(doc(db, "leagues", activeLeagueId, "tasks", taskDoc.id), { completedBy: [...(task.completedBy || []), auth.currentUser.uid] }); await loadLeagueTasks(); }
                catch (error) { appAlert(`Could not update task: ${error.code || error.message}`); }
            });
            row.append(label, count, button); list.append(row);
        });
    } catch (error) {
        console.error("Could not load or render league tasks:", error);
        list.textContent = `Could not load league tasks (${error.code || error.message}).`;
    }
}

async function addLeagueTask() {
    const title = document.getElementById("leagueTaskInput").value.trim();
    if (!activeLeagueId || !title) return;
    try {
        await addDoc(collection(db, "leagues", activeLeagueId, "tasks"), { title, createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), completedBy: [] });
        document.getElementById("leagueTaskInput").value = "";
        await loadLeagueTasks();
    } catch (error) { appAlert(`Could not add task: ${error.code || error.message}`); }
}

async function loadLeagueRanking() {
    const list = document.getElementById("leagueRankingList");
    if (!activeLeagueData || !list) return;
    list.textContent = "Calculating all-time study totals...";
    try {
        const members = new Map((activeLeagueData.memberUids || []).map(uid => [uid, { uid, username: "Member" }]));
        const memberUids = [...members.keys()];
        const roomSessionQueries = [];
        for (let i = 0; i < memberUids.length; i += 30) {
            roomSessionQueries.push(getDocs(query(
                collection(db, "studyRoomCompletions"),
                where("uid", "in", memberUids.slice(i, i + 30))
            )));
        }
        const [sessionSnap, roomSessionSnaps] = await Promise.all([
            getDocs(collection(db, "studySessions")),
            Promise.all(roomSessionQueries)
        ]);
        const roomDocs = roomSessionSnaps.flatMap(snapshot => snapshot.docs);
        const records = normalizeStudyRecords(sessionSnap.docs, roomDocs);
        sessionSnap.forEach(item => {
            const data = item.data();
            const member = members.get(data.uid);
            if (member && data.username) member.username = data.username;
        });
        const profiles = await Promise.all([...members.keys()].map(uid => getDoc(doc(db, "publicProfiles", uid))));
        const ownerUids = new Set();
        const profileDataByUid = new Map();
        profiles.forEach(p => {
            if (!p.exists() || !members.has(p.id)) return;
            profileDataByUid.set(p.id, p.data());
            members.get(p.id).username = p.data().username || members.get(p.id).username;
            if (p.data().isOwner === true) ownerUids.add(p.id);
        });
        const recordsByUser = new Map();
        records.forEach(record => {
            if (!members.has(record.uid)) return;
            if (!recordsByUser.has(record.uid)) recordsByUser.set(record.uid, []);
            recordsByUser.get(record.uid).push(record);
        });
        members.forEach(member => {
            member.stats = calculateStudyStatistics(recordsByUser.get(member.uid) || [], profileDataByUid.get(member.uid)?.studyTimeZone || "UTC");
        });
        const ranked = [...members.values()].sort((a,b) => b.stats.totalSeconds-a.stats.totalSeconds || a.username.localeCompare(b.username));
        list.replaceChildren();
        ranked.forEach((member, i) => { const row = document.createElement("div"); row.className = "friend-list-row"; const name = document.createElement("strong"); name.textContent = `${i+1}. ${member.username}${member.uid === auth.currentUser.uid ? " (YOU)" : ""}`; if (ownerUids.has(member.uid)) appendOwnerTag(name, "👑 OWNER"); const time = document.createElement("small"); time.textContent = `${formatStudyDuration(member.stats.totalSeconds)} total · ${member.stats.completedSessions} sessions · ${member.stats.studyDays} study days`; time.title = "Total study time from completed timer and shared sessions"; row.append(name,time); list.append(row); });
    } catch (error) { console.error(error); list.textContent = `Could not calculate ranking (${error.code || error.message}).`; }
}

async function loadTodoList() {
    const list = document.getElementById("todoList");
    if (!list || !auth.currentUser) return;
    list.textContent = "Loading your tasks...";
    try {
        const snap = await getDocs(collection(db, "users", auth.currentUser.uid, "todos"));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.completed === b.completed ? String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")) : (a.completed ? 1 : -1)));
        list.replaceChildren();
        if (!items.length) { list.textContent = "Your list is empty. Add your first task above."; return; }
        items.forEach(item => {
            const row = document.createElement("div"); row.className = `todo-note-row${item.completed ? " is-completed" : ""}`;
            const check = document.createElement("button"); check.type = "button"; check.className = "todo-check"; check.textContent = item.completed ? "✓" : ""; check.setAttribute("aria-label", item.completed ? "Mark task as not completed" : "Mark task as completed");
            check.addEventListener("click", async () => { try { await updateDoc(doc(db,"users",auth.currentUser.uid,"todos",item.id),{completed:!item.completed,updatedAt:serverTimestamp()}); await loadTodoList(); } catch(e) { appAlert(e.message); } });
            const content = document.createElement("div"); content.className = "todo-content";
            const title = document.createElement("strong"); title.textContent = item.title || "Untitled task";
            const note = document.createElement("small"); note.textContent = item.note || "";
            const due = document.createElement("small");
            if (item.dueAt) { const time = new Date(item.dueAt); const remaining = time.getTime()-Date.now(); due.textContent = remaining < 0 && !item.completed ? `Overdue • ${time.toLocaleString()}` : `Due • ${time.toLocaleString()}`; due.classList.toggle("todo-overdue", remaining < 0 && !item.completed); }
            content.append(title); if (item.note) content.append(note); if (item.dueAt) content.append(due);
            const del = document.createElement("button"); del.type = "button"; del.className = "todo-delete"; del.textContent = "×"; del.title = "Delete task"; del.addEventListener("click", async () => { try { await deleteDoc(doc(db,"users",auth.currentUser.uid,"todos",item.id)); await loadTodoList(); } catch(e) { appAlert(e.message); } });
            row.append(check,content,del); list.append(row);
        });
    } catch (error) { console.error(error); list.textContent = `Could not load tasks (${error.code || error.message}).`; }
}

async function addTodo() {
    const title = document.getElementById("todoTitleInput").value.trim();
    const note = document.getElementById("todoNoteInput").value.trim();
    const dueAt = document.getElementById("todoDueInput").value;
    const status = document.getElementById("todoStatus");
    if (!title) { status.textContent = "Enter a task title first."; return; }
    try {
        await addDoc(collection(db,"users",auth.currentUser.uid,"todos"), { title, note, dueAt, completed:false, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
        document.getElementById("todoTitleInput").value = ""; document.getElementById("todoNoteInput").value = ""; document.getElementById("todoDueInput").value = "";
        status.textContent = "Task saved to your account."; await loadTodoList();
    } catch (error) { console.error(error); status.textContent = `Could not save task (${error.code || error.message}).`; }
}

document.getElementById("createLeagueBtn")?.addEventListener("click", createLeague);
document.getElementById("joinLeagueBtn")?.addEventListener("click", joinLeague);
document.getElementById("addLeagueTaskBtn")?.addEventListener("click", addLeagueTask);
document.getElementById("addTodoBtn")?.addEventListener("click", addTodo);


countdownModeBtn.addEventListener("click", () => setTimerMode("countdown"));
stopwatchModeBtn.addEventListener("click", () => setTimerMode("stopwatch"));
[timerHoursInput, timerMinutesInput, timerSecondsInput, timerBreakIntervalHoursInput,
    timerBreakIntervalMinutesInput, timerBreakMinutesInput].forEach(input => {
    input.addEventListener("input", () => {
        if (activeSession || timerMode !== "countdown") return;
        try {
            timerDisplay.textContent = formatDuration(getSelectedCountdownSeconds());
        } catch {
            timerDisplay.textContent = "00:00:00";
        }
    });
    input.addEventListener("change", applyTimerSettings);
});
timerStartBtn.addEventListener("click", startStudySession);
timerPauseBtn.addEventListener("click", pauseStudySession);
timerResumeBtn.addEventListener("click", resumeStudySession);
timerFinishBtn.addEventListener("click", () => finishStudySession());
timerResetBtn.addEventListener("click", resetStudySession);
timerStartBreakBtn.addEventListener("click", startManualBreak);
timerStartStudyBtn.addEventListener("click", startManualStudy);
timerAddTimeSelect.addEventListener("change", renderTimerControls);
timerAddTimeBtn.addEventListener("click", addSelectedTime);


/* RESTORE AUTH SESSION */
function stopAuthenticatedSubscriptions() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
    stopTimerTicker();
    stopPrayerReminderSystem();

    [
        studyRoomUnsubscribe,
        studyInviteUnsubscribe,
        activeStudyRoomUnsubscribe,
        activeStudyRoomRemovalUnsubscribe,
        studyRoomChatUnsubscribe,
        studyPrivateChatUnsubscribe,
        studyRoomStatsUnsubscribe,
        studySessionStatsUnsubscribe
    ].forEach(unsubscribe => unsubscribe?.());
    studyRoomUnsubscribe = null;
    studyInviteUnsubscribe = null;
    activeStudyRoomUnsubscribe = null;
    activeStudyRoomRemovalUnsubscribe = null;
    studyRoomChatUnsubscribe = null;
    studyPrivateChatUnsubscribe = null;
    studyPrivateChatTargetUid = null;
    studyRoomStatsUnsubscribe = null;
    studySessionStatsUnsubscribe = null;
    stopStudyLeaderboardUpdates();
    stopFriendStudyStats();

    if (studyStatsDayInterval) clearInterval(studyStatsDayInterval);
    studyStatsDayInterval = null;
    studyStatsDayUid = null;
    studyStatsCurrentDay = null;
    if (studyStatsRefreshTimer) clearTimeout(studyStatsRefreshTimer);
    studyStatsRefreshTimer = null;
    if (studyRoomTicker) clearInterval(studyRoomTicker);
    studyRoomTicker = null;

    activeSession = null;
    finishingSession = false;
    startingSession = false;
    currentProfile = null;
    dashboardLoadedUid = null;
    activeStudyRoomId = null;
    activeStudyRoomData = null;
    activeStudyRoomProfiles.clear();
    studyRoomProfileLoads.clear();
    studyRoomActionPending = false;
    endingStudyRoom = false;
    const liveRoomPanel = document.getElementById("studyRoomLivePanel");
    if (liveRoomPanel) liveRoomPanel.hidden = true;
    closeFriendProfileModal();
}

onAuthStateChanged(auth, async user => {
    if (authFlowInProgress) return;
    const nextUid = user?.uid || null;
    if (activeAuthUid !== nextUid) {
        stopAuthenticatedSubscriptions();
        activeAuthUid = nextUid;
        if (user) {
            dashboard.hidden = true;
            mobileNav.hidden = true;
            authContainer.hidden = false;
        }
    }
    if (user) {
        if (dashboardLoadedUid === user.uid) return;
        await loadDashboard(user);
    } else {
        dashboard.hidden = true;
        mobileNav.hidden = true;
        authContainer.hidden = false;
    }
});


