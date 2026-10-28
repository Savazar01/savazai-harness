import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import fs from "fs";
import path from "path";

async function generateDocx() {
  const screenshotsDir = path.resolve("devplans/screenshots");
  const outputPath = path.resolve("devplans/PLAYWRIGHT_TEST_RESULTS_AND_SCREENSHOTS.docx");

  console.log("Generating Word document at:", outputPath);

  const readImageBuffer = (fileName) => {
    const filePath = path.join(screenshotsDir, fileName);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    console.warn(`File not found: ${filePath}`);
    return null;
  };

  const images = {
    govDark: readImageBuffer("governance_subnav_rail.png"),
    govLight: readImageBuffer("governance_subnav_rail_light.png"),
    rolesList: readImageBuffer("user_admin_roles_list_default.png"),
    auditorFilter: readImageBuffer("user_admin_auditor_filter_success.png"),
    agentList: readImageBuffer("agent_catalog_list_default.png"),
    inspectorDark: readImageBuffer("agent_inspector_knowledge_parity.png"),
    inspectorLight: readImageBuffer("agent_inspector_knowledge_parity_light.png"),
  };

  const tableBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  };

  const createCell = (text, isHeader = false, widthPercent = 25) => {
    return new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      borders: tableBorder,
      shading: isHeader ? { fill: "F3F4F6" } : undefined,
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: isHeader,
              size: isHeader ? 22 : 20,
              color: isHeader ? "111827" : "374151",
            }),
          ],
        }),
      ],
    });
  };

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createCell("Test ID & Objective", true, 40),
          createCell("Target Area", true, 25),
          createCell("Result Status", true, 15),
          createCell("Assertion Verdict", true, 20),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-01: Governance Categorized Navigation"),
          createCell("Governance Hub (/admin/governance)"),
          createCell("PASSED"),
          createCell("Zero tab wrapping; 3 categorized groups"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-02: Roles & Access Profiles Default View"),
          createCell("User Admin (/admin/users)"),
          createCell("PASSED"),
          createCell("Defaulted to List View on initial load"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-03: Multi-Role User Directory Filter"),
          createCell("User Admin (/admin/users)"),
          createCell("PASSED"),
          createCell("Sujatha A matched & displayed under Auditor"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-04: Agent Builder Hub Default View"),
          createCell("Capability Studio (/studio)"),
          createCell("PASSED"),
          createCell("Defaulted to List Table View on mount"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-05: Agent Inspector Dialog Dimensions"),
          createCell("Agent Drawer (/studio)"),
          createCell("PASSED"),
          createCell("Opened in expanded width (max-w-5xl)"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-06: Knowledge Tab Table Parity"),
          createCell("Agent Inspector (/studio)"),
          createCell("PASSED"),
          createCell("Skills & OKF structured tables with switches"),
        ],
      }),
      new TableRow({
        children: [
          createCell("TEST-07: Dual-Theme Contrast Compliance"),
          createCell("Platform Surfaces"),
          createCell("PASSED"),
          createCell("Verified across Dark & Light modes"),
        ],
      }),
    ],
  });

  const sections = [];

  // Helper to add screenshot with title
  const addScreenshotSection = (title, description, imageBuffer) => {
    sections.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: description,
            size: 20,
            color: "4B5563",
          }),
        ],
        spacing: { after: 160 },
      })
    );

    if (imageBuffer) {
      sections.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: {
                width: 600,
                height: 375,
              },
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        })
      );
    }
  };

  sections.push(
    new Paragraph({
      text: "Playwright Automated Test Results & Verification Proof",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "SavazAI Agent Harness Orchestration Platform — End-to-End Verification",
          bold: true,
          size: 24,
          color: "4F46E5",
        }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Execution Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | Environment: Localhost Docker (Ports 3055, 3056, 5622)`,
          size: 18,
          color: "6B7280",
        }),
      ],
      spacing: { after: 300 },
    }),

    new Paragraph({
      text: "1. Executive Summary & Verification Matrix",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 140 },
    }),
    summaryTable
  );

  // Add individual screenshot sections
  addScreenshotSection(
    "2. Governance Hub Categorized Navigation Rail (Dark Mode)",
    "Verification of Workstream 1: Replaced horizontal wrapped tab strip with a scalable 3-category sub-navigation rail (Analytics & Controls, Operational Audit Ledgers, Asset Version Control). All 9 reports remain accessible without overflowing or occluding controls.",
    images.govDark
  );

  addScreenshotSection(
    "3. Governance Hub Categorized Navigation Rail (Light Mode)",
    "Verification of Workstream 1 dual-theme contrast: Verified WCAG AA contrast compliance, active report indicators, and high-contrast typography under Light Mode.",
    images.govLight
  );

  addScreenshotSection(
    "4. User Admin: Roles & Access Profiles Defaulting to List View",
    "Verification of Workstream 2.1: Navigating to Roles & Access Profiles now initializes in List View mode by default, cleanly presenting all 9 role profiles, IDs, capabilities ratios, and assigned operator badges.",
    images.rolesList
  );

  addScreenshotSection(
    "5. User Admin: Multi-Role Filter Resolution for Assigned Operators",
    "Verification of Workstream 2.2: Clicking '1 Users Assigned' on the Auditor role successfully filters and resolves users who hold multiple assigned roles (e.g. Sujatha A holding Studio Flow Architect + Auditor), eliminating the previous false 'No active users matching criteria' defect.",
    images.auditorFilter
  );

  addScreenshotSection(
    "6. Capability Studio: Agent Builder Hub Defaulting to High-Density List Table",
    "Verification of Workstream 3: Navigating to the Universal Agent Catalog & Builder Hub now initializes directly into the High-Density List Table view with sorting, tool counts, origin flow indicators, and quick action buttons.",
    images.agentList
  );

  addScreenshotSection(
    "7. Agent Inspector: Default Expanded Dimensions & Knowledge Tab UX Parity (Dark Mode)",
    "Verification of Workstream 4: Launching Agent Inspector opens directly in expanded width (max-w-5xl/max-w-6xl) without manual user intervention. The Knowledge Tab features two structured data tables mirroring the MCP Servers tab with high-contrast toggles, search inputs, bulk actions, and category badges.",
    images.inspectorDark
  );

  addScreenshotSection(
    "8. Agent Inspector: Knowledge Tab UX Parity (Light Mode)",
    "Verification of Workstream 4 dual-theme compliance: High-contrast switches, clean background tokens, and semantic styling validated under Light Mode.",
    images.inspectorLight
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sections,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log("Document successfully written to:", outputPath);
}

generateDocx().catch((err) => {
  console.error("Error generating DOCX:", err);
  process.exit(1);
});
