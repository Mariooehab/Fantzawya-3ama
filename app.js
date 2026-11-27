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
    orderBy
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
    const titles = { overview: "Dashboard", study: "Study Timer", exams: "Exam Countdown", challenges: "Study Challenges", leaderboard: "All-time Leaderboard", friends: "Friends", league: "Study League", todo: "To-do & Notes", profile: "My Profile" };
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
const timerDisplay = document.getElementById("timerDisplay");
const timerState = document.getElementById("timerState");
const timerModeCaption = document.getElementById("timerModeCaption");
const timerProgress = document.getElementById("timerProgress");
const timerStartBtn = document.getElementById("timerStartBtn");
const timerPauseBtn = document.getElementById("timerPauseBtn");
const timerResumeBtn = document.getElementById("timerResumeBtn");
const timerFinishBtn = document.getElementById("timerFinishBtn");
const timerResetBtn = document.getElementById("timerResetBtn");
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

function getElapsedMilliseconds(session, now = Date.now()) {
    if (session.status === "paused") return session.elapsedBeforePauseMs || 0;
    return (session.elapsedBeforePauseMs || 0) + Math.max(0, now - session.segmentStartedAtMs);
}

function getPausedMilliseconds(session, now = Date.now()) {
    return (session.pausedTotalMs || 0) +
        (session.status === "paused" && session.pauseStartedAtMs
            ? Math.max(0, now - session.pauseStartedAtMs)
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
    timerSetup.hidden = !isCountdown;
    timerModeCaption.textContent = isCountdown ? "COUNTDOWN SESSION" : "STOPWATCH SESSION";

    if (isCountdown) {
        const seconds = getSelectedCountdownSeconds();
        timerDisplay.textContent = formatDuration(seconds);
    } else {
        timerDisplay.textContent = "00:00:00";
    }
    timerState.textContent = "READY TO FOCUS";
    setTimerMessage(isCountdown ? "Set your duration and start studying." : "Start the stopwatch whenever you're ready.");
    timerProgress.style.setProperty("--progress", "0%");
}

function getSelectedCountdownSeconds() {
    const hours = Number.parseInt(timerHoursInput.value, 10);
    const minutes = Number.parseInt(timerMinutesInput.value, 10);
    const seconds = Number.parseInt(timerSecondsInput.value, 10);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds) ||
        hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error("Enter a valid duration: hours 0-24, minutes and seconds 0-59.");
    }

    const total = hours * 3600 + minutes * 60 + seconds;
    if (total < 1 || total > 86400) {
        throw new Error("Countdown must be between 1 second and 24 hours.");
    }
    return total;
}

function updateTimerDisplay() {
    if (!activeSession) return;

    const elapsedSeconds = Math.floor(getElapsedMilliseconds(activeSession) / 1000);

    if (activeSession.mode === "countdown") {
        const remaining = Math.max(0, activeSession.plannedSeconds - elapsedSeconds);
        timerDisplay.textContent = formatDuration(remaining);
        const progress = Math.min(100, (elapsedSeconds / activeSession.plannedSeconds) * 100);
        timerProgress.style.setProperty("--progress", `${progress}%`);

        if (remaining <= 0 && activeSession.status === "running") {
            finishStudySession(true);
        }
    } else {
        timerDisplay.textContent = formatDuration(elapsedSeconds);
        timerProgress.style.setProperty("--progress", "100%");
    }

    timerState.textContent = activeSession.status === "paused" ? "SESSION PAUSED" : "FOCUS IN PROGRESS";
}

function renderTimerControls() {
    const hasSession = Boolean(activeSession);
    const isPaused = activeSession?.status === "paused";

    timerStartBtn.hidden = hasSession;
    timerPauseBtn.hidden = !hasSession || isPaused;
    timerResumeBtn.hidden = !hasSession || !isPaused;
    timerFinishBtn.hidden = !hasSession;
    timerResetBtn.hidden = !hasSession;

    countdownModeBtn.disabled = hasSession;
    stopwatchModeBtn.disabled = hasSession;
    timerHoursInput.disabled = hasSession;
    timerMinutesInput.disabled = hasSession;
    timerSecondsInput.disabled = hasSession;
}

function startTimerTicker() {
    stopTimerTicker();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 250);
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
    if (activeSession) return;

    let plannedSeconds = 0;
    try {
        if (timerMode === "countdown") plannedSeconds = getSelectedCountdownSeconds();
    } catch (error) {
        setTimerMessage(error.message, true);
        return;
    }

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
        const savedSnapshot = await getDoc(sessionRef);
        const startedAt = savedSnapshot.data()?.startedAt?.toMillis?.() || Date.now();

        activeSession = {
            id: sessionRef.id,
            mode: timerMode,
            plannedSeconds,
            startedAtMs: startedAt,
            segmentStartedAtMs: Date.now(),
            elapsedBeforePauseMs: 0,
            pausedTotalMs: 0,
            pauseStartedAtMs: null,
            status: "running"
        };

        saveLocalSession();
        renderTimerControls();
        timerState.textContent = "FOCUS IN PROGRESS";
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
        timerStartBtn.disabled = false;
        timerStartBtn.textContent = "▶ START STUDYING";
    }
}

function pauseStudySession() {
    if (!activeSession || activeSession.status !== "running") return;

    activeSession.elapsedBeforePauseMs = getElapsedMilliseconds(activeSession);
    activeSession.pauseStartedAtMs = Date.now();
    activeSession.status = "paused";

    stopTimerTicker();
    saveLocalSession();
    renderTimerControls();
    updateTimerDisplay();
    setTimerMessage("Session paused. Resume when you're ready.");
}

function resumeStudySession() {
    if (!activeSession || activeSession.status !== "paused") return;

    const now = Date.now();
    activeSession.pausedTotalMs += Math.max(0, now - activeSession.pauseStartedAtMs);
    activeSession.pauseStartedAtMs = null;
    activeSession.segmentStartedAtMs = now;
    activeSession.status = "running";

    saveLocalSession();
    renderTimerControls();
    setTimerMessage("You're back. Keep going!");
    startTimerTicker();
}

async function finishStudySession(autoFinished = false) {
    if (!activeSession || finishingSession) return;

    const session = activeSession;
    const user = auth.currentUser;
    if (!user || session.status === "saving") return;

    finishingSession = true;
    session.statusBeforeSaving = session.status;
    const elapsedSeconds = Math.max(0, Math.floor(getElapsedMilliseconds(session) / 1000));
    const pausedSeconds = Math.max(0, Math.floor(getPausedMilliseconds(session) / 1000));

    if (elapsedSeconds < 1) {
        finishingSession = false;
        setTimerMessage("Study for at least one second before finishing.", true);
        return;
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
            pausedSeconds
        });

        localStorage.removeItem(getTimerStorageKey(user.uid));
        activeSession = null;
        finishingSession = false;
        renderTimerControls();
        timerState.textContent = "SESSION COMPLETED";
        timerDisplay.textContent = formatDuration(elapsedSeconds);
        timerProgress.style.setProperty("--progress", "100%");
        timerModeCaption.textContent = "COMPLETED STUDY TIME";
        setTimerMessage(
            `${autoFinished ? "Countdown completed!" : "Session finished!"} Saved ${formatStudyTotal(elapsedSeconds)} to your account.`
        );

        await loadStudyStats(user.uid);
        await loadCommunityFeatures(user.uid);
        timerMode = "countdown";
        countdownModeBtn.classList.add("active");
        stopwatchModeBtn.classList.remove("active");
        timerSetup.hidden = false;
    } catch (error) {
        console.error("Could not finish study session:", error);
        session.status = session.statusBeforeSaving || "running";
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

        activeSession = saved;
        timerMode = saved.mode;
        countdownModeBtn.classList.toggle("active", timerMode === "countdown");
        stopwatchModeBtn.classList.toggle("active", timerMode === "stopwatch");
        timerSetup.hidden = timerMode !== "countdown";
        timerModeCaption.textContent = timerMode === "countdown" ? "COUNTDOWN SESSION" : "STOPWATCH SESSION";

        if (activeSession.status === "running") {
            // If the page was refreshed while running, the current running segment continues.
            startTimerTicker();
            setTimerMessage("Your previous study session has been restored.");
        } else {
            renderTimerControls();
            updateTimerDisplay();
            setTimerMessage("Your paused study session has been restored.");
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
        const confirmed = await appConfirm("Are you sure you want to reset all your study statistics? This will permanently delete your completed Countdown and Stopwatch sessions and cannot be undone.");
        if (!confirmed) return;

        resetStudyStatsBtn.disabled = true;
        const originalText = resetStudyStatsBtn.textContent;
        resetStudyStatsBtn.textContent = "RESETTING...";
        try {
            const sessionsSnapshot = await getDocs(query(
                collection(db, "studySessions"),
                where("uid", "==", user.uid)
            ));
            const completedSessions = sessionsSnapshot.docs.filter(item => item.data().status === "completed");
            for (const sessionDoc of completedSessions) {
                await deleteDoc(sessionDoc.ref);
            }
            await loadStudyStats(user.uid);
            await loadCommunityFeatures(user.uid);
            appAlert(`Study statistics reset successfully. ${completedSessions.length} completed sessions cleared.`);
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
        const snapshot = await getDocs(sessionsQuery);

        let totalSeconds = 0;
        let countdownSeconds = 0;
        let stopwatchSeconds = 0;
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

        const formatted = formatStudyTotal(totalSeconds);

        // Update only elements that actually exist on the current page.
        const totalStudyTimeEl = document.getElementById("totalStudyTime");
        const completedSessionsEl = document.getElementById("completedSessions");
        const profileStudyTimeEl = document.getElementById("profileStudyTime");
        const profileSessionCountEl = document.getElementById("profileSessionCount");
        const profileCountdownTimeEl = document.getElementById("profileCountdownTime");
        const profileStopwatchTimeEl = document.getElementById("profileStopwatchTime");

        if (totalStudyTimeEl) totalStudyTimeEl.textContent = formatted;
        if (completedSessionsEl) completedSessionsEl.textContent = `${completedCount} completed sessions`;
        if (profileStudyTimeEl) profileStudyTimeEl.textContent = formatted;
        if (profileSessionCountEl) profileSessionCountEl.textContent = completedCount;
        if (profileCountdownTimeEl) profileCountdownTimeEl.textContent = formatStudyTotal(countdownSeconds);
        if (profileStopwatchTimeEl) profileStopwatchTimeEl.textContent = formatStudyTotal(stopwatchSeconds);
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
    await Promise.all([loadChallenges(uid), loadWeeklyLeaderboard(uid)]);
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
        const sessionSnap = await getDocs(collection(db, "studySessions"));
        const members = new Map((activeLeagueData.memberUids || []).map(uid => [uid, { uid, username: "Member", seconds: 0, countdownSeconds: 0, stopwatchSeconds: 0 }]));
        sessionSnap.forEach(item => { const d = item.data(); const member = members.get(d.uid); if (member && d.status === "completed") { const seconds = Math.max(0, Number(d.durationSeconds) || 0); member.seconds += seconds; if (d.mode === "countdown") member.countdownSeconds += seconds; if (d.mode === "stopwatch") member.stopwatchSeconds += seconds; if (d.username) member.username = d.username; } });
        const profiles = await Promise.all([...members.keys()].map(uid => getDoc(doc(db, "publicProfiles", uid))));
        const ownerUids = new Set();
        profiles.forEach(p => { if (p.exists() && members.has(p.id)) { members.get(p.id).username = p.data().username || members.get(p.id).username; if (p.data().isOwner === true) ownerUids.add(p.id); } });
        const ranked = [...members.values()].sort((a,b) => b.seconds-a.seconds);
        list.replaceChildren();
        ranked.forEach((member, i) => { const row = document.createElement("div"); row.className = "friend-list-row"; const name = document.createElement("strong"); name.textContent = `${i+1}. ${member.username}${member.uid === auth.currentUser.uid ? " (YOU)" : ""}`; if (ownerUids.has(member.uid)) appendOwnerTag(name, "👑 OWNER"); const time = document.createElement("small"); time.textContent = `${formatChallengeTime(member.seconds)}  |  ⏳ ${formatChallengeTime(member.countdownSeconds)}  |  ⏱ ${formatChallengeTime(member.stopwatchSeconds)}`; time.title = "Total study time | Countdown | Stopwatch"; row.append(name,time); list.append(row); });
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
timerHoursInput.addEventListener("input", () => {
    if (!activeSession && timerMode === "countdown") {
        try { timerDisplay.textContent = formatDuration(getSelectedCountdownSeconds()); }
        catch { timerDisplay.textContent = "00:00:00"; }
    }
});
timerMinutesInput.addEventListener("input", () => {
    if (!activeSession && timerMode === "countdown") {
        try { timerDisplay.textContent = formatDuration(getSelectedCountdownSeconds()); }
        catch { timerDisplay.textContent = "00:00:00"; }
    }
});
timerSecondsInput.addEventListener("input", () => {
    if (!activeSession && timerMode === "countdown") {
        try { timerDisplay.textContent = formatDuration(getSelectedCountdownSeconds()); }
        catch { timerDisplay.textContent = "00:00:00"; }
    }
});
timerStartBtn.addEventListener("click", startStudySession);
timerPauseBtn.addEventListener("click", pauseStudySession);
timerResumeBtn.addEventListener("click", resumeStudySession);
timerFinishBtn.addEventListener("click", () => finishStudySession(false));
timerResetBtn.addEventListener("click", resetStudySession);


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
    }
});


// Expand/collapse the study countdown and stopwatch into a focused full-screen view.
const timerExpandBtn = document.getElementById("timerExpandBtn");
const studyTimerSection = document.getElementById("studyTimer");
if (timerExpandBtn && studyTimerSection) {
    const setTimerExpanded = expanded => {
        studyTimerSection.classList.toggle("timer-expanded", expanded);
        document.body.classList.toggle("timer-overlay-open", expanded);
        timerExpandBtn.setAttribute("aria-expanded", String(expanded));
        timerExpandBtn.innerHTML = expanded ? '⤢ <span>تصغير</span>' : '⛶ <span>تكبير</span>';
        timerExpandBtn.setAttribute("aria-label", expanded ? "Shrink timer" : "Expand timer");
    };
    timerExpandBtn.addEventListener("click", () => {
        setTimerExpanded(!studyTimerSection.classList.contains("timer-expanded"));
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && studyTimerSection.classList.contains("timer-expanded")) {
            setTimerExpanded(false);
        }
    });
}
