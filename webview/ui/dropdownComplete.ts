// Dropdown state shared by imgPathComplete and pathComplete.

export interface DropdownState {
    el: HTMLUListElement | null;
    activeIndex: number;
}

/** Close the dropdown and reset state. */
export function closeDropdown(state: DropdownState): void {
    if (state.el) {
        state.el.remove();
        state.el = null;
    }
    state.activeIndex = -1;
}

/** Refresh the active-item highlight. */
export function updateActiveItem(state: DropdownState, activeClass: string): void {
    if (!state.el) { return; }
    Array.from(state.el.children).forEach((li, i) => {
        const isActive = i === state.activeIndex;
        li.classList.toggle(activeClass, isActive);
        if (isActive) {
            (li as HTMLElement).scrollIntoView({ block: "nearest" });
        }
    });
}
