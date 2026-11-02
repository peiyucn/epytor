/**
 * Fullscreen lightbox scaffold: a body-level overlay with Escape/backdrop dismissal and one
 * active lightbox per host.
 *
 * Extracted from the image lightbox and the code-block fullscreen view. Both had their own
 * module-level "active lightbox" singleton, their own Escape listener and their own
 * hand-written cleanup that had to stay idempotent (rebuild path + NodeView.destroy can both
 * fire). The host keeps that lifecycle; callers only build content and restore whatever DOM
 * they moved into the overlay.
 */

export interface LightboxBuildResult {
    /**
     * Button that closes the lightbox. The scaffold wires its mousedown to
     * preventDefault + stopPropagation + close, matching both previous implementations.
     */
    closeButton?: HTMLElement;
}

export interface LightboxOptions {
    /** Root overlay class; position/background live in the caller's component sheet. */
    className: string;
    /** Build the overlay content into `root` (not in the document yet). */
    build: (root: HTMLElement) => LightboxBuildResult | void;
    /**
     * Run after the root is attached to the document, e.g. to move an editor DOM node into the
     * overlay. Keeping the move post-attach preserves the ordering the code-block lightbox had
     * (overlay in the document first) so CodeMirror is never detached from the document.
     */
    onOpen?: (root: HTMLElement) => void;
    /**
     * Run after the overlay is removed, e.g. to move an editor DOM node back to its original
     * parent. Runs exactly once, and only after the overlay is gone.
     */
    onDispose?: () => void;
}

export interface Lightbox {
    readonly el: HTMLElement;
    /** Remove the overlay and its listeners. Idempotent. */
    close(): void;
    isOpen(): boolean;
}

export interface LightboxHost {
    /** The open lightbox, or null. Lets an owner close only the lightbox it cares about. */
    active(): Lightbox | null;
    isOpen(): boolean;
    /**
     * Open a lightbox. Returns null when one is already open: both previous implementations
     * were singletons and must not stack overlays.
     */
    open(options: LightboxOptions): Lightbox | null;
    /** Close the active lightbox if any. Idempotent. */
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
