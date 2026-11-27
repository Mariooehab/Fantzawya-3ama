import { auth, db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const launchers = [document.getElementById("faiLauncher"), document.getElementById("faiDesktopLauncher")].filter(Boolean);
const panel = document.getElementById("faiPanel");
const closeBtn = document.getElementById("faiClose");
const form = document.getElementById("faiForm");
const input = document.getElementById("faiInput");
const send = document.getElementById("faiSend");
const messages = document.getElementById("faiMessages");
const AI_WORKER_URL = "https://fantzawya-ai.01283618091mahmoud.workers.dev";
let history = [];

function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    document.body.classList.add("fai-open");
    requestAnimationFrame(() => input?.focus());
}
function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    document.body.classList.remove("fai-open");
}
launchers.forEach(button => button.addEventListener("click", openPanel));
closeBtn?.addEventListener("click", closePanel);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel && !panel.hidden) closePanel();
});
document.querySelectorAll(".fai-suggestions [data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
        if (!input || !form) return;
        input.value = button.dataset.prompt || "";
        form.requestSubmit();
    });
});
function addMessage(text, role = "assistant", extra = "") {
    if (!messages) return null;
    const element = document.createElement("div");
    element.className = `fai-message ${role} ${extra}`.trim();
    element.textContent = text;
    messages.append(element);
    messages.scrollTop = messages.scrollHeight;
    return element;
}
async function getStudyContext() {
    const user = auth.currentUser;
    if (!user) throw new Error("سجّل دخولك الأول عشان تستخدم المساعد.");
    const [todoSnap, sessionSnap] = await Promise.all([
        getDocs(collection(db, "users", user.uid, "todos")),
        getDocs(query(collection(db, "studySessions"), where("uid", "==", user.uid)))
    ]);
    const todos = todoSnap.docs.map(item => {
        const data = item.data();
        return { title: data.title || "", note: data.note || "", dueAt: data.dueAt || "", completed: !!data.completed };
    }).slice(0, 10);
    const sessions = sessionSnap.docs.map(item => {
        const data = item.data();
        return { mode: data.mode, status: data.status, durationSeconds: Number(data.durationSeconds) || 0, startedAt: data.startedAt?.toDate?.()?.toISOString?.() || "" };
    }).slice(-10);
    return {
        username: document.getElementById("profileUsername")?.textContent || "Student",
        examDate: document.getElementById("examDate")?.value || "",
        todos,
        sessions
    };
}
if (form && input && send) {
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const prompt = input.value.trim();
        if (!prompt || send.disabled) return;
        addMessage(prompt, "user");
        input.value = "";
        send.disabled = true;
        send.textContent = "...";
        const pending = addMessage("بفكر في أفضل إجابة ليك...", "assistant", "pending");
        try {
            const context = await getStudyContext();
            if (!AI_WORKER_URL.startsWith("https://") || AI_WORKER_URL.includes("YOUR-WORKER-NAME")) {
                throw new Error("لسه محتاج تحط رابط Cloudflare Worker داخل ai.js.");
            }
            const user = auth.currentUser;
            if (!user) throw new Error("سجّل دخولك الأول.");
            const idToken = await user.getIdToken();
            const response = await fetch(AI_WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
                body: JSON.stringify({ message: prompt, context, history: history.slice(-4) })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "خدمة المساعد لم تستجب.");
            const answer = result.answer || "مش قادر أجهز إجابة دلوقتي. جرّب تاني.";
            pending?.remove();
            addMessage(answer, "assistant");
            history.push({ role: "user", text: prompt }, { role: "assistant", text: answer });
            history = history.slice(-8);
        } catch (error) {
            pending?.remove();
            console.error("Fantzawya AI error:", error);
            addMessage(`حصلت مشكلة: ${error.message || "حاول مرة تانية."}`, "assistant");
        } finally {
            send.disabled = false;
            send.textContent = "إرسال";
            input.focus();
        }
    });
}
