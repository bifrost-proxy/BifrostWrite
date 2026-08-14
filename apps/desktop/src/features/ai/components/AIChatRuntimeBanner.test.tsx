import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../../../test/test-utils";
import { AIChatRuntimeBanner } from "./AIChatRuntimeBanner";

describe("AIChatRuntimeBanner", () => {
    it("uses the theme-adaptive error palette for readable alerts", () => {
        renderComponent(
            <AIChatRuntimeBanner
                connection={{
                    status: "error",
                    message: "Could not reconnect this chat.",
                }}
            />,
        );

        const banner = screen.getByText("Could not reconnect this chat.");

        expect(banner).toHaveStyle({ color: "var(--diff-remove)" });
        expect(banner).toHaveAttribute(
            "style",
            expect.stringContaining(
                "background-color: color-mix(in srgb, var(--diff-remove) 10%, var(--bg-secondary))",
            ),
        );
        expect(banner).toHaveAttribute(
            "style",
            expect.stringContaining("border: 1px solid var(--diff-remove)"),
        );
    });
});
