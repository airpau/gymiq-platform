/** Commercial constants used across the marketing pages. Change here, not in pages. */
export const PRICE_PER_CLUB = 495
export const CONTACT = 'paul@gymiq.ai'
export const SYSTEMS = 'Glofox, ClubRight, Mindbody, PerfectGym, GymMaster and others'
export const WALKTHROUGH_HREF = `mailto:${CONTACT}?subject=gymIQ%20walkthrough&body=Hi%20Paul%2C%0A%0AClub%3A%20%0AMembers%3A%20%0AGym%20software%3A%20%0A%0ABest%20time%20for%20a%2020%20minute%20call%3A%20`

/** Meta pixel for www.gymiq.ai (business Gym IQ). Env var wins if set. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1398197198323725'
