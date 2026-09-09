/** Commercial constants used across the marketing pages. Change here, not in pages. */
export const PRICE_PER_CLUB = 295
/** Kept as an alias so older pages keep compiling; the site shows one price. */
export const FOUNDING_PRICE = PRICE_PER_CLUB
export const FOUNDING_SLOTS = 0
export const CONTACT = 'paul@gymiq.ai'
export const SYSTEMS = 'Glofox, ClubRight, Mindbody, PerfectGym, GymMaster and others'
/** Every 'book a walkthrough' button on the site. A form that reaches Paul on Telegram and email. */
export const WALKTHROUGH_HREF = '/book'
/** The 'start' path: same form with intent=start; a Stripe checkout link is offered alongside when set. */
export const START_HREF = '/book?intent=start'
/** Stripe payment link: gymIQ, one club, £295 a month (price_1UDMbVFiiUHNGGOu86Mkzb9s). Env var wins if set. */
export const STRIPE_CHECKOUT_URL: string | null = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL || 'https://buy.stripe.com/5kQ14nflH6uU54rfjA4ow00'
/** Paul's Calendly for the 30 minute walkthrough. Embedded on /book and linked directly from every walkthrough button. */
export const CALENDLY_URL = 'https://calendly.com/paul-gymiq/30min'

/** Meta pixel for www.gymiq.ai (business Gym IQ). Env var wins if set. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1398197198323725'
