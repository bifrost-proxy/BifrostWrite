import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../../../test/test-utils";
import { MermaidFullscreenHost } from "./MermaidFullscreenHost";
import {
    createMermaidFullscreenButton,
    openMermaidFullscreen,
} from "./mermaidFullscreen";
import { openImagePreview } from "../imagePreview";

const TEST_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <text>Fullscreen diagram</text>
    </svg>
`;

describe("MermaidFullscreenHost", () => {
    it("opens from a Mermaid preview button and closes from the toolbar", () => {
        renderComponent(<MermaidFullscreenHost />);
        const trigger = createMermaidFullscreenButton(TEST_SVG);
        document.body.appendChild(trigger);

        fireEvent.click(trigger);

        expect(
            screen.getByRole("dialog", { name: "Mermaid preview" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Fullscreen diagram")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "100%",
        );

        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        trigger.remove();
    });

    it("supports toolbar and trackpad zoom while leaving regular scrolling native", () => {
        renderComponent(<MermaidFullscreenHost />);
        act(() => openMermaidFullscreen(TEST_SVG));

        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "125%",
        );

        const canvas = screen.getByLabelText("Mermaid canvas");
        fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
        const gestureStart = new Event("gesturestart", {
            bubbles: true,
            cancelable: true,
        });
        act(() => canvas.dispatchEvent(gestureStart));
        const gestureChange = new Event("gesturechange", {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperties(gestureChange, {
            scale: { value: 1.5 },
            clientX: { value: 40 },
            clientY: { value: 40 },
        });
        act(() => canvas.dispatchEvent(gestureChange));
        expect(gestureChange.defaultPrevented).toBe(true);
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "150%",
        );

        fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
        const plainWheel = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: 40,
        });
        canvas.dispatchEvent(plainWheel);
        expect(plainWheel.defaultPrevented).toBe(false);
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "100%",
        );

        fireEvent.wheel(canvas, {
            ctrlKey: true,
            deltaY: -100,
            clientX: 40,
            clientY: 40,
        });
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "125%",
        );
    });

    it("closes on Escape", () => {
        renderComponent(<MermaidFullscreenHost />);
        act(() => openMermaidFullscreen(TEST_SVG));

        fireEvent.keyDown(window, { key: "Escape" });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("previews images with the same zoom overlay", () => {
        renderComponent(<MermaidFullscreenHost />);

        act(() => openImagePreview("https://example.com/photo.png", "Photo"));

        expect(
            screen.getByRole("dialog", { name: "Image preview" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute(
            "src",
            "https://example.com/photo.png",
        );

        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
            "125%",
        );
    });

    it("keeps the source Mermaid node mounted and preserves body layout styles", () => {
        renderComponent(<MermaidFullscreenHost />);
        const source = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        const sourceText = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
        );
        sourceText.textContent = "Source diagram";
        source.appendChild(sourceText);
        document.body.appendChild(source);
        document.body.style.overflow = "auto";

        act(() => openMermaidFullscreen(source));

        expect(source.isConnected).toBe(true);
        expect(source.parentElement).toBe(document.body);
        expect(document.body.style.overflow).toBe("auto");
        expect(screen.getAllByText("Source diagram")).toHaveLength(2);

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(source.isConnected).toBe(true);
        expect(source.parentElement).toBe(document.body);
        expect(document.body.style.overflow).toBe("auto");
        source.remove();
        document.body.style.removeProperty("overflow");
    });
});
