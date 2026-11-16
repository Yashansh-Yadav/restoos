import { phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client (M1-T1). Talks to apps/api through the same-origin /api proxy,
// holds no secrets (CLAUDE.md rule 2).
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [phoneNumberClient()],
});
