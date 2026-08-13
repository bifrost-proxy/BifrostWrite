import { translate } from "../../app/i18n";
import { useState } from "react";
import {
    useGraphSettingsStore,
    type GraphGroup,
    type GraphMode,
    type GraphLayoutStrategy,
    type GraphRendererMode,
    type GraphQualityMode,
    type GraphQualitySetting,
    type GraphSettings,
} from "./graphSettingsStore";

function Slider({
    label,
    settingKey,
    min,
    max,
    step,
}: {
    label: string;
    settingKey: keyof GraphSettings;
    min: number;
    max: number;
    step: number;
}) {
    const value = useGraphSettingsStore((s) => s[settingKey]) as number;
    const set = useGraphSettingsStore((s) => s.set);
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{translate(label)}</span>
                <span style={{ opacity: 0.6 }}>{value}</span>
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => set(settingKey, Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
            />
        </label>
    );
}

function Toggle({
    label,
    settingKey,
}: {
    label: string;
    settingKey: keyof GraphSettings;
}) {
    const value = useGraphSettingsStore((s) => s[settingKey]) as boolean;
    const set = useGraphSettingsStore((s) => s.set);
    return (
        <label
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
            }}
        >
            <span>{translate(label)}</span>
            <div
                onClick={() => set(settingKey, !value)}
                style={{
                    width: 32,
                    height: 18,
                    borderRadius: 9,
                    background: value ? "var(--accent)" : "var(--bg-tertiary)",
                    position: "relative",
                    transition: "background 150ms",
                    cursor: "pointer",
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        background: "#fff",
                        position: "absolute",
                        top: 2,
                        left: value ? 16 : 2,
                        transition: "left 150ms",
                    }}
                />
            </div>
        </label>
    );
}

function SearchFilterInput() {
    const searchFilter = useGraphSettingsStore((s) => s.searchFilter);
    const set = useGraphSettingsStore((s) => s.set);
    return (
        <input
            type="text"
            value={searchFilter}
            onChange={(e) => set("searchFilter", e.target.value)}
            placeholder={translate("Filter nodes... (e.g. tag:project)")}
            style={{
                width: "100%",
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: 11,
                outline: "none",
            }}
            onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
            }}
        />
    );
}

function NumberInput({
    label,
    settingKey,
    min,
    max,
    step = 1,
}: {
    label: string;
    settingKey: keyof GraphSettings;
    min: number;
    max: number;
    step?: number;
}) {
    const value = useGraphSettingsStore((s) => s[settingKey]) as number;
    const set = useGraphSettingsStore((s) => s.set);
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{translate(label)}</span>
                <span style={{ opacity: 0.6 }}>
                    {value.toLocaleString("en-US")}
                </span>
            </span>
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) =>
                    set(
                        settingKey,
                        Math.min(
                            max,
                            Math.max(min, Number(e.target.value) || min),
                        ),
                    )
                }
                style={inputStyle}
            />
        </label>
    );
}

function ModeSection() {
    const graphMode = useGraphSettingsStore((s) => s.graphMode);
    return (
        <Section title={translate("Mode")}>
            <ModeToggle />
            {graphMode === "local" && (
                <Slider
                    label={translate("Depth")}
                    settingKey="localDepth"
                    min={1}
                    max={5}
                    step={1}
                />
            )}
        </Section>
    );
}

const QUALITY_OPTIONS: GraphQualitySetting[] = [
    "auto",
    "cinematic",
    "balanced",
    "large-vault",
    "overview",
];
const LAYOUT_OPTIONS: GraphLayoutStrategy[] = [
    "preset",
    "force",
    "overview-packed",
    "clustered",
];
const RENDERER_OPTIONS: GraphRendererMode[] = ["2d", "3d"];

function formatQualityLabel(mode: GraphQualitySetting | GraphQualityMode) {
    switch (mode) {
        case "large-vault":
            return translate("Large Vault");
        default:
            return translate(
                mode.charAt(0).toUpperCase() + mode.slice(1),
            );
    }
}

function formatLayoutLabel(mode: GraphLayoutStrategy) {
    switch (mode) {
        case "overview-packed":
            return translate("Overview Packed");
        default:
            return translate(
                mode.charAt(0).toUpperCase() + mode.slice(1),
            );
    }
}

function QualitySection({
    effectiveQualityMode,
    totalNodes,
}: {
    effectiveQualityMode: GraphQualityMode | null;
    totalNodes: number | null;
}) {
    const qualityMode = useGraphSettingsStore((s) => s.qualityMode);
    const set = useGraphSettingsStore((s) => s.set);

    return (
        <Section title={translate("Quality")}>
            <label
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                    }}
                >
                    {translate("Render mode")}
                </span>
                <select
                    value={qualityMode}
                    onChange={(e) =>
                        set(
                            "qualityMode",
                            e.target.value as GraphQualitySetting,
                        )
                    }
                    style={selectStyle}
                >
                    {QUALITY_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                            {formatQualityLabel(mode)}
                        </option>
                    ))}
                </select>
            </label>
            <div style={hintStyle}>
                {qualityMode === "auto" && effectiveQualityMode
                    ? translate(`Auto is using ${formatQualityLabel(effectiveQualityMode)}${typeof totalNodes === "number" ? ` for ${totalNodes.toLocaleString("en-US")} nodes` : ""}.`)
                    : translate("Quality mode only affects rendering detail and interaction cost.")}
            </div>
        </Section>
    );
}

function LayoutSection() {
    const layoutStrategy = useGraphSettingsStore((s) => s.layoutStrategy);
    const set = useGraphSettingsStore((s) => s.set);

    return (
        <Section title={translate("Layout")}>
            <label
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                    }}
                >
                    {translate("Strategy")}
                </span>
                <select
                    value={layoutStrategy}
                    onChange={(e) =>
                        set(
                            "layoutStrategy",
                            e.target.value as GraphLayoutStrategy,
                        )
                    }
                    style={selectStyle}
                >
                    {LAYOUT_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                            {formatLayoutLabel(mode)}
                        </option>
                    ))}
                </select>
            </label>
            <div style={hintStyle}>
                {translate("Preset reuses saved positions; Force always simulates; Overview Packed and Clustered start from deterministic layouts.")}
            </div>
        </Section>
    );
}

function LimitsSection() {
    return (
        <Section title={translate("Limits")}>
            <NumberInput
                label={translate("Global max nodes")}
                settingKey="maxGlobalNodes"
                min={500}
                max={100_000}
                step={100}
            />
            <NumberInput
                label={translate("Global max links")}
                settingKey="maxGlobalLinks"
                min={1_000}
                max={300_000}
                step={500}
            />
            <NumberInput
                label={translate("Overview max nodes")}
                settingKey="maxOverviewNodes"
                min={50}
                max={10_000}
                step={50}
            />
            <NumberInput
                label={translate("Overview max links")}
                settingKey="maxOverviewLinks"
                min={100}
                max={50_000}
                step={100}
            />
            <NumberInput
                label={translate("Local max nodes")}
                settingKey="maxLocalNodes"
                min={100}
                max={20_000}
                step={100}
            />
            <NumberInput
                label={translate("Local max links")}
                settingKey="maxLocalLinks"
                min={500}
                max={100_000}
                step={500}
            />
            <div style={hintStyle}>
                {translate("Truncation limits are applied before rendering to keep large vaults responsive.")}
            </div>
        </Section>
    );
}

function RendererSection() {
    const rendererMode = useGraphSettingsStore((s) => s.rendererMode);
    const set = useGraphSettingsStore((s) => s.set);

    return (
        <Section title={translate("Renderer")}>
            <label
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                <span style={hintStyle}>{translate("Mode")}</span>
                <select
                    value={rendererMode}
                    onChange={(e) =>
                        set("rendererMode", e.target.value as GraphRendererMode)
                    }
                    style={selectStyle}
                >
                    {RENDERER_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                            {mode.toUpperCase()}
                        </option>
                    ))}
                </select>
            </label>
            <div style={hintStyle}>
                {translate("2D is the default workflow. 3D is experimental and reuses the same snapshot and layout pipeline.")}
            </div>
        </Section>
    );
}

function VaultDefaultsSection({ vaultPath }: { vaultPath: string | null }) {
    const graphMode = useGraphSettingsStore((s) => s.graphMode);
    const defaultModeByVault = useGraphSettingsStore(
        (s) => s.defaultModeByVault,
    );
    const setVaultDefaultMode = useGraphSettingsStore(
        (s) => s.setVaultDefaultMode,
    );
    const defaultMode = vaultPath
        ? (defaultModeByVault[vaultPath] ?? "global")
        : "global";

    return (
        <Section title={translate("Vault")}>
            <label
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                    }}
                >
                    {translate("Default mode for this vault")}
                </span>
                <select
                    value={defaultMode}
                    onChange={(e) =>
                        vaultPath &&
                        setVaultDefaultMode(
                            vaultPath,
                            e.target.value as GraphMode,
                        )
                    }
                    disabled={!vaultPath}
                    style={{
                        ...selectStyle,
                        opacity: vaultPath ? 1 : 0.5,
                    }}
                >
                    {(["global", "overview", "local"] as const).map((mode) => (
                        <option key={mode} value={mode}>
                            {translate(
                                mode.charAt(0).toUpperCase() +
                                    mode.slice(1),
                            )}
                        </option>
                    ))}
                </select>
            </label>
            <button
                onClick={() =>
                    vaultPath && setVaultDefaultMode(vaultPath, graphMode)
                }
                disabled={!vaultPath}
                style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    fontSize: 11,
                    cursor: vaultPath ? "pointer" : "default",
                    opacity: vaultPath ? 1 : 0.5,
                }}
            >
                {translate("Use current mode as default")}
            </button>
            <div style={hintStyle}>
                {translate("The saved mode is applied when this vault is reopened.")}
            </div>
        </Section>
    );
}

function ModeToggle() {
    const graphMode = useGraphSettingsStore((s) => s.graphMode);
    const set = useGraphSettingsStore((s) => s.set);
    return (
        <div
            style={{
                display: "flex",
                gap: 4,
            }}
        >
            {(["global", "overview", "local"] as const).map((mode) => (
                <button
                    key={mode}
                    onClick={() => set("graphMode", mode)}
                    style={{
                        flex: 1,
                        padding: "4px 0",
                        borderRadius: 6,
                        border: "1px solid",
                        borderColor:
                            graphMode === mode
                                ? "var(--accent)"
                                : "var(--border)",
                        background:
                            graphMode === mode
                                ? "var(--bg-tertiary)"
                                : "transparent",
                        color:
                            graphMode === mode
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "capitalize",
                    }}
                >
                    {translate(
                        mode.charAt(0).toUpperCase() + mode.slice(1),
                    )}
                </button>
            ))}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.5,
                }}
            >
                {title}
            </div>
            {children}
        </div>
    );
}

const GROUP_COLORS = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#78716c",
];

function GroupItem({ group }: { group: GraphGroup }) {
    const [expanded, setExpanded] = useState(false);
    const updateGroup = useGraphSettingsStore((s) => s.updateGroup);
    const removeGroup = useGraphSettingsStore((s) => s.removeGroup);
    const moveGroup = useGraphSettingsStore((s) => s.moveGroup);

    return (
        <div
            style={{
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-tertiary)",
                overflow: "hidden",
            }}
        >
            {/* Header row */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 6px",
                    cursor: "pointer",
                }}
            >
                <div
                    style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        background: group.color,
                        flexShrink: 0,
                    }}
                />
                <span
                    style={{
                        flex: 1,
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {group.name || translate("Untitled")}
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        moveGroup(group.id, "up");
                    }}
                    title={translate("Move up")}
                    style={arrowBtnStyle}
                >
                    ↑
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        moveGroup(group.id, "down");
                    }}
                    title={translate("Move down")}
                    style={arrowBtnStyle}
                >
                    ↓
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeGroup(group.id);
                    }}
                    title={translate("Delete group")}
                    style={{
                        ...arrowBtnStyle,
                        color: "#ef4444",
                    }}
                >
                    ×
                </button>
            </div>

            {/* Expanded editor */}
            {expanded && (
                <div
                    style={{
                        padding: "4px 6px 8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        borderTop: "1px solid var(--border)",
                    }}
                >
                    <input
                        type="text"
                        value={group.name}
                        onChange={(e) =>
                            updateGroup(group.id, { name: e.target.value })
                        }
                        placeholder={translate("Group name")}
                        style={inputStyle}
                    />
                    <input
                        type="text"
                        value={group.query}
                        onChange={(e) =>
                            updateGroup(group.id, { query: e.target.value })
                        }
                        placeholder={translate("Query (e.g. tag:project path:daily)")}
                        style={inputStyle}
                    />
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {GROUP_COLORS.map((c) => (
                            <div
                                key={c}
                                onClick={() =>
                                    updateGroup(group.id, { color: c })
                                }
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    background: c,
                                    cursor: "pointer",
                                    border:
                                        group.color === c
                                            ? "2px solid var(--text-primary)"
                                            : "2px solid transparent",
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const arrowBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: "0 2px",
    fontSize: 12,
    lineHeight: 1,
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 6px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 11,
    outline: "none",
};

const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: 11,
    outline: "none",
};

const hintStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
};

function GroupsSection() {
    const groups = useGraphSettingsStore((s) => s.groups);
    const addGroup = useGraphSettingsStore((s) => s.addGroup);

    const handleAdd = () => {
        addGroup({
            id: crypto.randomUUID(),
            name: "",
            query: "",
            color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
        });
    };

    return (
        <Section title={translate("Groups")}>
            {groups.map((g) => (
                <GroupItem key={g.id} group={g} />
            ))}
            <button
                onClick={handleAdd}
                style={{
                    width: "100%",
                    padding: "4px 0",
                    borderRadius: 6,
                    border: "1px dashed var(--border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: 11,
                }}
            >
                {translate("+ Add group")}
            </button>
        </Section>
    );
}

const PANEL_WIDTH = 240;

export function GraphSettingsPanel({
    effectiveQualityMode = null,
    totalNodes = null,
    vaultPath = null,
}: {
    effectiveQualityMode?: GraphQualityMode | null;
    totalNodes?: number | null;
    vaultPath?: string | null;
}) {
    const panelOpen = useGraphSettingsStore((s) => s.panelOpen);

    if (!panelOpen) return null;

    return (
        <div
            style={{
                width: PANEL_WIDTH,
                minWidth: PANEL_WIDTH,
                height: "100%",
                background: "var(--bg-secondary)",
                borderRight: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "14px 14px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontSize: 12,
                    color: "var(--text-primary)",
                }}
            >
                <ModeSection />
                <QualitySection
                    effectiveQualityMode={effectiveQualityMode}
                    totalNodes={totalNodes}
                />
                <RendererSection />
                <LayoutSection />
                <LimitsSection />
                <VaultDefaultsSection vaultPath={vaultPath} />

                <Section title={translate("Forces")}>
                    <Slider
                        label={translate("Center")}
                        settingKey="centerForce"
                        min={0}
                        max={1}
                        step={0.05}
                    />
                    <Slider
                        label={translate("Repel")}
                        settingKey="repelForce"
                        min={0}
                        max={200}
                        step={5}
                    />
                    <Slider
                        label={translate("Link strength")}
                        settingKey="linkForce"
                        min={0}
                        max={1}
                        step={0.05}
                    />
                    <Slider
                        label={translate("Link distance")}
                        settingKey="linkDistance"
                        min={10}
                        max={200}
                        step={5}
                    />
                </Section>

                <Section title={translate("Display")}>
                    <Slider
                        label={translate("Node size")}
                        settingKey="nodeSize"
                        min={1}
                        max={10}
                        step={0.5}
                    />
                    <Slider
                        label={translate("Link width")}
                        settingKey="linkThickness"
                        min={0.1}
                        max={5}
                        step={0.1}
                    />
                    <Toggle label={translate("Show titles")} settingKey="showTitles" />
                    <Slider
                        label={translate("Text zoom")}
                        settingKey="textFadeThreshold"
                        min={0}
                        max={2}
                        step={0.1}
                    />
                    <Slider
                        label={translate("Glow")}
                        settingKey="glowIntensity"
                        min={0}
                        max={100}
                        step={5}
                    />
                    <Toggle label={translate("Arrows")} settingKey="arrows" />
                </Section>

                <Section title={translate("Filters")}>
                    <SearchFilterInput />
                    <Toggle label={translate("Show orphans")} settingKey="showOrphans" />
                    <Toggle label={translate("Tags as nodes")} settingKey="showTagNodes" />
                    <Toggle
                        label={translate("Attachments")}
                        settingKey="showAttachmentNodes"
                    />
                </Section>

                <GroupsSection />
            </div>
        </div>
    );
}
