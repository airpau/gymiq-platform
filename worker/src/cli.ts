/**
 * Local runner:  npm run cli -- <playbook> <site_id> [--send]
 * Dry run by default (nothing is delivered); pass --send to deliver for real.
 */
import { runPlaybook } from './runner.js'
import { pool } from './db.js'

const [playbook, siteId] = process.argv.slice(2)
if (!playbook || !siteId) {
  console.error('usage: npm run cli -- <playbook> <site_id> [--send]')
  process.exit(2)
}
const dryRun = !process.argv.includes('--send')

runPlaybook({ playbook, siteId, dryRun })
  .then(async (r) => {
    console.log('\n===== OUTPUT =====\n' + (r.output ?? '(none)') + '\n==================')
    console.log(JSON.stringify({ ...r, output: undefined }, null, 2))
    await pool.end()
    process.exit(r.status === 'error' ? 1 : 0)
  })
  .catch(async (e) => {
    console.error(e)
    await pool.end()
    process.exit(1)
  })
