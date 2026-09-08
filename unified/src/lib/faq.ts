import { SYSTEMS, FOUNDING_PRICE, FOUNDING_SLOTS, PRICE_PER_CLUB } from './site'

/** The homepage FAQ. Also emitted as FAQPage structured data so search engines and AI assistants can quote it. */
export const FAQ: Array<{ q: string; a: string }> = [
  { q: 'What is gymIQ?', a: 'gymIQ is AI gym management software for gym owners. It sits on top of the gym software you already use, reads the membership and sales data every day, and tells you and your staff what to do: who to call, which payments to retry, who is drifting, what is mispriced and what Friday will pay. Built by a UK gym owner and running live at an énergie Fitness club in Hertfordshire.' },
  { q: 'Does it replace my gym software?', a: 'No. It reads your system and leaves it alone. Your team keeps working in it exactly as they do now; gymIQ tells them which member to open first.' },
  { q: 'Which systems does it work with?', a: `${SYSTEMS}. If your software can produce a memberships report and a sales report, gymIQ can read it. The Hertfordshire club runs on Glofox, so that connection is the most worn in.` },
  { q: 'Who is it for?', a: 'Independent gym owners, franchise club operators, boutique studios, health clubs and personal training businesses with a membership book, in the UK first. If you have between 200 and 5,000 members and nobody whose job is to read the numbers every day, it is built for you.' },
  { q: 'Does it contact my members?', a: 'Not by default. The board tells your staff who to call and why. Automated retries of failed payments run inside your system’s own rules. Any messaging to members is switched on per club, by you, in writing.' },
  { q: 'What does it cost?', a: `£${FOUNDING_PRICE} a month per club for the first ${FOUNDING_SLOTS} founding clubs, fixed for twelve months (list price £${PRICE_PER_CLUB}). No setup fee, cancel with a month’s notice, monthly business review included. If a month’s review cannot show at least the fee in found money, that month is free.` },
  { q: 'What does it need from me?', a: 'A login for the club, ideally a read only staff account created for gymIQ. And an hour on a call so the brief is written the way you think.' },
  { q: 'What happens on the monthly review?', a: 'Forty five minutes with us, on the phone or a call. What the system found, what your team acted on, what it was worth, and the one or two decisions for next month: a price, a plan, a supplier, a hire. You leave with a number for the month and a plan. As the product matures the review will become optional, but early clubs keep it at no extra cost.' },
  { q: 'Will it work if my front desk is part time?', a: 'That is who it is built for. The board is capped at a list a small desk can clear in an hour, and the evening report tells you who cleared what. If nothing gets ticked, you will know by 22:00, not at month end.' },
  { q: 'Is the retention result real?', a: 'July at the Hertfordshire club was the lowest attrition month on record. August was higher because the club now clears members who have stopped paying from the roster every month, on purpose, and those show up as leavers. Both months are on the case study page with the workings.' },
  { q: 'Who is behind it?', a: 'Paul Airey, who owns and runs an énergie Fitness club in Hertfordshire with 1,600 members. gymIQ was built to run that club first. You are talking to the person who uses it every day.' },
]

export const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}
