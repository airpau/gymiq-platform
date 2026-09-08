/** Commercial constants used across the marketing pages. Change here, not in pages. */
export const PRICE_PER_CLUB = 495
export const CONTACT = 'paul@gymiq.ai'
export const SYSTEMS = 'Glofox, ClubRight, Mindbody, PerfectGym, GymMaster and others'
/** Every 'book a walkthrough' button on the site. A form that reaches Paul on Telegram and email. */
export const WALKTHROUGH_HREF = '/book'
/** The 'start' path: same form with intent=start; a Stripe checkout link is offered alongside when set. */
export const START_HREF = '/book?intent=start'
/** Stripe payment link for £495 a month per club. Set once the Stripe product exists. */
export const STRIPE_CHECKOUT_URL: string | null = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL || null

/** Meta pixel for www.gymiq.ai (business Gym IQ). Env var wins if set. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1398197198323725'
