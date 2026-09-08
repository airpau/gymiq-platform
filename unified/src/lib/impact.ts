/**
 * What gymIQ has made and saved at an énergie Fitness club in Hertfordshire.
 *
 * Every line carries its basis. "measured" means the figure is read from the
 * club's own records (gymIQ tables, Glofox, bank statements, quotes). "estimated"
 * means a measured input multiplied by a stated, conservative assumption.
 * Conservative and central are both shown; the site leads with conservative.
 *
 * Sources, all in the gymIQ database for the club:
 *   club_monthly_metrics (attrition, overdue, MRR, ARPU by month)
 *   club_financials (July settled 48,633 on 50,427 submitted; August close)
 *   decision_log (price rises, student age leak, renewals list, card vs DD,
 *                 price trial revert, Primal vs Precor, HP vs lease, lease review)
 */

export type Basis = 'measured' | 'estimated'
export type Kind = 'recurring' | 'one-off'

export interface ImpactLine {
  key: string
  area: 'Collection' | 'Pricing' | 'Retention' | 'Sales' | 'Capital and property' | 'Operations'
  title: string
  what: string
  how: string
  basis: Basis
  kind: Kind
  /** Annual value, conservative case, in pounds. */
  conservative: number
  /** Annual value, central case, in pounds. */
  central: number
  /** Whether this line is counted in the totals (some overlap with others). */
  counted: boolean
}

export const CLUB = {
  name: 'an énergie Fitness club in Hertfordshire',
  roster: 1617,
  activePaying: 1472,
  billedPerMonth: 50427,
  arpu: 30.74,
  /** What a saved member is worth: months paid in year one at the Hertfordshire club. */
  monthsPaidYearOne: 7.55,
  since: 'July 2026',
}

export const IMPACT: ImpactLine[] = [
  {
    key: 'collection',
    area: 'Collection',
    title: 'Failed payments cut from about 10% to 3.6%',
    what: 'The club was carrying a failed book of roughly one pound in ten when the retry and chase routine started. July, once its Direct Debits settled, failed 3.6% of £50,427 billed. August settled the same way.',
    how: 'Conservative counts 4 points of the 6.4 point improvement on £50,000 billed a month. Central counts 6 points.',
    basis: 'measured',
    kind: 'recurring',
    conservative: 24000,
    central: 36000,
    counted: true,
  },
  {
    key: 'pricing',
    area: 'Pricing',
    title: 'Price corrections found in the membership file',
    what: 'Student, corporate, Classic and WOW rates corrected for October: £1,301 a month billed, £1,103 banked after the franchise fee. Found by reading what members actually paid against what a joiner pays today.',
    how: 'Banked figure times twelve. Measured before the rise takes effect, so it is a plan the file supports, not yet cash.',
    basis: 'measured',
    kind: 'recurring',
    conservative: 13239,
    central: 13239,
    counted: true,
  },
  {
    key: 'students',
    area: 'Pricing',
    title: '47 students past the age for their rate',
    what: 'Members aged 19 and over still paying the under 19 price, one of them 37 years past it. £970 a month short of the rate they should be on, and it refills at about three members a month.',
    how: 'Half counted, because part of it is inside the October price correction above. Central counts it in full.',
    basis: 'measured',
    kind: 'recurring',
    conservative: 5800,
    central: 11600,
    counted: true,
  },
  {
    key: 'renewals',
    area: 'Retention',
    title: '50 memberships ending with nobody asking them to stay',
    what: 'Terms quietly running out, £1,289 a month, handed to the desk as a list sorted by expiry with the ones still training marked priority.',
    how: 'Four in ten renew when asked. Conservative counts three in ten.',
    basis: 'estimated',
    kind: 'recurring',
    conservative: 4600,
    central: 6200,
    counted: true,
  },
  {
    key: 'retention',
    area: 'Retention',
    title: 'July attrition 3.65% against a 5.7% average',
    what: 'The first full month with the daily retention calls was the lowest month the club has recorded. Two points on a 1,645 roster is 34 members a month who did not leave.',
    how: 'A saved member pays 7.55 months at £30.74. Conservative counts one point of the two and half the year. Central counts both points for the year.',
    basis: 'estimated',
    kind: 'recurring',
    conservative: 24000,
    central: 47000,
    counted: true,
  },
  {
    key: 'trial',
    area: 'Sales',
    title: 'A failing price test caught in five days',
    what: 'New joiner prices went up on 8 August. Weekday sales fell to 1 against 8.4 expected, odds of 1 in 450 on the club’s own seasonality model. Reverted on 13 August at a cost of about six joins.',
    how: 'Without the model the rule was to hold until 30 September. Conservative counts 20 lost joins over that period at £242 year one value, central counts 40.',
    basis: 'estimated',
    kind: 'one-off',
    conservative: 4800,
    central: 9700,
    counted: true,
  },
  {
    key: 'capex',
    area: 'Capital and property',
    title: 'Refit supplier switched on a like for like comparison',
    what: 'A 32 line equipment design priced at Precor list £334,965 ex VAT against Primal Strength at £152,074 for identical specification. The approved programme fell from £295,000 to £253,432 and the monthly finance from £6,883 to £5,913.',
    how: 'Conservative counts the programme saving. Central counts the identical specification gap after a 25% Precor discount, £99,149. Finance saving of £970 a month sits on top and is not counted.',
    basis: 'measured',
    kind: 'one-off',
    conservative: 41568,
    central: 99149,
    counted: true,
  },
  {
    key: 'finance',
    area: 'Capital and property',
    title: 'Hire purchase tested against the lease before signing',
    what: 'The refit was to be leased on the belief that leasing is the tax efficient route. Modelled properly against the club’s marginal rate, hire purchase saves about £8,499 in year one and leaves the club owning the kit.',
    how: 'Year one difference as modelled, flagged for the accountant, not tax advice.',
    basis: 'estimated',
    kind: 'one-off',
    conservative: 0,
    central: 8499,
    counted: true,
  },
  {
    key: 'analyst',
    area: 'Operations',
    title: 'The analyst the club would otherwise need',
    what: 'A written brief four times a day, a monthly close, a payout forecast, a member by member history, price and age audits, a capex appraisal and a lease review. That is a business analyst’s job.',
    how: 'A UK business analyst costs £45,000 plus on costs. Conservative counts half a role. Central counts two thirds.',
    basis: 'estimated',
    kind: 'recurring',
    conservative: 27000,
    central: 36000,
    counted: true,
  },
  {
    key: 'lease',
    area: 'Capital and property',
    title: 'Lease and planning read before money moved',
    what: 'Confirmed the lease is protected under the 1954 Act, that the live rent review is upward only and cannot be affected by the refit, that the changing rooms need landlord consent, and that a roof planning consent worth £622,080 in a purchase model had lapsed nine months earlier.',
    how: 'Risk found, not cash counted. The rent review alone is a £23,000 a year question.',
    basis: 'measured',
    kind: 'one-off',
    conservative: 0,
    central: 0,
    counted: false,
  },
  {
    key: 'cash',
    area: 'Operations',
    title: 'Friday payouts forecast to the pound',
    what: 'The banked model, collected times 0.88, was verified against June and July bank statements within 0.4%. Every Friday credit is forecast with a range, and the Wednesday cut off alert moves arrears onto this week’s payout rather than next.',
    how: 'Not counted. The value is fewer surprises and no emergency finance.',
    basis: 'measured',
    kind: 'recurring',
    conservative: 0,
    central: 0,
    counted: false,
  },
]

export function impactTotals() {
  const counted = IMPACT.filter((l) => l.counted)
  const sum = (k: 'conservative' | 'central', kind?: Kind) =>
    counted.filter((l) => !kind || l.kind === kind).reduce((t, l) => t + l[k], 0)
  return {
    conservative: sum('conservative'),
    central: sum('central'),
    recurringConservative: sum('conservative', 'recurring'),
    recurringCentral: sum('central', 'recurring'),
    oneOffConservative: sum('conservative', 'one-off'),
    oneOffCentral: sum('central', 'one-off'),
  }
}

/** Monthly series from club_monthly_metrics, clean months only. */
export const MONTHLY = [
  { month: 'Feb', attrition: 5.23, overdue: 47 },
  { month: 'Mar', attrition: 4.02, overdue: 85 },
  { month: 'Apr', attrition: 4.38, overdue: 91 },
  { month: 'May', attrition: 8.13, overdue: 53 },
  { month: 'Jun', attrition: 6.72, overdue: 38 },
  { month: 'Jul', attrition: 3.65, overdue: 51, live: true },
  { month: 'Aug', attrition: 8.47, overdue: 24, live: true, note: 'roster clean up' },
]

/** The decisions, as stories. Each one happened; each has a number. */
export const STORIES = [
  {
    date: '10 August 2026',
    title: 'The refit that cost £42,000 less',
    body: 'The club was about to order a floor of equipment from the brand it had always used. gymIQ priced the identical 32 line specification against a second supplier, line by line, found the treadmill warranty contradiction on the supplier’s own website, confirmed the second supplier was rebadged commercial kit from an established manufacturer, and modelled six phasing routes against the club’s profit floor. The approved programme fell from £295,000 to £253,432 and the two stage relaunch route came out £106,213 better over three years.',
    figure: '£41,568 off the programme',
  },
  {
    date: '13 August 2026',
    title: 'The price test that would have run for seven weeks',
    body: 'New joiner prices went up on a Saturday. By Wednesday gymIQ had compared the five days against the club’s own seasonality model: weekend sales fine, weekday sales 1 against 8.4 expected, odds of about 1 in 450. The standing rule said hold to 30 September. The owner reverted that morning and the next sale came within minutes.',
    figure: 'about six joins lost instead of forty',
  },
  {
    date: '19 August 2026',
    title: 'Forty seven students who were not students',
    body: 'Date of birth was added to the member history. Within an hour the system had found 47 members aged 19 and over on the under 19 rate, 15 students aged 25 or over, a 56 year old on a plan called Student under 19, and a membership plan sold four times at a price nobody had authorised. Eleven more members turn 19 within 90 days, so it is now a monthly check.',
    figure: '£970 a month, refilling at three members a month',
  },
  {
    date: '19 August 2026',
    title: 'Fifty renewals that looked like a billing fault',
    body: 'Fifty active members had no next payment scheduled. The first read called it broken billing. The second read checked the plan terms: every one had an end date. It was a renewals list. Thirty nine expired by the end of September, ten of them still training every week. The desk got the list sorted by expiry with the trainers first.',
    figure: '£1,289 a month walking out unasked',
  },
  {
    date: '10 August 2026',
    title: 'Card payers fail at 2.4 times the Direct Debit rate',
    body: 'The overdue book was reported as one number, 76. Split by payment method it read 3.3% of Direct Debit payers, 8.1% of card payers, 16.1% of flexible payers. The fix was not more chasing; it was a migration campaign and defaulting new joins to Direct Debit.',
    figure: 'about £530 a month, no capital',
  },
  {
    date: '11 August 2026',
    title: 'The planning consent that had already lapsed',
    body: 'A purchase model for the club’s building attributed £622,080 of value to a planning consent for three flats on the roof. gymIQ searched the council portal, found the application, its resubmission, and the decision date, and worked out it had expired nine months earlier on the standard three year limit. The refinance case changed before any offer was made.',
    figure: '£622,080 of value that was not there',
  },
]
