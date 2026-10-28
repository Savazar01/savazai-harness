import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { generateSignedCaptchaToken } from "@/lib/auth/captcha";

export async function GET() {
  const ctx = await getSessionAccessContext();

  if (!ctx) {
    return Response.json(
      {
        authenticated: false,
        permissions: [],
        captchaChallengeToken: generateSignedCaptchaToken("public"),
      },
      { status: 200 }
    );
  }

  const permArray = Array.from(ctx.permissions);

  return Response.json(
    {
      authenticated: true,
      user: {
        id: ctx.userId,
        email: ctx.email,
        name: ctx.name,
        role: ctx.role,
        roleId: ctx.roleId,
        roleName: ctx.roleName,
        roleIds: ctx.roleIds,
        roleNames: ctx.roleNames,
        status: ctx.status,
        mustResetPassword: ctx.mustResetPassword,
      },
      permissions: permArray,
      defaultRoute: resolveDefaultLandingRoute(ctx.permissions),
    },
    { status: 200 }
  );
}
