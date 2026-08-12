export const AGENT_SIDEBAR_DRAG_EVENT = "bifrostwrite:agent-sidebar-drag";

export type AgentSidebarDragPhase = "start" | "move" | "end" | "cancel";

export interface AgentSidebarDragDetail {
    phase: AgentSidebarDragPhase;
    x: number;
    y: number;
    sessionId: string;
    title: string;
}

export function emitAgentSidebarDrag(detail: AgentSidebarDragDetail) {
    window.dispatchEvent(
        new CustomEvent<AgentSidebarDragDetail>(AGENT_SIDEBAR_DRAG_EVENT, {
            detail,
        }),
    );
}
