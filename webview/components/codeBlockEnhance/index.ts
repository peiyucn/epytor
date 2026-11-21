
import "./codeBlockEnhance.css";
import { applyTooltip } from "@/ui/tooltip";
import { IconMaximize2 } from "@/ui/icons";
import { createLightboxHost } from "@/ui/lightbox";
import { t } from "@/i18n";

const COPY_FEEDBACK_RESET_MS = 1500;
const COPY_FEEDBACK_DELAY_MS = 100;


const fullscreenLightboxHost = createLightboxHost();


export function closeCodeBlockLightbox(): void {
    fullscreenLightboxHost.close();
}

export function enhanceCodeBlocks(container: HTMLElement): void {
    container.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest('.copy-button') as HTMLElement | null;
        if (!btn) return;
        setTimeout(() => {
            const tip = applyTooltip(btn, '✔ ' + t('Copied!'));
            tip.show();
            setTimeout(() => tip.setText(t('Copy Code')), COPY_FEEDBACK_RESET_MS);
        }, COPY_FEEDBACK_DELAY_MS);
    });


    const addFullscreenBtn = (block: Element): void => {
        const copyBtn = block.querySelector('.copy-button') as HTMLElement | null;
        if (copyBtn && !copyBtn.dataset.tip) { copyBtn.dataset.tip = '1'; applyTooltip(copyBtn, t('Copy Code')); }
        const previewBtn = block.querySelector('.preview-toggle-button') as HTMLElement | null;
        if (previewBtn && !previewBtn.dataset.tip) { previewBtn.dataset.tip = '1'; applyTooltip(previewBtn, t('Toggle preview')); }

        if (block.querySelector('.epytor-fullscreen-btn')) return;
        const btnGroup = block.querySelector('.tools-button-group');
        if (!btnGroup) return;

        const fsBtn = document.createElement('button');
        fsBtn.className = 'epytor-fullscreen-btn';
        fsBtn.innerHTML = IconMaximize2;
        applyTooltip(fsBtn, t('View Fullscreen'));
        fsBtn.addEventListener('mousedown', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const cmEditor = block.querySelector('.cm-editor') as HTMLElement | null;
            const cmHost = block.querySelector('.codemirror-host') as HTMLElement | null;
            const previewPanel = block.querySelector('.preview-panel') as HTMLElement | null;
            if (!cmEditor) return;
            const langBtn = block.querySelector('.language-button');
            const lang = langBtn?.textContent?.trim() || '';

            fullscreenLightboxHost.open({
                className: 'epytor-fs-lightbox',
                build: (root) => {
                    const header = document.createElement('div');
                    header.className = 'epytor-fs-header';
                    const langSpan = document.createElement('span');
                    langSpan.className = 'epytor-fs-lang';
                    langSpan.textContent = lang;
                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'epytor-fs-close';
                    closeBtn.textContent = '✕';
                    header.appendChild(langSpan);
                    header.appendChild(closeBtn);
                    const body = document.createElement('div');
                    body.className = 'epytor-fs-body';
                    root.appendChild(header);
                    root.appendChild(body);
                    return { closeButton: closeBtn };
                },
                onOpen: (root) => {


                    const body = root.querySelector('.epytor-fs-body');
                    if (!body) return;
                    body.appendChild(cmEditor);
                    if (previewPanel) body.appendChild(previewPanel);
                },
                onDispose: () => {
                    if (cmHost && cmEditor.parentElement !== cmHost) cmHost.appendChild(cmEditor);
                    if (previewPanel && previewPanel.parentElement !== block) block.appendChild(previewPanel);
                },
            });
        });
        btnGroup.appendChild(fsBtn);
    };

    const scanBlocks = () => container.querySelectorAll('.milkdown-code-block').forEach(addFullscreenBtn);
    requestAnimationFrame(scanBlocks);
    new MutationObserver(() => requestAnimationFrame(scanBlocks))
        .observe(container, { childList: true, subtree: true });




    const navStates = new WeakMap<HTMLElement, { activeIndex: number }>();
    container.addEventListener('keydown', (e) => {
        const input = e.target as HTMLElement;
        if (!input.closest('.search-box')) return;
        const list = input.closest('.list-wrapper')?.querySelector<HTMLElement>('.language-list');
        if (!list) return;
        const items = list.querySelectorAll<HTMLElement>('.language-list-item');
        if (items.length === 0) return;
        const state = navStates.get(input) ?? { activeIndex: -1 };
        navStates.set(input, state);
        const clamp = (i: number) => Math.max(-1, Math.min(i, items.length - 1));
        const apply = () => {
            items.forEach(el => el.classList.remove('focused'));
            const el = items[state.activeIndex];
            if (el) {
                el.classList.add('focused');
                el.scrollIntoView({ block: 'nearest' });
            }
        };
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            state.activeIndex = clamp(state.activeIndex + 1);
            apply();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            state.activeIndex = clamp(state.activeIndex - 1);
            apply();
        } else if (e.key === 'Enter') {
            e.preventDefault();

            const target = items[Math.max(state.activeIndex, 0)];
            target?.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            state.activeIndex = -1;
            input.blur();
        }
    });
}
