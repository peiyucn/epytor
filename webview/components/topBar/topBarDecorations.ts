
import { applyTooltip } from "@/ui/tooltip";
import { t } from "@/i18n";

let tooltipsMismatchWarned = false;

export function setupTopBarTooltips(container: HTMLElement): void {
    const tooltips = [
        t('Table of Contents'),
        t('Undo'),
        t('Redo'),
        t('Bold'),
        t('Italic'),
        t('Strikethrough'),
        t('Inline Code'),
        t('Clear Formatting'),
        t('Bullet List'),
        t('Ordered List'),
        t('Task List'),
        t('Insert/Edit Link'),
        t('Insert Image'),
        t('Insert Table'),
        t('Code Block'),
        t('Math Formula'),
        t('Blockquote'),
        t('Horizontal Rule'),
        t('Settings'),
    ];

    const applyAll = () => {
        const topBar = container.querySelector('.milkdown-top-bar');
        if (!topBar) return;
        const items = topBar.querySelectorAll<HTMLElement>('.top-bar-item');

        if (items.length !== tooltips.length && !tooltipsMismatchWarned) {
            tooltipsMismatchWarned = true;
            console.warn(
                `[epytor] top-bar tooltips: ${tooltips.length} labels vs ${items.length} buttons rendered`,
            );
        }
        items.forEach((item, idx) => {
            if (item.dataset.tip) return;
            const text = tooltips[idx];
            if (text) {
                item.dataset.tip = '1';
                applyTooltip(item, text, { placement: 'below' });
            }
        });
    };

    requestAnimationFrame(applyAll);
    new MutationObserver(() => requestAnimationFrame(applyAll))
        .observe(container, { childList: true, subtree: true });
}

export function setupTopBarBrand(container: HTMLElement): void {
    const inject = () => {
        const topBar = container.querySelector('.milkdown-top-bar');
        if (!topBar || topBar.querySelector('.epytor-brand')) return;
        const brand = document.createElement('span');
        brand.className = 'epytor-brand';
        brand.textContent = '🦖EPYTOR';
        topBar.insertBefore(brand, topBar.firstChild);
    };
    requestAnimationFrame(inject);
    new MutationObserver(() => requestAnimationFrame(inject))
        .observe(container, { childList: true, subtree: true });
}
