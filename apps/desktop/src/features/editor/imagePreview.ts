export const OPEN_IMAGE_PREVIEW_EVENT = "bifrostwrite:open-image-preview";

export interface OpenImagePreviewPayload {
    src: string;
    alt: string;
}

export function openImagePreview(src: string, alt = "") {
    if (!src.trim()) return;

    window.dispatchEvent(
        new CustomEvent<OpenImagePreviewPayload>(OPEN_IMAGE_PREVIEW_EVENT, {
            detail: { src, alt },
        }),
    );
}
