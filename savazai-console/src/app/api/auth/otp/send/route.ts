import { NextRequest } from "next/server";
import { verifyCaptchaToken } from "@/lib/auth/captcha";
import { generateAndSendEmailOtp } from "@/lib/auth/otp";
import { getClientIp } from "@/lib/auth/ip";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, purpose = "onboarding", captchaToken } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const clientIp = getClientIp(req);
    const captchaCheck = await verifyCaptchaToken(captchaToken, clientIp);
    if (!captchaCheck.valid) {
      return Response.json(
        { error: captchaCheck.reason || "CAPTCHA verification failed." },
        { status: 400 }
      );
    }

    const result = await generateAndSendEmailOtp(email, purpose);

    return Response.json(
      {
        success: true,
        message: `A 6-digit verification code has been sent to ${email.trim().toLowerCase()}. Valid for 10 minutes.`,
        expiresInMinutes: result.expiresInMinutes,
        ...(result.devOtpPreview ? { devOtpPreview: result.devOtpPreview } : {}),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send OTP.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
