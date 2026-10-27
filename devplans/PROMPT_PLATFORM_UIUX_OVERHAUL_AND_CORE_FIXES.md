# TASK PROMPT: Platform UI/UX Overhaul, System Trace & Memory Resolution, Theme Engine, Markdown WYSIWYG & Documentation Sync

## 1. Overview
The platform requires a comprehensive UI/UX overhaul, critical bug fixes in the Agent Workspace (collapsible system trace panel, conversation thread memory, MCP dropdown persistence), a universal Markdown WYSIWYG editor, a global Light/Dark theme engine, structured tabular tool/knowledge selectors, business-side agent skill assignment, and documentation/landing page synchronization.

## 2. Issues & Visual Observations
- **Workstream 1 (Trace Panel & Spam)**:
  - System trace floods the trace panel with repetitive `LLM Chunk (64 chars received)` entries during streaming.
  - Trace panel lacks a clean collapse/expand toggle with persistent dock tab.
- **Workstream 2 (Thread 404 & Memory)**:
  - Left sidebar conversation clicks trigger `Failed to load thread: 404`.
  - Chat thread memory across turns needs reliable persistence and retrieval from PostgreSQL.
- **Workstream 3 (Direct MCP Popover)**:
  - Direct MCP popover does not auto-close on click-outside, lacks a "Done" button, and multi-server badges need synchronization.
- **Workstream 4 (Global Themes & Appearance)**:
  - Need a first-class Light/Dark theme toggle (top header and user menu) and appearance customizer in Command Center (theme mode, font family, font size scale, accent color, background contrast).
- **Workstream 5 (Universal Markdown WYSIWYG Editor)**:
  - System directive prompt editor and long-text fields use raw textareas. Need rich dual-mode WYSIWYG editor with formatting toolbar and preview.
- **Workstream 6 (Tabular Tool & Knowledge Selectors)**:
  - Agent Inspector displays unstructured card stacks for Native and MCP tools. Must be overhauled into searchable, filterable Data Table components with bulk actions and active badges.
- **Workstream 7 (Business Center Agent Assignment Hub)**:
  - The `ACTIVE IN AGENTS` column in `/business` should allow clicking to open an "Assign to Agents" modal, updating agent node configurations directly in the database.
- **Workstream 8 (Documentation Hub Overhaul)**:
  - Update all 6 documentation modules to reflect current platform architecture.
- **Workstream 9 (Landing Page Synchronization)**:
  - Update `savazai-console/src/app/page.tsx` with Agentflows, Agent Teams, Universal MCP, and Zero-Trust RBAC.
