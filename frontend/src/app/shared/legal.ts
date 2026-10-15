// src/app/shared/legal.ts
//
// The handful of facts the Terms, Refund and Privacy pages state about who runs Bracketway.
// Kept in one place so a change of operator (say, forming an LLC) or support address is one
// edit, not a hunt through three pages of prose. Bump EFFECTIVE_DATE whenever the policies'
// substance changes.
export const LEGAL = {
  /** The legal seller. A sole proprietor trading under the Bracketway name. */
  operator: 'Matthew Conway',
  brand: 'Bracketway',
  supportEmail: 'support@bracketway.com',
  governingState: 'Illinois',
  effectiveDate: 'October 15, 2026',
  /** Refund windows, in days. Mirrored in the Refund policy and the Pricing FAQ. */
  refundDays: {
    tournamentUpgrade: 14,
    monthly: 7,
    annual: 30,
  },
} as const;
