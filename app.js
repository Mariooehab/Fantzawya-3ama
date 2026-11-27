import { auth, db } from "./firebase.js";

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
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";



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
    const validPages = ["overview", "study", "exams", "challenges", "leaderboard", "friends", "league", "todo", "profile"];
    const selected = validPages.includes(pageName) ? pageName : "overview";
    document.querySelectorAll(".app-page").forEach(page => page.classList.toggle("active", page.dataset.page === selected));
    document.querySelectorAll("[data-page]").forEach(link => link.classList.toggle("active", link.dataset.page === selected));
    const titles = { overview: "Dashboard", study: "Study Timer", exams: "Exam Countdown", challenges: "Study Session", leaderboard: "All-time Leaderboard", friends: "Friends", league: "Study League", todo: "To-do & Notes", profile: "My Profile" };
    const heading = document.querySelector(".topbar h2");
    if (heading) heading.textContent = titles[selected];
    if (history.replaceState) history.replaceState(null, "", `#${selected}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
// The owner identity is resolved from the authenticated account, then published
// in publicProfiles so every member (including newly registered members) can see it.
const OWNER_EMAIL = "untiban59@gmail.com";
const isOwnerAccount = user => (user?.email || "").trim().toLowerCase() === OWNER_EMAIL;
function appendOwnerTag(target, text = "👑 OWNER & MAKER", extraClass = "") {
    if (!target || target.querySelector?.(".owner-tag")) return;
    const tag = document.createElement("span");
    tag.className = `owner-tag ${extraClass}`.trim();
    tag.textContent = text;
    tag.setAttribute("aria-label", "Website owner and maker");
    target.append(tag);
}

let authFlowInProgress = false;
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
async function ensureAccountDocuments(user, fallbackUsername = "") {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    let profile = userSnapshot.exists() ? userSnapshot.data() : null;

    if (!profile) {
        const publicRef = doc(db, "publicProfiles", user.uid);
        const publicSnapshot = await getDoc(publicRef);
        const recoveredName = (fallbackUsername || publicSnapshot.data()?.username || user.displayName || user.email?.split("@")[0] || "New User")
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
            coverUrl: ""
        };
        await setDoc(userRef, profile);
        profile = { ...profile, username: recoveredName };
    }

    const username = profile.username || fallbackUsername || user.email?.split("@")[0] || "New User";
    await setDoc(doc(db, "publicProfiles", user.uid), {
        uid: user.uid,
        username,
        usernameLower: username.toLowerCase(),
        avatarUrl: profile.avatarUrl || "",
        coverUrl: profile.coverUrl || "",
        ...(isOwnerAccount(user) ? { isOwner: true } : {}),
        updatedAt: serverTimestamp()
    }, { merge: true });
    return profile;
}

/* REGISTER */
registerForm.addEventListener("submit", async event => {
    event.preventDefault();

    const username = document.getElementById("registerUsername").value.trim().replace(/\s+/g, " ");
    const email = document.getElementById("registerEmail").value.trim().toLowerCase();
    const password = document.getElementById("registerPassword").value;
    const button = registerForm.querySelector(".submit-btn");

    if (Array.from(username).length < 3 || Array.from(username).length > 20) {
        showMessage("Username must be between 3 and 20 characters.", true);
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

        await ensureAccountDocuments(result.user, username);
        registerForm.reset();
        await appAlert("Account created successfully!");
        await loadDashboard(result.user);
        await offerOwnerFriendPrompt(result.user);
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
        console.error("Login error:", error);
        showMessage(
            error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password"
                ? "Incorrect email or password."
                : error.code === "auth/operation-not-allowed"
                    ? "Enable Email/Password in Firebase Console → Authentication → Sign-in method."
                    : error.message,
            true
        );
    } finally {
        authFlowInProgress = false;
        button.disabled = false;
        button.textContent = "LOGIN";
    }
});


/* DASHBOARD */
async function loadDashboard(user) {
    try {
        let profileSnapshot = await getDoc(doc(db, "users", user.uid));
        if (!profileSnapshot.exists()) {
            await ensureAccountDocuments(user);
            profileSnapshot = await getDoc(doc(db, "users", user.uid));
        }
        if (!profileSnapshot.exists()) throw new Error("Could not restore this account profile. Check Firestore Rules.");

        const profile = profileSnapshot.data();
        currentProfile = profile;
        const publicProfileRef = doc(db, "publicProfiles", user.uid);
        const publicProfileSnapshot = await getDoc(publicProfileRef);
        if (!publicProfileSnapshot.exists()) {
            await setDoc(publicProfileRef, {
                uid: user.uid,
                username: profile.username || "User",
                usernameLower: (profile.username || "User").toLowerCase(),
                avatarUrl: profile.avatarUrl || "",
                coverUrl: profile.coverUrl || "",
                ...(isOwnerAccount(user) ? { isOwner: true } : {}),
                updatedAt: serverTimestamp()
            });
        } else if (isOwnerAccount(user) && publicProfileSnapshot.data().isOwner !== true) {
            await updateDoc(publicProfileRef, { isOwner: true, updatedAt: serverTimestamp() });
        }

        const username = profile.username || "User";
        const email = profile.email || user.email || "";
        const xp = Number(profile.xp) || 0;
        const streak = Number(profile.streak) || 0;
        const initial = username.charAt(0).toUpperCase();

        document.getElementById("welcomeUsername").textContent = username;
        document.getElementById("sidebarUsername").textContent = username;
        document.getElementById("topbarUsername").textContent = username;
        document.getElementById("profileUsername").textContent = username;
        document.getElementById("profileEmail").textContent = email;
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
        document.getElementById("streakValue").textContent = streak;
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
        showPage(location.hash.replace("#", "") || "overview");

        loadExamDate(user.uid);
        await loadStudyStats(user.uid);
        await loadCommunityFeatures(user.uid);
        await loadFriends(user.uid);
        await restoreStudySession(user.uid);
    } catch (error) {
        console.error("Dashboard error:", error);
        authContainer.hidden = false;
        dashboard.hidden = true;
        mobileNav.hidden = true;
        showMessage(error.message, true);
    }
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
            updatedAt: serverTimestamp()
        });

        currentProfile = { ...currentProfile, username, avatarUrl, coverUrl };
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
        const existingA = await getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", user.uid), where("recipientUid", "==", person.uid)));
        const existingB = await getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", person.uid), where("recipientUid", "==", user.uid)));
        if ([...existingA.docs, ...existingB.docs].some(item => ["pending", "accepted"].includes(item.data().status))) {
            button.textContent = "REQUEST EXISTS"; return false;
        }
        await addDoc(collection(db, "friendRequests"), {
            senderUid: user.uid,
            senderUsername: currentProfile.username,
            senderAvatarUrl: currentProfile.avatarUrl || "",
            recipientUid: person.uid,
            recipientUsername: person.username,
            recipientAvatarUrl: person.avatarUrl || "",
            status: "pending",
            createdAt: serverTimestamp()
        });
        button.textContent = "REQUEST SENT";
        await loadFriends(user.uid);
        return true;
    } catch (error) {
        console.error("Friend request error:", error);
        button.disabled = false;
        appAlert(error.code === "permission-denied" ? "Firestore denied this request. Publish the updated Rules." : error.message);
    }
}

async function loadFriends(uid) {
    const requestsList = document.getElementById("friendRequestsList");
    const friendsList = document.getElementById("friendsList");
    if (!requestsList || !friendsList) return;
    requestsList.textContent = "Loading requests...";
    friendsList.textContent = "Loading friends...";
    try {
        const [incoming, outgoing, acceptedA, acceptedB] = await Promise.all([
            getDocs(query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "pending"))),
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "pending"))),
            getDocs(query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "accepted"))),
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "accepted")))
        ]);
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
        const publicProfiles = await Promise.all(friendUids.map(friendUid => getDoc(doc(db, "publicProfiles", friendUid))));
        const favoriteSnapshots = await Promise.all(friendUids.map(friendUid => getDoc(doc(db, "users", uid, "friendSettings", friendUid))));
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
        console.error("Could not load friends:", error);
        requestsList.textContent = "Could not load requests. Check Firestore Rules.";
        friendsList.textContent = "Could not load friends. Check Firestore Rules.";
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
function ensureFriendProfileModal() {
    let modal = document.getElementById("friendProfileModal");
    if (modal) return modal;
    modal = document.createElement("div"); modal.id = "friendProfileModal"; modal.className = "friend-profile-modal"; modal.hidden = true;
    modal.innerHTML = `<div class="friend-profile-backdrop" data-close-friend-profile></div><section class="friend-profile-card" role="dialog" aria-modal="true" aria-labelledby="friendProfileName"><button class="friend-profile-close" type="button" data-close-friend-profile aria-label="Close">×</button><div id="friendProfileCover" class="friend-profile-cover"></div><div id="friendProfileAvatar" class="friend-profile-avatar"></div><h3 id="friendProfileName">Friend</h3><p id="friendProfileUsername"></p><div id="friendProfileStats" class="friend-profile-stats"><div class="friend-stat-card"><strong>—</strong><span>STUDY HOURS</span></div><div class="friend-stat-card"><strong>—</strong><span>DAY STREAK 🔥</span></div><div class="friend-stat-card"><strong>—</strong><span>SESSIONS</span></div><div class="friend-stat-card"><strong>—</strong><span>BEST STREAK</span></div></div><div class="friend-profile-actions"><button id="friendProfileFavorite" class="community-action-btn" type="button">☆ FAVORITE</button><button id="friendProfileRemove" class="mini-action danger-action" type="button">REMOVE FRIEND</button></div><div class="friend-profile-invite"><label for="friendInviteLeague">Invite to a league</label><select id="friendInviteLeague"><option value="">Loading your leagues...</option></select><button id="friendInviteCopy" class="community-action-btn" type="button">COPY INVITE CODE</button><p id="friendInviteStatus" class="community-note"></p></div></section>`;
    document.body.append(modal);
    modal.addEventListener("click", event => { if (event.target.closest("[data-close-friend-profile]")) modal.hidden = true; });
    return modal;
}

async function openFriendProfile(person, favorite) {
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
    statsBox.innerHTML = '<div class="friend-stat-card"><strong>...</strong><span>STUDY HOURS</span></div><div class="friend-stat-card"><strong>...</strong><span>DAY STREAK 🔥</span></div><div class="friend-stat-card"><strong>...</strong><span>SESSIONS</span></div><div class="friend-stat-card"><strong>...</strong><span>BEST STREAK</span></div>';
    try {
        const sessionsSnap = await getDocs(query(collection(db, "studySessions"), where("uid", "==", person.uid)));
        const completed = sessionsSnap.docs.map(item => item.data()).filter(item => item.status === "completed");
        const totalSeconds = completed.reduce((sum, item) => sum + Math.max(0, Number(item.durationSeconds) || 0), 0);
        const countdownSeconds = completed.filter(item => item.mode === "countdown").reduce((sum, item) => sum + Math.max(0, Number(item.durationSeconds) || 0), 0);
        const stopwatchSeconds = completed.filter(item => item.mode === "stopwatch").reduce((sum, item) => sum + Math.max(0, Number(item.durationSeconds) || 0), 0);
        const dayKeys = [...new Set(completed.map(item => {
            const stamp = item.startedAt?.toDate?.() || (item.startedAt?.toMillis ? new Date(item.startedAt.toMillis()) : null);
            return stamp && !Number.isNaN(stamp.getTime()) ? `${stamp.getFullYear()}-${stamp.getMonth()}-${stamp.getDate()}` : null;
        }).filter(Boolean))];
        const daySet = new Set(dayKeys);
        const today = new Date(); today.setHours(0,0,0,0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const keyOf = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        let currentStreak = 0;
        let cursor = daySet.has(keyOf(today)) ? today : (daySet.has(keyOf(yesterday)) ? yesterday : null);
        while (cursor && daySet.has(keyOf(cursor))) { currentStreak++; cursor = new Date(cursor); cursor.setDate(cursor.getDate() - 1); }
        const dates = dayKeys.map(key => { const [y,m,d] = key.split("-").map(Number); return new Date(y,m,d); }).sort((a,b) => a-b);
        let bestStreak = 0, run = 0, previous = null;
        dates.forEach(date => {
            if (previous) { const diff = Math.round((date - previous) / 86400000); run = diff === 1 ? run + 1 : 1; }
            else run = 1;
            bestStreak = Math.max(bestStreak, run); previous = date;
        });
        const hours = (totalSeconds / 3600).toFixed(totalSeconds >= 36000 ? 0 : 1);
        statsBox.innerHTML = `<div class="friend-stat-card"><strong>${formatStudyTotal(totalSeconds)}</strong><span>TOTAL STUDY TIME</span></div><div class="friend-stat-card"><strong>${formatStudyTotal(countdownSeconds)}</strong><span>COUNTDOWN</span></div><div class="friend-stat-card"><strong>${formatStudyTotal(stopwatchSeconds)}</strong><span>STOPWATCH</span></div><div class="friend-stat-card"><strong>${currentStreak} 🔥</strong><span>DAY STREAK</span></div><div class="friend-stat-card"><strong>${completed.length}</strong><span>SESSIONS</span></div><div class="friend-stat-card"><strong>${bestStreak} days</strong><span>BEST STREAK</span></div>`;
    } catch (error) {
        console.error("Could not load friend study stats:", error);
        statsBox.innerHTML = '<p class="community-note">Study statistics are unavailable right now.</p>';
    }
    const fav = document.getElementById("friendProfileFavorite"); fav.textContent = favorite ? "★ FAVORITED" : "☆ ADD TO FAVORITES";
    fav.onclick = async () => { await toggleFriendFavorite(person.uid, !favorite); modal.hidden = true; };
    document.getElementById("friendProfileRemove").onclick = async () => { if (await appConfirm(`Remove ${person.username || "this friend"} from your friends?`)) { await removeFriend(person.uid); modal.hidden = true; } };
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
    localStorage.setItem(getTimerStorageKey(user.uid), JSON.stringify(activeSession));
}

function setTimerMode(mode) {
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
    timerFinishBtn.disabled = isSaving;
    timerResetBtn.disabled = isSaving;
    timerStartBreakBtn.disabled = isSaving;
    timerStartStudyBtn.disabled = isSaving;
    timerAddTimeBtn.disabled = isSaving;

    countdownModeBtn.disabled = hasSession;
    stopwatchModeBtn.disabled = hasSession;
    timerHoursInput.disabled = isSaving;
    timerMinutesInput.disabled = isSaving;
    timerSecondsInput.disabled = isSaving;
    timerBreakIntervalHoursInput.disabled = isSaving;
    timerBreakIntervalMinutesInput.disabled = isSaving;
    timerBreakMinutesInput.disabled = isSaving;
}

function startTimerTicker() {
    stopTimerTicker();
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
    if (!beginManualStudy(activeSession)) return;

    saveLocalSession();
    renderTimerControls();
    studyTimerSection.classList.remove("is-break");
    setTimerMessage("Study resumed. The next break interval starts from now.");
    startTimerTicker();
}

function addSelectedTime() {
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
    loadTimerSettings(uid);
    const raw = localStorage.getItem(getTimerStorageKey(uid));
    if (!raw) {
        activeSession = null;
        renderTimerControls();
        setTimerMode("countdown");
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
            return;
        }

        const now = Date.now();
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
    } catch (error) {
        console.error("Could not restore study session:", error);
        localStorage.removeItem(getTimerStorageKey(uid));
        activeSession = null;
        renderTimerControls();
        setTimerMode("countdown");
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

/* LOAD STUDY TOTALS FROM FIRESTORE */
async function loadStudyStats(uid) {
    try {
        const sessionsQuery = query(
            collection(db, "studySessions"),
            where("uid", "==", uid)
        );
        const [snapshot, roomSessionsSnapshot] = await Promise.all([
            getDocs(sessionsQuery),
            getDocs(query(
                collection(db, "studyRoomCompletions"),
                where("uid", "==", uid)
            ))
        ]);

        let totalSeconds = 0;
        let countdownSeconds = 0;
        let stopwatchSeconds = 0;
        let studySessionSeconds = 0;
        let completedCount = 0;

        snapshot.forEach(sessionDoc => {
            const data = sessionDoc.data();
            if (data.status === "completed") {
                const seconds = Math.max(0, Number(data.durationSeconds) || 0);
                totalSeconds += seconds;
                if (data.mode === "countdown") countdownSeconds += seconds;
                if (data.mode === "stopwatch") stopwatchSeconds += seconds;
                completedCount++;
            }
        });

        roomSessionsSnapshot.forEach(roomSessionDoc => {
            const seconds = Math.max(0, Number(roomSessionDoc.data().durationSeconds) || 0);
            studySessionSeconds += seconds;
            totalSeconds += seconds;
            completedCount++;
        });

        const formatted = formatStudyTotal(totalSeconds);

        // Update only elements that actually exist on the current page.
        const totalStudyTimeEl = document.getElementById("totalStudyTime");
        const completedSessionsEl = document.getElementById("completedSessions");
        const profileStudyTimeEl = document.getElementById("profileStudyTime");
        const profileSessionCountEl = document.getElementById("profileSessionCount");
        const profileCountdownTimeEl = document.getElementById("profileCountdownTime");
        const profileStopwatchTimeEl = document.getElementById("profileStopwatchTime");
        const profileStudySessionTimeEl = document.getElementById("profileStudySessionTime");

        if (totalStudyTimeEl) totalStudyTimeEl.textContent = formatted;
        if (completedSessionsEl) completedSessionsEl.textContent = `${completedCount} completed sessions`;
        if (profileStudyTimeEl) profileStudyTimeEl.textContent = formatted;
        if (profileSessionCountEl) profileSessionCountEl.textContent = completedCount;
        if (profileCountdownTimeEl) profileCountdownTimeEl.textContent = formatStudyTotal(countdownSeconds);
        if (profileStopwatchTimeEl) profileStopwatchTimeEl.textContent = formatStudyTotal(stopwatchSeconds);
        if (profileStudySessionTimeEl) profileStudySessionTimeEl.textContent = formatStudyTotal(studySessionSeconds);
    } catch (error) {
        console.error("Could not load study statistics:", {
            code: error.code || "unknown",
            message: error.message || String(error),
            error
        });
        const errorCode = error.code || "unknown-error";
        const errorMessage = error.message || "No additional details were provided.";
        setTimerMessage(`Could not load study statistics (${errorCode}): ${errorMessage}`, true);
    }
}


/* REAL-TIME SHARED STUDY ROOMS */
let studyRoomUnsubscribe = null;
let studyInviteUnsubscribe = null;
let activeStudyRoomUnsubscribe = null;
let studyRoomStatsUnsubscribe = null;
let activeStudyRoomId = null;
let activeStudyRoomData = null;
let studyRoomTicker = null;
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
async function saveStudyRoomCompletion(room, uid, endedAtMillis = null) {
    if (!room?.id || !uid || !(room.memberUids || []).includes(uid)) return false;
    const startedAtMillis = studyRoomTimestampMillis(room.startedAt);
    if (!startedAtMillis) return false;

    const completionRef = doc(db, "studyRoomCompletions", `${room.id}_${uid}`);
    const existing = await getDoc(completionRef);
    if (existing.exists()) return false; // One completion per member per room.

    const roomEndMillis = studyRoomTimestampMillis(room.endedAt);
    const requestedEnd = endedAtMillis || roomEndMillis || Date.now();
    const endMillis = Math.max(startedAtMillis, Math.min(requestedEnd, roomEndMillis || requestedEnd));
    const durationSeconds = Math.max(0, Math.floor((endMillis - startedAtMillis) / 1000));
    if (!durationSeconds) return false;

    await setDoc(completionRef, {
        uid,
        roomId: room.id,
        durationSeconds,
        mode: room.mode || "stopwatch",
        startedAt: room.startedAt,
        endedAt: room.endedAt || new Date(endMillis),
        createdAt: serverTimestamp()
    });
    return true;
}

function studyRoomRemaining(room) {
    // Firestore serverTimestamp can briefly be unresolved in a local snapshot.
    // Never interpret a missing start timestamp as an already-finished session.
    const started = studyRoomTimestampMillis(room?.startedAt);
    if (!started) return null;
    const now = Date.now();
    if (room.mode === "stopwatch") return Math.max(0, Math.floor((now - started) / 1000));
    const configuredEnd = studyRoomTimestampMillis(room.targetEndAt);
    const end = configuredEnd || (room.mode === "countdown" ? started + (Number(room.durationSeconds) || 0) * 1000 : 0);
    if (!end) return null;
    return Math.max(0, Math.ceil((end - now) / 1000));
}
async function loadStudyFriends(uid) {
    const select = document.getElementById("studyRoomFriends");
    if (!select) return;
    try {
        const [a, b] = await Promise.all([
            getDocs(query(collection(db, "friendRequests"), where("senderUid", "==", uid), where("status", "==", "accepted"))),
            getDocs(query(collection(db, "friendRequests"), where("recipientUid", "==", uid), where("status", "==", "accepted")))
        ]);
        const ids = [...new Set([...a.docs, ...b.docs].map(d => d.data().senderUid === uid ? d.data().recipientUid : d.data().senderUid))];
        const profiles = await Promise.all(ids.map(id => getDoc(doc(db, "publicProfiles", id))));
        studyFriendsCache = profiles.filter(x => x.exists()).map(x => ({ uid: x.id, ...x.data() }));
        select.replaceChildren();
        if (!studyFriendsCache.length) { const option=document.createElement("option"); option.disabled=true; option.textContent="Add friends first to invite them"; select.append(option); return; }
        studyFriendsCache.forEach(friend => { const option=document.createElement("option"); option.value=friend.uid; option.textContent=`${friend.username || "Friend"} (@${friend.username || "member"})`; select.append(option); });
    } catch (error) { console.error("Study friends load failed", error); select.innerHTML="<option disabled>Could not load friends</option>"; }
}
async function initStudyRooms(uid) {
    await loadStudyFriends(uid);
    if (studyRoomUnsubscribe) studyRoomUnsubscribe();
    if (studyInviteUnsubscribe) studyInviteUnsubscribe();
    if (studyRoomStatsUnsubscribe) studyRoomStatsUnsubscribe();
    studyRoomStatsUnsubscribe = onSnapshot(query(
        collection(db, "studyRoomCompletions"),
        where("uid", "==", uid)
    ), () => {
        loadStudyStats(uid);
    }, error => console.error("Study Session stats sync failed:", error));
    studyRoomUnsubscribe = onSnapshot(query(collection(db, "studyRooms"), where("memberUids", "array-contains", uid)), snap => {
        const list = document.getElementById("myStudyRoomsList"); if (!list) return;
        list.replaceChildren();
        if (snap.empty) { list.textContent = "No study rooms yet. Create one or accept an invitation."; return; }
        snap.docs.sort((a,b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0)).forEach(item => {
            const d=item.data(), row=document.createElement("button"); row.type="button"; row.className="study-room-row";
            const info=document.createElement("span"); info.className="study-room-row-info";
            const name=document.createElement("strong"); name.textContent=d.name || "Study room";
            const meta=document.createElement("small"); meta.textContent=`${(d.memberUids||[]).length} members • ${d.status === "active" ? "Session live" : d.status === "completed" ? "Finished" : "Waiting to start"}`;
            info.append(name,meta); const status=document.createElement("span"); status.className=`study-room-pill ${d.status || "waiting"}`; status.textContent=d.status === "active" ? "LIVE" : d.status === "completed" ? "DONE" : "WAITING"; row.append(info,status); row.addEventListener("click",()=>openStudyRoom(item.id));
            const actions=document.createElement("div"); actions.className="study-room-list-actions";
            if(d.status === "completed" && d.ownerUid === uid){const del=document.createElement("button");del.type="button";del.className="mini-action danger-action";del.textContent="DELETE";del.addEventListener("click",async e=>{e.stopPropagation();if(!confirm("Delete this completed study room?"))return;try{await deleteDoc(doc(db,"studyRooms",item.id));if(activeStudyRoomId===item.id)closeActiveStudyRoom();}catch(err){appAlert(`Could not delete room: ${err.message||err.code}`);}});actions.append(del);}
            else if(d.ownerUid !== uid){const leave=document.createElement("button");leave.type="button";leave.className="mini-action";leave.textContent="LEAVE";leave.addEventListener("click",async e=>{e.stopPropagation();if(!confirm("Leave this study room?"))return;try{if(d.status === "active") await saveStudyRoomCompletion({id:item.id,...d},uid,Date.now());await updateDoc(doc(db,"studyRooms",item.id),{memberUids:arrayRemove(uid)});if(activeStudyRoomId===item.id)closeActiveStudyRoom();}catch(err){appAlert(`Could not leave room: ${err.message||err.code}`);}});actions.append(leave);}
            row.append(actions); list.append(row);
        });
        if (!activeStudyRoomId && snap.docs.length) openStudyRoom(snap.docs[0].id);
    }, error => { console.error(error); document.getElementById("myStudyRoomsList").textContent="Could not load rooms. Check Firestore Rules."; });
    studyInviteUnsubscribe = onSnapshot(query(collection(db, "studyRoomInvites"), where("recipientUid", "==", uid), where("status", "==", "pending")), snap => {
        const list=document.getElementById("studyInvitesList"), count=document.getElementById("studyInviteCount"); if(!list)return;
        count.textContent=String(snap.size); list.replaceChildren();
        if(snap.empty){list.textContent="No new study invitations.";return;}
        snap.forEach(item=>{const d=item.data(),row=document.createElement("div");row.className="study-invite-row";const details=document.createElement("div");const title=document.createElement("strong");title.textContent=`${d.senderUsername || "A friend"} invited you`;const sub=document.createElement("small");sub.textContent=`${d.roomName || "Study room"} • ${d.mode || "stopwatch"}`;details.append(title,sub);const actions=document.createElement("div");actions.className="study-invite-actions";const accept=document.createElement("button");accept.className="mini-action accept";accept.textContent="JOIN";accept.addEventListener("click",()=>respondStudyInvite(item.id,d.roomId,true));const decline=document.createElement("button");decline.className="mini-action";decline.textContent="DECLINE";decline.addEventListener("click",()=>respondStudyInvite(item.id,d.roomId,false));actions.append(accept,decline);row.append(details,actions);list.append(row);});
    }, error=>{console.error(error);document.getElementById("studyInvitesList").textContent="Could not load invitations.";});
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
    let durationSeconds=0,targetEndAt="";
    if(mode==="countdown"){durationSeconds=Math.min(86400,Math.max(60,Number(document.getElementById("studyRoomMinutes").value||0)*60));if(!durationSeconds){status.textContent="Enter a valid duration.";return;}}
    if(mode==="until"){const value=document.getElementById("studyRoomEndAt").value;if(!value||new Date(value)<=new Date()){status.textContent="Choose an end time in the future.";return;}targetEndAt=new Date(value).toISOString();}
    btn.disabled=true; status.textContent="Creating your room...";
    try{
        const roomRef=doc(collection(db,"studyRooms"));
        const room={name,ownerUid:user.uid,ownerUsername:currentProfile?.username||"Member",memberUids:[user.uid],mode,durationSeconds,targetEndAt,status:"waiting",createdAt:serverTimestamp(),startedAt:null,endedAt:null};
        await setDoc(roomRef,room);
        const inviteWrites=selected.map(friendUid=>{const friend=studyFriendsCache.find(f=>f.uid===friendUid);return setDoc(doc(db,"studyRoomInvites",`${roomRef.id}_${friendUid}`),{roomId:roomRef.id,roomName:name,mode,senderUid:user.uid,senderUsername:currentProfile?.username||"Member",recipientUid:friendUid,status:"pending",createdAt:serverTimestamp()});});
        await Promise.all(inviteWrites);
        document.getElementById("studyRoomName").value="";status.textContent=`Room created${selected.length?` and ${selected.length} invitation(s) sent`:""}.`;await openStudyRoom(roomRef.id);
    }catch(error){console.error(error);status.textContent=`Could not create room: ${error.message||error.code}`;}
    finally{btn.disabled=false;}
}
async function respondStudyInvite(inviteId,roomId,accept){
    try{const inviteRef=doc(db,"studyRoomInvites",inviteId);if(accept){const roomRef=doc(db,"studyRooms",roomId);const roomSnap=await getDoc(roomRef);if(!roomSnap.exists()||roomSnap.data().status!=="waiting")throw new Error("This room has already started or ended. You can only join before the host starts it.");await updateDoc(roomRef,{memberUids:arrayUnion(auth.currentUser.uid)});}await updateDoc(inviteRef,{status:accept?"accepted":"declined",respondedAt:serverTimestamp()});if(accept)await openStudyRoom(roomId);}
    catch(error){console.error(error);appAlert(`Could not ${accept?"join":"decline"} invitation: ${error.message||error.code}`);}
}
async function openStudyRoom(roomId){
    if(activeStudyRoomUnsubscribe)activeStudyRoomUnsubscribe();activeStudyRoomId=roomId;
    const panel=document.getElementById("studyRoomLivePanel");panel.hidden=false;document.getElementById("studyLiveRoomTitle").textContent="Loading room...";
    activeStudyRoomUnsubscribe=onSnapshot(doc(db,"studyRooms",roomId),snap=>{if(!snap.exists()){panel.hidden=true;return;}activeStudyRoomData={id:snap.id,...snap.data()};renderStudyRoom();if(activeStudyRoomData.status==="completed"){saveStudyRoomCompletion(activeStudyRoomData,auth.currentUser?.uid).catch(error=>console.error("Could not save Study Session completion:",error));}},error=>{console.error(error);document.getElementById("studyLiveNotice").textContent="Could not sync this room.";});
    if(!studyRoomTicker)studyRoomTicker=setInterval(tickStudyRoom,1000);
}
function renderStudyRoom(){
    const r=activeStudyRoomData;if(!r)return;const owner=r.ownerUid===auth.currentUser?.uid;
    document.getElementById("studyLiveRoomTitle").textContent=r.name||"Study Session";
    document.getElementById("studyLiveRoomMembers").textContent=`${(r.memberUids||[]).length} participant(s) • Hosted by ${r.ownerUsername||"Member"}`;
    document.getElementById("studyLiveStatus").textContent=r.status==="active"?"LIVE":r.status==="completed"?"COMPLETED":"WAITING";
    document.getElementById("studyLiveModeLabel").textContent=r.mode==="stopwatch"?"STOPWATCH":r.mode==="until"?"UNTIL END TIME":"COUNTDOWN";
    document.getElementById("studyHostControls").hidden=!owner;
    document.getElementById("studyHostStartBtn").hidden=!owner||r.status!=="waiting";
    document.getElementById("studyHostStopBtn").hidden=!owner||r.status!=="active";
    const leaveBtn=document.getElementById("studyLeaveRoomBtn"); if(leaveBtn) leaveBtn.hidden=owner;
    const deleteBtn=document.getElementById("studyDeleteRoomBtn"); if(deleteBtn) deleteBtn.hidden=!(owner&&r.status==="completed");
    document.getElementById("studyLiveNotice").textContent=owner?"You are the host. Only you can start or end this shared timer.":"The host controls the timer. Your clock stays synchronized with the room.";
    const participants=document.getElementById("studyLiveParticipants");participants.replaceChildren();(r.memberUids||[]).forEach(uid=>{const row=document.createElement("span");row.className="study-participant-chip";row.textContent=uid===r.ownerUid?`${r.ownerUsername||"Host"} · HOST`:uid===auth.currentUser?.uid?`${currentProfile?.username||"You"} · YOU`:"Member";participants.append(row);});
    tickStudyRoom();
}
function tickStudyRoom(){
    const r=activeStudyRoomData;if(!r)return;const clock=document.getElementById("studyLiveClock"),sub=document.getElementById("studyLiveSubtext");
    if(r.status==="waiting"){clock.textContent=r.mode==="countdown"?studyFormatClock(r.durationSeconds):"00:00:00";sub.textContent="Waiting for the host to start";return;}
    if(r.status==="completed"){clock.textContent=r.mode==="stopwatch"?studyFormatClock(r.finalSeconds||0):"00:00:00";sub.textContent="This study session has ended";return;}
    const value=studyRoomRemaining(r);
    if(value===null){clock.textContent="--:--:--";sub.textContent="Synchronizing session start…";return;}
    clock.textContent=studyFormatClock(value);sub.textContent=r.mode==="stopwatch"?"Elapsed study time":`Time remaining${r.targetEndAt?` • ends ${new Date(r.targetEndAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:""}`;
    if(r.mode!=="stopwatch"&&value<=0&&r.ownerUid===auth.currentUser?.uid)endStudyRoom(true);
}
const startStudyHostBtn=document.getElementById("studyHostStartBtn");
if(startStudyHostBtn)startStudyHostBtn.addEventListener("click",async()=>{
    if(!activeStudyRoomData||activeStudyRoomData.ownerUid!==auth.currentUser?.uid)return;
    try{
        const now=new Date();
        let end="";
        if(activeStudyRoomData.mode==="until"){
            end=activeStudyRoomData.targetEndAt;
            const endMillis=studyRoomTimestampMillis(end);
            if(!endMillis||endMillis<=now.getTime()){
                appAlert("The selected end time has already passed. Create a new room and choose a future date and time.");
                return;
            }
        } else if(activeStudyRoomData.mode==="countdown") {
            const duration=Math.max(60,Number(activeStudyRoomData.durationSeconds)||0);
            end=new Date(now.getTime()+duration*1000).toISOString();
        }
        await updateDoc(doc(db,"studyRooms",activeStudyRoomId),{status:"active",startedAt:serverTimestamp(),targetEndAt:end});
    }catch(e){appAlert(e.message||"Could not start session.");}
});
const stopStudyHostBtn=document.getElementById("studyHostStopBtn");
if(stopStudyHostBtn)stopStudyHostBtn.addEventListener("click",()=>endStudyRoom(false));
async function endStudyRoom(auto){
    const r=activeStudyRoomData;
    if(!r||r.ownerUid!==auth.currentUser?.uid||r.status!=="active")return;
    const started=studyRoomTimestampMillis(r.startedAt);
    const remaining=studyRoomRemaining(r);
    // Guard against ending while Firestore is still resolving serverTimestamp.
    if(!started||remaining===null)return;
    try{
        const elapsed=Math.max(0,Math.floor((Date.now()-started)/1000));
        const finalSeconds=r.mode==="stopwatch"?elapsed:r.mode==="countdown"?Math.max(0,Number(r.durationSeconds)||0)-remaining:Math.max(0,Math.floor((studyRoomTimestampMillis(r.targetEndAt)-started)/1000));
        await updateDoc(doc(db,"studyRooms",activeStudyRoomId),{status:"completed",endedAt:new Date(),finalSeconds,autoEnded:!!auto});
    }catch(e){console.error(e);if(!auto)appAlert(e.message||"Could not end session.");}
}


function closeActiveStudyRoom(){
    if(activeStudyRoomUnsubscribe) activeStudyRoomUnsubscribe();
    activeStudyRoomUnsubscribe=null; activeStudyRoomId=null; activeStudyRoomData=null;
    const panel=document.getElementById("studyRoomLivePanel"); if(panel) panel.hidden=true;
}
const leaveStudyRoomBtn=document.getElementById("studyLeaveRoomBtn");
if(leaveStudyRoomBtn) leaveStudyRoomBtn.addEventListener("click",async()=>{
    const r=activeStudyRoomData, uid=auth.currentUser?.uid;
    if(!r||!uid||r.ownerUid===uid)return;
    if(!confirm("Leave this study room?"))return;
    try{if(r.status === "active") await saveStudyRoomCompletion(r,uid,Date.now());await updateDoc(doc(db,"studyRooms",r.id),{memberUids:arrayRemove(uid)});closeActiveStudyRoom();}
    catch(e){appAlert(`Could not leave room: ${e.message||e.code}`);}
});
const deleteStudyRoomBtn=document.getElementById("studyDeleteRoomBtn");
if(deleteStudyRoomBtn) deleteStudyRoomBtn.addEventListener("click",async()=>{
    const r=activeStudyRoomData, uid=auth.currentUser?.uid;
    if(!r||r.ownerUid!==uid||r.status!=="completed")return;
    if(!confirm("Permanently delete this completed study room?"))return;
    try{await deleteDoc(doc(db,"studyRooms",r.id));closeActiveStudyRoom();}
    catch(e){appAlert(`Could not delete room: ${e.message||e.code}`);}
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
    await Promise.all([loadWeeklyLeaderboard(uid)]);
    await initStudyRooms(uid);
    await Promise.all([loadMyLeagues(), loadTodoList()]);
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
    const list = document.getElementById("leaderboardList");
    try {
        const snapshot = await getDocs(collection(db, "studySessions"));
        const members = new Map();
        snapshot.forEach(item => {
            const data = item.data();
            if (data.status !== "completed" || !data.uid) return;
            const member = members.get(data.uid) || { uid: data.uid, username: data.username || (data.uid === currentUid ? currentProfile?.username : "Community Member") || "Community Member", seconds: 0, countdownSeconds: 0, stopwatchSeconds: 0 };
            const sessionSeconds = Math.max(0, Number(data.durationSeconds) || 0);
            member.seconds += sessionSeconds;
            if (data.mode === "countdown") member.countdownSeconds += sessionSeconds;
            if (data.mode === "stopwatch") member.stopwatchSeconds += sessionSeconds;
            if (data.username) member.username = data.username;
            members.set(data.uid, member);
        });
        const ranked = [...members.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10);
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
            time.textContent = `${formatChallengeTime(member.seconds)}  |  ⏳ ${formatChallengeTime(member.countdownSeconds)}  |  ⏱ ${formatChallengeTime(member.stopwatchSeconds)}`;
            time.title = "Total study time | Countdown | Stopwatch";
            row.append(left, time);
            list.append(row);
        });
    } catch (error) {
        console.error("Could not load leaderboard:", error);
        list.textContent = "Could not load leaderboard. Check Firestore Rules.";
    }
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
        const snap = await getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", auth.currentUser.uid)));
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
    } catch (error) { console.error("League load failed:", error); list.textContent = `Could not load leagues (${error.code || error.message}). Publish the latest Firestore Rules.`; }
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
    const btn = document.getElementById("joinLeagueBtn"); btn.disabled = true; btn.textContent = "JOINING...";
    try {
        const matches = await getDocs(query(collection(db, "leagues"), where("inviteCode", "==", code)));
        if (matches.empty) throw new Error("Invite code not found. Check the code and try again.");
        const leagueDoc = matches.docs[0]; const league = leagueDoc.data();
        if (league.memberUids.includes(user.uid)) throw new Error("You are already a member of this league.");
        await updateDoc(doc(db, "leagues", leagueDoc.id), { memberUids: [...league.memberUids, user.uid] });
        status.textContent = `Joined ${league.name}!`;
        document.getElementById("leagueCodeInput").value = "";
        await loadMyLeagues();
        await openLeague(leagueDoc.id, { ...league, memberUids: [...league.memberUids, user.uid] });
    } catch (error) { console.error(error); status.textContent = `Could not join: ${error.code || error.message}`; }
    finally { btn.disabled = false; btn.textContent = "JOIN LEAGUE"; }
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
        const snap = await getDocs(collection(db, "leagues", activeLeagueId, "tasks"));
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
    } catch (error) { console.error(error); list.textContent = `Could not load league tasks (${error.code || error.message}).`; }
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
        const members = new Map((activeLeagueData.memberUids || []).map(uid => [uid, { uid, username: "Member", seconds: 0, countdownSeconds: 0, stopwatchSeconds: 0, studySessionSeconds: 0 }]));
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
        sessionSnap.forEach(item => { const d = item.data(); const member = members.get(d.uid); if (member && d.status === "completed") { const seconds = Math.max(0, Number(d.durationSeconds) || 0); member.seconds += seconds; if (d.mode === "countdown") member.countdownSeconds += seconds; if (d.mode === "stopwatch") member.stopwatchSeconds += seconds; if (d.username) member.username = d.username; } });
        roomSessionSnaps.forEach(snapshot => snapshot.forEach(item => {
            const data = item.data();
            const member = members.get(data.uid);
            if (!member) return;
            const seconds = Math.max(0, Number(data.durationSeconds) || 0);
            member.seconds += seconds;
            member.studySessionSeconds += seconds;
        }));
        const profiles = await Promise.all([...members.keys()].map(uid => getDoc(doc(db, "publicProfiles", uid))));
        const ownerUids = new Set();
        profiles.forEach(p => { if (p.exists() && members.has(p.id)) { members.get(p.id).username = p.data().username || members.get(p.id).username; if (p.data().isOwner === true) ownerUids.add(p.id); } });
        const ranked = [...members.values()].sort((a,b) => b.seconds-a.seconds);
        list.replaceChildren();
        ranked.forEach((member, i) => { const row = document.createElement("div"); row.className = "friend-list-row"; const name = document.createElement("strong"); name.textContent = `${i+1}. ${member.username}${member.uid === auth.currentUser.uid ? " (YOU)" : ""}`; if (ownerUids.has(member.uid)) appendOwnerTag(name, "👑 OWNER"); const time = document.createElement("small"); time.textContent = `${formatChallengeTime(member.seconds)}  |  ⏳ ${formatChallengeTime(member.countdownSeconds)}  |  ⏱ ${formatChallengeTime(member.stopwatchSeconds)}  |  📚 ${formatChallengeTime(member.studySessionSeconds)}`; time.title = "Total study time | Countdown | Stopwatch | Study Session"; row.append(name,time); list.append(row); });
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
onAuthStateChanged(auth, async user => {
    if (authFlowInProgress) return;
    if (user) {
        await loadDashboard(user);
    } else {
        dashboard.hidden = true;
        mobileNav.hidden = true;
        authContainer.hidden = false;
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        stopTimerTicker();
        currentProfile = null;
        if (studyRoomUnsubscribe) studyRoomUnsubscribe(); if (studyInviteUnsubscribe) studyInviteUnsubscribe(); if (activeStudyRoomUnsubscribe) activeStudyRoomUnsubscribe(); if (studyRoomStatsUnsubscribe) studyRoomStatsUnsubscribe();
        studyRoomUnsubscribe = studyInviteUnsubscribe = activeStudyRoomUnsubscribe = studyRoomStatsUnsubscribe = null; activeStudyRoomId = null; activeStudyRoomData = null;
        if (studyRoomTicker) clearInterval(studyRoomTicker); studyRoomTicker = null;
    }
});


