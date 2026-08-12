export const AI_REVIEW_DISABLED_EVENT = "bifrostwrite:ai-review-disabled";

export function notifyAiReviewDisabled() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(AI_REVIEW_DISABLED_EVENT));
}
