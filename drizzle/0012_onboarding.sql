-- Track when a user has finished (or skipped) the onboarding tour.
-- NULL = onboarding not yet completed. Set by completeOnboarding() server action
-- when the user clicks "Done" or "Skip" on the tour.
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;
