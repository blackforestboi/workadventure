/**
 * Rollout switch for the three-endorsement requirement.
 *
 * Keep the invitation/admission implementation in place, but do not enforce
 * it at any access boundary until the rollout resumes.
 */
export const isTeapotInvitationAdmissionEnforced = (): boolean => false;
