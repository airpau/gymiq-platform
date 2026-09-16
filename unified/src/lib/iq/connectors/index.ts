/**
 * Connector registry: crm_type on iq.sites picks the translator. Nothing else
 * in the pipeline knows which CRM a site uses.
 *
 * File mode today for every CRM (exports pushed to the worker's artifact
 * endpoint, or emailed, or fetched by the hosted collector). API connectors for
 * the CRMs that expose one (TeamUp, Mindbody, GymMaster, Xplor) slot in here
 * with pullSnapshot without touching the pipeline.
 */
import type { CrmConnector, CrmType, IsoDate } from '../contract'
import { glofoxXlsxConnector, asOfFromFilename } from './glofox-xlsx'
import { genericTableConnector } from './generic-table'

export function getConnector(crm: CrmType | string | null | undefined): CrmConnector {
  switch (crm) {
    case 'glofox': return glofoxXlsxConnector
    case 'clubright': case 'teamup': case 'ashbourne': case 'xplor': case 'mindbody': case 'gymmaster': case 'csv':
      return genericTableConnector(crm)
    default:
      return genericTableConnector('csv')
  }
}

/** Which artifact filenames hold a member snapshot for this CRM. */
export function memberArtifactPattern(crm: CrmType | string | null | undefined): RegExp {
  if (crm === 'glofox') return /^Members_.*\.xlsx$/i
  return /^(members?|clients?|export|snapshot).*\.(csv|xlsx)$/i
}

/** Sheet to read for this CRM (null = first sheet). */
export function memberSheetHint(crm: CrmType | string | null | undefined, crmConfig: Record<string, unknown>): string | null {
  if (typeof crmConfig?.sheet === 'string') return crmConfig.sheet
  if (crm === 'glofox') return 'current'
  return null
}

export { asOfFromFilename }
export type { IsoDate }
