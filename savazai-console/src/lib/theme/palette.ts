/**
 * SavazAI Theme Palette Engine
 * ---------------------------------------------------------------------------
 * Single source of truth for the runtime theme model described in DESIGN.md:
 *
 *     Resolved tokens = Mode (light | dark) × Accent (preset | custom hex) × Surface tone
 *
 * Every accent and surface resolves to a WCAG-compliant variant for BOTH modes,
 * so a brand colour chosen in Command Center → Appearance can never break the
 * opposite mode.
 *
 * IMPORTANT: this module must stay dependency-free and "type-strip" compatible
 * (no enums / namespaces / parameter properties) because it is also executed by
 * `scripts/check-contrast.mjs` via `node --experimental-strip-types`.
 */

export type ThemeMode = "light" | "dark";

export interface SurfaceTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarBorder: string;
  canvas: string;
  canvasGrid: string;
}

export interface SurfacePreset {
  id: string;
  label: string;
  description: string;
  light: SurfaceTokens;
  dark: SurfaceTokens;
}

export interface AccentPreset {
  id: string;
  label: string;
  light: string;
  dark: string;
}

export interface ResolvedAccent {
  primary: string;
  primaryForeground: string;
  /** Contrast ratio between primary and primary-foreground. */
  contrast: number;
  /** Contrast ratio between primary and the surface background (UI boundary, ≥ 3:1). */
  surfaceContrast: number;
  /** True when the input colour had to be adjusted to satisfy WCAG AA. */
  adjusted: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const DEFAULT_ACCENT = "saffron";
export const DEFAULT_SURFACE = "slate";
export const DEFAULT_RADIUS = "8";
export const DEFAULT_DENSITY = "comfortable";
export const DEFAULT_FONT = "jakarta";

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "saffron", label: "Saffron", light: "#c2410c", dark: "#fb923c" },
  { id: "ocean", label: "Ocean", light: "#0369a1", dark: "#38bdf8" },
  { id: "indigo", label: "Indigo", light: "#4f46e5", dark: "#818cf8" },
  { id: "teal", label: "Teal", light: "#0f766e", dark: "#2dd4bf" },
  { id: "emerald", label: "Emerald", light: "#047857", dark: "#34d399" },
  { id: "rose", label: "Rose", light: "#be123c", dark: "#fb7185" },
  { id: "violet", label: "Violet", light: "#6d28d9", dark: "#a78bfa" },
  { id: "graphite", label: "Graphite", light: "#1e293b", dark: "#e2e8f0" },
];

function surface(
  base: Omit<SurfaceTokens, "cardForeground" | "popoverForeground" | "accentForeground" | "sidebarForeground">
): SurfaceTokens {
  return {
    ...base,
    cardForeground: base.foreground,
    popoverForeground: base.foreground,
    accentForeground: base.foreground,
    sidebarForeground: base.foreground,
  };
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    id: "slate",
    label: "Slate",
    description: "Cool corporate",
    light: surface({
      background: "#f8fafc", foreground: "#0f172a", card: "#ffffff", popover: "#ffffff",
      muted: "#f1f5f9", mutedForeground: "#475569", accent: "#eef2f7", border: "#e2e8f0",
      input: "#cbd5e1", sidebar: "#ffffff", sidebarAccent: "#f1f5f9", sidebarBorder: "#e2e8f0",
      canvas: "#f8fafc", canvasGrid: "#cbd5e1",
    }),
    dark: surface({
      background: "#0b0e14", foreground: "#e6e9ef", card: "#131821", popover: "#171d27",
      muted: "#1a202b", mutedForeground: "#9aa4b5", accent: "#1f2633", border: "#252c38",
      input: "#323a49", sidebar: "#0f131a", sidebarAccent: "#1a202b", sidebarBorder: "#1f2530",
      canvas: "#0b0e14", canvasGrid: "#252c38",
    }),
  },
  {
    id: "zinc",
    label: "Zinc",
    description: "Neutral modern",
    light: surface({
      background: "#fafafa", foreground: "#18181b", card: "#ffffff", popover: "#ffffff",
      muted: "#f4f4f5", mutedForeground: "#52525b", accent: "#f0f0f2", border: "#e4e4e7",
      input: "#d4d4d8", sidebar: "#ffffff", sidebarAccent: "#f4f4f5", sidebarBorder: "#e4e4e7",
      canvas: "#fafafa", canvasGrid: "#d4d4d8",
    }),
    dark: surface({
      background: "#0c0c0e", foreground: "#ececee", card: "#151518", popover: "#1a1a1e",
      muted: "#1c1c20", mutedForeground: "#a1a1aa", accent: "#232328", border: "#27272a",
      input: "#36363c", sidebar: "#111113", sidebarAccent: "#1c1c20", sidebarBorder: "#222225",
      canvas: "#0c0c0e", canvasGrid: "#27272a",
    }),
  },
  {
    id: "stone",
    label: "Stone",
    description: "Warm enterprise",
    light: surface({
      background: "#fafaf9", foreground: "#1c1917", card: "#ffffff", popover: "#ffffff",
      muted: "#f5f5f4", mutedForeground: "#57534e", accent: "#f1f0ee", border: "#e7e5e4",
      input: "#d6d3d1", sidebar: "#ffffff", sidebarAccent: "#f5f5f4", sidebarBorder: "#e7e5e4",
      canvas: "#fafaf9", canvasGrid: "#d6d3d1",
    }),
    dark: surface({
      background: "#0e0d0c", foreground: "#eeecea", card: "#171513", popover: "#1c1a18",
      muted: "#1f1d1a", mutedForeground: "#a8a29e", accent: "#262320", border: "#2c2926",
      input: "#3b3734", sidebar: "#12110f", sidebarAccent: "#1f1d1a", sidebarBorder: "#252220",
      canvas: "#0e0d0c", canvasGrid: "#2c2926",
    }),
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep obsidian",
    light: surface({
      background: "#f5f7fb", foreground: "#0b1324", card: "#ffffff", popover: "#ffffff",
      muted: "#eef2f8", mutedForeground: "#44516a", accent: "#e8eef7", border: "#dde4ef",
      input: "#c7d2e2", sidebar: "#ffffff", sidebarAccent: "#eef2f8", sidebarBorder: "#dde4ef",
      canvas: "#f5f7fb", canvasGrid: "#c7d2e2",
    }),
    dark: surface({
      background: "#070a12", foreground: "#e5e9f2", card: "#0e1424", popover: "#121a2d",
      muted: "#141c30", mutedForeground: "#97a3bb", accent: "#1a2440", border: "#1e2840",
      input: "#2c3858", sidebar: "#0a0f1c", sidebarAccent: "#141c30", sidebarBorder: "#18213a",
      canvas: "#070a12", canvasGrid: "#1e2840",
    }),
  },
];

export const RADIUS_OPTIONS = [
  { id: "0", label: "None", value: "0px" },
  { id: "4", label: "Subtle", value: "4px" },
  { id: "8", label: "Medium", value: "8px" },
  { id: "12", label: "Smooth", value: "12px" },
];

export const FONT_OPTIONS = [
  { id: "jakarta", label: "Plus Jakarta Sans", cssVar: "--font-jakarta" },
  { id: "inter", label: "Inter", cssVar: "--font-inter" },
  { id: "geist", label: "Geist Sans", cssVar: "--font-geist" },
  { id: "system", label: "System Default", cssVar: "" },
];

export const PROMPT_SIZE_OPTIONS = [
  { id: "14px", label: "Compact (14px)" },
  { id: "16px", label: "Default (16px)" },
  { id: "18px", label: "Large (18px)" },
];

// ---------------------------------------------------------------------------
// Colour math (sRGB ⇄ OKLCH, WCAG 2.1 contrast)
// ---------------------------------------------------------------------------

export function normalizeHex(input: string | undefined | null): string | null {
  if (!input || typeof input !== "string") return null;
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return `#${h.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.18;
}

function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, C, H < 0 ? H + 360 : H];
}

function oklchToHex(L: number, C: number, H: number): string {
  // Reduce chroma until the colour fits inside the sRGB gamut.
  let chroma = C;
  for (let i = 0; i < 40; i++) {
    const hr = (H * Math.PI) / 180;
    const A = chroma * Math.cos(hr);
    const B = chroma * Math.sin(hr);
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const inGamut = [r, g, b].every((v) => v >= -0.0005 && v <= 1.0005);
    if (inGamut || chroma < 0.001) return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b));
    chroma *= 0.92;
  }
  return "#808080";
}

// ---------------------------------------------------------------------------
// Accent derivation
// ---------------------------------------------------------------------------

const WHITE = "#ffffff";
export const AA_TEXT = 4.5;
export const AA_UI = 3;

/**
 * Derives a WCAG AA-compliant accent for a given mode.
 *
 * - Light mode: primary carries WHITE text → darken (OKLCH L↓) until ≥ 4.5:1.
 * - Dark mode: primary carries DARK text (surface background) → lighten (L↑) until ≥ 4.5:1.
 *
 * Because the foreground is the canvas colour (white-ish / near-black), meeting
 * 4.5:1 against it automatically satisfies the ≥ 3:1 boundary rule.
 */
export function resolveAccent(hexInput: string, mode: ThemeMode, surfaceTokens: SurfaceTokens): ResolvedAccent {
  const hex = normalizeHex(hexInput) || (mode === "light" ? "#c2410c" : "#fb923c");
  const fg = mode === "light" ? WHITE : surfaceTokens.background;
  const [initialL, C, H] = hexToOklch(hex);
  let L = initialL;
  let candidate = hex;
  let adjusted = false;

  for (let i = 0; i < 60 && contrastRatio(candidate, fg) < AA_TEXT; i++) {
    L = mode === "light" ? L - 0.015 : L + 0.015;
    L = Math.max(0.05, Math.min(0.98, L));
    candidate = oklchToHex(L, C, H);
    adjusted = true;
  }

  // Graphite / monochrome edge case: a near-white accent in light mode (or
  // near-black in dark mode) cannot carry its default foreground — flip it.
  let primaryForeground = fg;
  if (contrastRatio(candidate, fg) < AA_TEXT) {
    const alt = mode === "light" ? surfaceTokens.foreground : WHITE;
    if (contrastRatio(candidate, alt) > contrastRatio(candidate, fg)) primaryForeground = alt;
  }

  return {
    primary: candidate,
    primaryForeground,
    contrast: contrastRatio(candidate, primaryForeground),
    surfaceContrast: contrastRatio(candidate, surfaceTokens.background),
    adjusted,
  };
}

export function getSurfacePreset(id?: string | null): SurfacePreset {
  return SURFACE_PRESETS.find((s) => s.id === id) || SURFACE_PRESETS[0];
}

export function getAccentPreset(id?: string | null): AccentPreset | undefined {
  return ACCENT_PRESETS.find((a) => a.id === id);
}

/**
 * Maps a legacy single `background` hex (pre-v2 Appearance) to the nearest surface preset.
 */
export function surfaceFromLegacyBackground(hex?: string | null): string {
  const n = normalizeHex(hex || "");
  if (!n) return DEFAULT_SURFACE;
  let best = DEFAULT_SURFACE;
  let bestDist = Infinity;
  const [r, g, b] = hexToRgb(n);
  for (const s of SURFACE_PRESETS) {
    for (const t of [s.light.background, s.dark.background]) {
      const [r2, g2, b2] = hexToRgb(t);
      const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = s.id;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Appearance config → CSS variables
// ---------------------------------------------------------------------------

export interface AppearanceConfig {
  themeMode?: "light" | "dark" | "system";
  accentPreset?: string;
  accentCustom?: string;
  surfaceTone?: string;
  radius?: string;
  density?: "comfortable" | "compact";
  fontSans?: string;
  promptFontSize?: string;
}

export interface ResolvedTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
  accent: { light: ResolvedAccent; dark: ResolvedAccent };
}

/** Resolves the accent source colours for both modes (preset pair or a single custom hex). */
export function accentSources(cfg: AppearanceConfig): { light: string; dark: string } {
  const custom = normalizeHex(cfg.accentCustom);
  if (cfg.accentPreset === "custom" && custom) return { light: custom, dark: custom };
  const preset = getAccentPreset(cfg.accentPreset) || getAccentPreset(DEFAULT_ACCENT)!;
  return { light: preset.light, dark: preset.dark };
}

function surfaceToVars(t: SurfaceTokens): Record<string, string> {
  return {
    "--background": t.background,
    "--foreground": t.foreground,
    "--card": t.card,
    "--card-foreground": t.cardForeground,
    "--popover": t.popover,
    "--popover-foreground": t.popoverForeground,
    "--muted": t.muted,
    "--muted-foreground": t.mutedForeground,
    "--accent": t.accent,
    "--accent-foreground": t.accentForeground,
    "--secondary": t.muted,
    "--secondary-foreground": t.foreground,
    "--border": t.border,
    "--input": t.input,
    "--sidebar": t.sidebar,
    "--sidebar-foreground": t.sidebarForeground,
    "--sidebar-accent": t.sidebarAccent,
    "--sidebar-accent-foreground": t.foreground,
    "--sidebar-border": t.sidebarBorder,
    "--canvas": t.canvas,
    "--canvas-grid": t.canvasGrid,
  };
}

export function resolveTheme(cfg: AppearanceConfig): ResolvedTheme {
  const s = getSurfacePreset(cfg.surfaceTone);
  const src = accentSources(cfg);
  const accentLight = resolveAccent(src.light, "light", s.light);
  const accentDark = resolveAccent(src.dark, "dark", s.dark);
  const radius = (RADIUS_OPTIONS.find((r) => r.id === cfg.radius) || RADIUS_OPTIONS[2]).value;

  const accentVars = (a: ResolvedAccent) => ({
    "--primary": a.primary,
    "--primary-foreground": a.primaryForeground,
    "--ring": a.primary,
    "--sidebar-primary": a.primary,
    "--sidebar-primary-foreground": a.primaryForeground,
    "--sidebar-ring": a.primary,
  });

  return {
    light: { ...surfaceToVars(s.light), ...accentVars(accentLight), "--radius": radius },
    dark: { ...surfaceToVars(s.dark), ...accentVars(accentDark), "--radius": radius },
    accent: { light: accentLight, dark: accentDark },
  };
}

export function varsToCss(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
}
