import { onboardingResponseSchema, type OnboardingRequest } from "@restoos/shared";
import { apiFetch } from "@/lib/api";

/** Creates the organisation + first outlet for the signed-in owner (browser, same-origin cookie). */
export function submitOnboarding(body: OnboardingRequest) {
  return apiFetch("/api/onboarding", onboardingResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
}
