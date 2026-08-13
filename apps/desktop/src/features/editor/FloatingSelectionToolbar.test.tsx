import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../../app/store/settingsStore";
import { renderComponent } from "../../test/test-utils";
import { FloatingSelectionToolbar } from "./FloatingSelectionToolbar";

function renderToolbar() {
    return renderComponent(
        <FloatingSelectionToolbar
            toolbar={{
                x: 400,
                top: 120,
                bottom: 150,
                selectionFrom: 0,
                selectionTo: 4,
            }}
            editorElement={null}
            onAction={vi.fn()}
            onAddToChat={vi.fn()}
            onClose={vi.fn()}
        />,
    );
}

afterEach(() => {
    useSettingsStore.getState().setSetting("appLanguage", "system");
});

describe("FloatingSelectionToolbar", () => {
    it("keeps editor symbols and icon nodes intact in Chinese", () => {
        useSettingsStore.getState().setSetting("appLanguage", "zh-CN");
        renderToolbar();

        expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
        expect(screen.getByText("B")).toBeInTheDocument();
        expect(screen.getByText("I")).toBeInTheDocument();
        expect(screen.getByText("</>")).toBeInTheDocument();
        expect(screen.getByText("H1")).toBeInTheDocument();
        expect(screen.getByText("H2")).toBeInTheDocument();
        expect(screen.getByText("H3")).toBeInTheDocument();
        expect(screen.getByText("Tx")).toBeInTheDocument();
        expect(screen.queryByText("氢2")).not.toBeInTheDocument();
        expect(screen.queryByText("发射机")).not.toBeInTheDocument();
    });

    it("localizes descriptions instead of the operator labels", () => {
        useSettingsStore.getState().setSetting("appLanguage", "zh-CN");
        renderToolbar();

        expect(screen.getByRole("button", { name: "加粗" })).toHaveTextContent(
            "B",
        );
        expect(
            screen.getByRole("button", { name: "二级标题" }),
        ).toHaveTextContent("H2");
        expect(
            screen.getByRole("button", { name: "双向链接" }).querySelector(
                "svg",
            ),
        ).not.toBeNull();
    });
});
