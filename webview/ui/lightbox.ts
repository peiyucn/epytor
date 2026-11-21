

export interface LightboxBuildResult {

    closeButton?: HTMLElement;
}

export interface LightboxOptions {

    className: string;

    build: (root: HTMLElement) => LightboxBuildResult | void;

    onOpen?: (root: HTMLElement) => void;

    onDispose?: () => void;
}

export interface Lightbox {
    readonly el: HTMLElement;

    close(): void;
    isOpen(): boolean;
}

export interface LightboxHost {

    active(): Lightbox | null;
    isOpen(): boolean;

    open(options: LightboxOptions): Lightbox | null;

    close(): void;
}

export function createLightboxHost(): LightboxHost {
    let active: Lightbox | null = null;

    function open(options: LightboxOptions): Lightbox | null {
        if (active) {
            return null;
        }

        const root = document.createElement("div");
        root.className = options.className;
        const built = options.build(root) ?? {};

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeActive();
            }
        };
        const onBackdropMousedown = (event: MouseEvent): void => {
            if (event.target === root) {
                closeActive();
            }
        };
        const onCloseButtonMousedown = (event: MouseEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            closeActive();
        };

        let closed = false;

        function closeActive(): void {
            if (closed) {
                return;
            }
            closed = true;
            document.removeEventListener("keydown", onKeyDown);
            root.removeEventListener("mousedown", onBackdropMousedown);
            built.closeButton?.removeEventListener("mousedown", onCloseButtonMousedown);
            root.remove();
            active = null;
            options.onDispose?.();
        }

        built.closeButton?.addEventListener("mousedown", onCloseButtonMousedown);
        root.addEventListener("mousedown", onBackdropMousedown);
        document.addEventListener("keydown", onKeyDown);
        document.body.appendChild(root);
        options.onOpen?.(root);

        const handle: Lightbox = {
            el: root,
            close: closeActive,
            isOpen: () => !closed,
        };
        active = handle;
        return handle;
    }

    return {
        active: () => active,
        isOpen: () => active?.isOpen() ?? false,
        open,
        close: () => {
            active?.close();
        },
    };
}
