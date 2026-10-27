# SavazAI Design System Specification (`DESIGN.md`)

> **Version:** 2.0.0 (Enterprise Shadcn & UI-UX Pro Max Standard)  
> **Target Audience:** B2B Enterprise SaaS & SMB Autonomous Multi-Agent Orchestration  
> **Style Profile:** Trust & Authority (WCAG 2.1 AAA/AA Compliance)  
> **Typography Pairing:** Plus Jakarta Sans (Headings & UI) + JetBrains Mono (Code, Tokens & IDs)

---

## 1. Architectural Philosophy & Design Principles

SavazAI is a mission-critical enterprise orchestration platform for multi-agent workflows, JSON-RPC 2.0 MCP tool routing, and automated business operations. The user interface reflects executive clarity, rigorous precision, and ergonomic calm:

1. **Information Density with Breathing Room**: High-density tables and technical inspection panels must remain instantly readable through clean 8pt spatial rhythm and strict typographical hierarchy.
2. **Zero Inverted / Hybrid States**: The entire interface is driven by a single theme contract. Never allow partial flips where a navigation rail or modal turns white while viewports or tables remain pitch-black.
3. **No Unpredictable Color Injections**: Banned are arbitrary "AI purple/pink gradients", unvetted hex codes (`bg-[#...]`), and ad-hoc dark classes (`bg-slate-900`). Every pixel consumes semantic design tokens.
4. **Mathematical Contrast Guarantees**: Any user-configured brand accent dynamically derives compliant variants for **both Light Mode and Dark Mode simultaneously**, guaranteeing minimum 4.5:1 text contrast and 3:1 interactive boundary visibility.

---

## 2. Dynamic Runtime Theme Model: Mode × Accent × Surface

The theme engine computes the active CSS variable contract at runtime:

$$\text{Active Theme} = \text{Mode (Light | Dark | System)} \times \text{Brand Accent (Preset | Custom Hex)} \times \text{Surface Tone (Slate | Zinc | Stone | Midnight)}$$

### A. Semantic Token Taxonomy

| Token Variable | Tailwind Utility | Light Value (Default Slate) | Dark Value (Default Slate) | Intended Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--background` | `bg-background` | `#f8fafc` (Slate 50) | `#0b0e14` (Deep Slate) | Root application canvas, viewport background |
| `--foreground` | `text-foreground` | `#0f172a` (Slate 900) | `#e6e9ef` (Slate 50) | Primary headers, active labels, body text |
| `--card` | `bg-card` | `#ffffff` (Pure White) | `#131821` (Card Slate) | Data cards, tables, modal bodies, prompt dock |
| `--card-foreground` | `text-card-foreground` | `#0f172a` (Slate 900) | `#e6e9ef` (Slate 50) | Content inside cards and table cells |
| `--popover` | `bg-popover` | `#ffffff` (Pure White) | `#171d27` (Elevated) | Dropdowns, menus, tooltips, flyout palettes |
| `--popover-foreground` | `text-popover-foreground` | `#0f172a` (Slate 900) | `#e6e9ef` (Slate 50) | Text inside popover menus and tooltips |
| `--primary` | `bg-primary`, `text-primary` | `#c2410c` (Saffron Light) | `#fb923c` (Saffron Dark) | Active navigation pill, primary action buttons |
| `--primary-foreground` | `text-primary-foreground` | `#ffffff` (Pure White) | `#0b0e14` (Obsidian Dark) | Text rendered on top of `--primary` surfaces |
| `--secondary` | `bg-secondary` | `#f1f5f9` (Slate 100) | `#1a202b` (Slate 800) | Secondary action buttons, subtle tags |
| `--secondary-foreground` | `text-secondary-foreground` | `#0f172a` (Slate 900) | `#e6e9ef` (Slate 50) | Text rendered on `--secondary` surfaces |
| `--muted` | `bg-muted` | `#f1f5f9` (Slate 100) | `#1a202b` (Slate 800) | Table headers, code blocks, inactive tabs |
| `--muted-foreground` | `text-muted-foreground` | `#475569` (Slate 600) | `#9aa4b5` (Slate 400) | Subtitles, helper text, form placeholders |
| `--border` | `border-border` | `#e2e8f0` (Slate 200) | `#252c38` (Slate 700) | Dividers, card outlines, table borders |
| `--input` | `border-input`, `bg-input` | `#cbd5e1` (Slate 300) | `#323a49` (Slate 700) | Input field outlines and form control borders |
| `--ring` | `ring-ring` | `--primary` | `--primary` | Focus rings for accessible keyboard navigation |
| `--sidebar` | `bg-sidebar` | `#ffffff` (Pure White) | `#0f131a` (Rail Slate) | Primary navigation sidebar, System Trace rail |
| `--sidebar-foreground` | `text-sidebar-foreground` | `#0f172a` (Slate 900) | `#e6e9ef` (Slate 50) | Text and icons inside navigation sidebars |
| `--canvas` | `bg-canvas` | `#f8fafc` | `#0b0e14` | ReactFlow Capability Studio graph canvas |
| `--canvas-grid` | - | `#cbd5e1` (Slate 300) | `#252c38` (Slate 700) | ReactFlow canvas radial dots / grid lines |
| `--radius` | `rounded-lg` | `0.5rem` (8px default) | `0.5rem` (8px default) | Corner rounding scale (0, 4px, 8px, 12px) |

---

## 3. Surface Elevation Hierarchy

Components adhere to strict visual Z-layering to maintain structural depth without visual noise:

```
Level 4: Modals & Dialogs (z-50)  ──>  bg-card / border-border / shadow-2xl + backdrop-blur-md
Level 3: Popovers & Menus (z-40)  ──>  bg-popover / border-border / shadow-xl
Level 2: Cards & Surfaces (z-10)  ──>  bg-card / border-border / shadow-xs
Level 1: Rails & Sidebars (z-20)  ──>  bg-sidebar / border-border
Level 0: Root Canvas (z-0)        ──>  bg-background
```

1. **L0 Canvas**: Page root and graph viewport (`bg-background`).
2. **L1 Rails**: Sticky left navigation sidebar and docked right System Trace panel (`bg-sidebar border-r border-border`).
3. **L2 Cards**: Tables, chat response bubbles, floating prompt docks, and studio nodes (`bg-card border border-border shadow-xs`).
4. **L3 Popovers**: Model selection dropdowns, filter menus, and action context menus (`bg-popover border border-border shadow-xl`).
5. **L4 Modals**: Account provisioning dialogs, MCP injection modals, and HITL interrupt review cards (`bg-card border border-border shadow-2xl`).

---

## 4. Typography Scale & Spatial Layout Standard

### A. Font Pairing
- **UI & Headings**: `Plus Jakarta Sans` (`--font-jakarta`)  
  Weight scale: `300` (Light), `400` (Regular), `500` (Medium), `600` (SemiBold), `700` (Bold), `800` (ExtraBold).
- **Code & Identifiers**: `JetBrains Mono` (`--font-mono`)  
  Weight scale: `400` (Regular), `500` (Medium), `600` (SemiBold). Applied to UUIDs, JSON payloads, and system prompt textareas.

### B. Type Scale Hierarchy
| Level | Font Size | Line Height | Tracking | Weight | Semantic Class |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Header** | `24px` (`1.5rem`) | `32px` | `-0.025em` | Bold (`700`) | `text-2xl font-bold tracking-tight` |
| **Section Header** | `18px` (`1.125rem`) | `24px` | `-0.015em` | Bold (`700`) | `text-lg font-bold tracking-tight` |
| **Card Header** | `14px` (`0.875rem`) | `20px` | `0` | SemiBold (`600`) | `text-sm font-semibold` |
| **Body Primary** | `14px` (`0.875rem`) | `22px` | `0` | Regular (`400`) | `text-sm leading-relaxed` |
| **Muted Caption** | `12px` (`0.75rem`) | `16px` | `0` | Regular (`400`) | `text-xs text-muted-foreground` |
| **Micro Badge** | `10px` (`0.625rem`) | `12px` | `+0.05em` | Bold (`700`) | `text-[10px] font-bold uppercase tracking-wider` |

### C. 8pt Spatial Grid Standard
All margins, paddings, and gap distances follow multiples of 4px / 8px:
- `p-1` (`4px`), `p-2` (`8px`), `p-3` (`12px`), `p-4` (`16px`), `p-6` (`24px`), `p-8` (`32px`).
- Gap rules: form fields use `gap-4`, horizontal button bars use `gap-2` or `gap-3`, layout splits use `gap-6`.

---

## 5. Standard Component Recipes (Shadcn Integration)

### A. Primary & Secondary Buttons
```tsx
// Primary Action Button
<Button variant="default" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer">
  Execute Plan
</Button>

// Secondary / Subtle Button
<Button variant="outline" className="border-border bg-card text-foreground hover:bg-muted cursor-pointer shadow-xs">
  Cancel
</Button>
```

### B. Form Inputs & Textareas
```tsx
<Input 
  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/50" 
/>
```

### C. Data Tables (Business Policy & User Management)
```tsx
<Table className="border border-border bg-card rounded-2xl overflow-hidden">
  <TableHeader className="bg-muted/50 border-b border-border">
    <TableRow>
      <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Skill Name</TableHead>
      <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Category</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody className="divide-y divide-border">
    <TableRow className="hover:bg-muted/40 transition-colors">
      <TableCell className="font-medium text-foreground">wedplan_vendor_sync</TableCell>
      <TableCell><Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">MCP Binded</Badge></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## 6. Theme Transition Contract & Strict Invariants

1. **Single Theme State Writer**: Theme switching is managed exclusively by `next-themes` via `setTheme("light" | "dark" | "system")`. Never write manual `classList.add("dark")` or `localStorage.setItem("theme")` in component code.
2. **Zero Hardcoded Colors**: The following patterns are strictly prohibited in application UI components:
   - `bg-[#...]`, `text-[#...]`, `border-[#...]`
   - `bg-slate-900`, `bg-slate-950`, `bg-black`, `text-white`, `border-slate-800`
   - Manual `dark:` color utility overrides (e.g. `text-black dark:text-white`)
3. **Email Template Exemption**: Server-side transactional emails (`src/lib/email/`, `api/admin/system/test-email/`) require inline styling for client compatibility and are explicitly exempt from theme token linting.
4. **Mandatory Quality Verification**: Every new UI component must pass automated TypeScript typechecks, Next.js production compilation, and dual-theme contrast validation before deployment.
