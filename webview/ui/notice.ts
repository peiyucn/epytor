
import "./notice.css";


const NOTICE_VISIBLE_MS = 8000;

let current: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;


export function showNotice(message: string): void {
    dismissNotice();
    const el = document.createElement("div");
    el.className = "epytor-notice";
    el.setAttribute("role", "status");
    el.textContent = message;
    el.addEventListener("click", dismissNotice);
    document.body.appendChild(el);
    current = el;
    hideTimer = setTimeout(dismissNotice, NOTICE_VISIBLE_MS);
}


export function dismissNotice(): void {
    if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    current?.remove();
    current = null;
}
