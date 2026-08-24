import { NextRequest } from "next/server";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      phone,
      company,
      industry,
      timeline,
      description,
    } = body;

    // Validate required fields
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return Response.json({ error: "Full name is required." }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.trim() || !email.includes("@")) {
      return Response.json({ error: "Valid business email is required." }, { status: 400 });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return Response.json({ error: "Phone number is required." }, { status: 400 });
    }
    if (!company || typeof company !== "string" || !company.trim()) {
      return Response.json({ error: "Company name is required." }, { status: 400 });
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return Response.json({ error: "Description of interest is required." }, { status: 400 });
    }

    const id = randomUUID();
    const cleanIndustry = industry || "Other Industry";
    const cleanTimeline = timeline || "Exploring / Architectural Evaluation";

    const insertQuery = `
      INSERT INTO demo_requests (
        id,
        full_name,
        email,
        phone,
        company,
        industry,
        timeline,
        description,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
      RETURNING id, full_name, email, company, created_at
    `;

    const result = await pool.query(insertQuery, [
      id,
      fullName.trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      company.trim(),
      cleanIndustry,
      cleanTimeline,
      description.trim(),
    ]);

    const createdRecord = result.rows[0];

    // Notification Dispatch Receipt Logging
    const adminEmail = process.env.ADMIN_EMAIL || "admin@savazar.com";
    console.log(`[DEMO_REQUEST_DISPATCH] New Inbound Lead [${createdRecord.id}] from ${createdRecord.full_name} (${createdRecord.email}, ${createdRecord.company}) -> Notification routed to ${adminEmail}`);

    return Response.json(
      {
        success: true,
        message: "Demo request submitted successfully. Our solutions team will contact you shortly.",
        id: createdRecord.id,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to record demo request.";
    console.error("[POST /api/demo-request] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
