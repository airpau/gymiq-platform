/**
 * ClubRightConnector — Tier A (API) connector for ClubRight CRM.
 *
 * ClubRight REST API docs: https://api.clubright.co.uk/docs
 *
 * Required config fields:
 *   apiKey   — ClubRight API key
 *   siteId   — Club ID / account reference
 *
 * Sync coverage:
 *   syncMembers()  → GET /members
 *   syncLeads()    → GET /prospects
 */

import { ApiConnector } from './base';
import type { NormalizedMember, NormalizedLead, ConnectorConfig } from '../types';

const CLUBRIGHT_BASE = 'https://api.clubright.co.uk/v1';

interface CRMember {
  id: string | number;
  forename: string;
  surname: string;
  email?: string;
  mobile?: string;
  phone?: string;
  status?: string;          // 'active', 'suspended', 'cancelled', 'lapsed'
  membership_name?: string;
  join_date?: string;       // ISO date string
  last_visit?: string;      // ISO date string
  visits_last_30?: number;
  monthly_fee?: number;
}

interface CRProspect {
  id: string | number;
  forename: string;
  surname: string;
  email?: string;
  mobile?: string;
  source?: string;
  created_at?: string;      // ISO date string
  score?: number;
}

interface CRPagedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export class ClubRightConnector extends ApiConnector {
  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, config);
    this.apiConfig.baseUrl = this.apiConfig.baseUrl ?? CLUBRIGHT_BASE;
  }

  protected buildAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiConfig.apiKey}`,
      'X-Club-Id': this.apiConfig.siteId ?? '',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/club/info');
      return true;
    } catch {
      return false;
    }
  }

  async syncMembers(): Promise<NormalizedMember[]> {
    this.log('Fetching members from ClubRight…');

    const members = await this.fetchAllPages<CRMember>(async (page) => {
      const res = await this.get<CRPagedResponse<CRMember>>('/members', {
        page: String(page),
        per_page: '250',
      });
      return {
        items: res.data ?? [],
        hasMore: page < (res.meta?.last_page ?? 1),
      };
    });

    this.log(`Fetched ${members.length} members`);
    return members.map(this.normaliseMember.bind(this));
  }

  async syncLeads(): Promise<NormalizedLead[]> {
    this.log('Fetching prospects from ClubRight…');

    const prospects = await this.fetchAllPages<CRProspect>(async (page) => {
      const res = await this.get<CRPagedResponse<CRProspect>>('/prospects', {
        page: String(page),
        per_page: '250',
      });
      return {
        items: res.data ?? [],
        hasMore: page < (res.meta?.last_page ?? 1),
      };
    });

    this.log(`Fetched ${prospects.length} prospects`);
    return prospects.map(this.normaliseProspect.bind(this));
  }

  // ─── Normalisers ──────────────────────────────────────────────────────────

  private normaliseMember(m: CRMember): NormalizedMember {
    const s = (m.status ?? '').toLowerCase();
    let status: NormalizedMember['status'] = 'active';
    if (s === 'suspended' || s === 'paused') status = 'frozen';
    else if (s === 'cancelled' || s === 'lapsed' || s === 'terminated') status = 'cancelled';

    return {
      crmId: String(m.id),
      name: `${m.forename} ${m.surname}`.trim(),
      email: m.email?.toLowerCase() || undefined,
      phone: m.mobile || m.phone || undefined,
      status,
      membershipTier: m.membership_name || undefined,
      joinDate: m.join_date ? new Date(m.join_date) : undefined,
      lastVisit: m.last_visit ? new Date(m.last_visit) : undefined,
      visitCount30d: m.visits_last_30 ?? undefined,
      lifetimeValue: m.monthly_fee ?? undefined,
    };
  }

  private normaliseProspect(p: CRProspect): NormalizedLead {
    const rawSrc = (p.source ?? '').toLowerCase();
    let source = 'web_form';
    if (rawSrc.includes('walk')) source = 'walk_in';
    else if (rawSrc.includes('refer')) source = 'referral';
    else if (rawSrc.includes('call') || rawSrc.includes('phone')) source = 'call';
    else if (rawSrc.includes('abandon') || rawSrc.includes('cart')) source = 'abandoned_cart';

    return {
      crmId: String(p.id),
      name: `${p.forename} ${p.surname}`.trim() || undefined,
      email: p.email?.toLowerCase() || undefined,
      phone: p.mobile || undefined,
      source,
      enquiryDate: p.created_at ? new Date(p.created_at) : undefined,
      score: p.score ?? undefined,
    };
  }
}
