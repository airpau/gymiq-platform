/**
 * MindbodyConnector — Tier A (API) connector for Mindbody Online.
 *
 * Uses the Mindbody Public API v6:
 *   https://developers.mindbodyonline.com/PublicDocumentation/V6
 *
 * Required config fields:
 *   apiKey   — Mindbody API key (obtained from developer portal)
 *   siteId   — Studio / site ID (negative for sandbox, e.g. '-99')
 *
 * Sync coverage:
 *   syncMembers()  → active/inactive clients from GET /client/clients
 *   syncLeads()    → prospects from GET /prospect/prospects
 */

import { ApiConnector } from './base';
import type { NormalizedMember, NormalizedLead, ConnectorConfig } from '../types';

const MINDBODY_BASE = 'https://api.mindbodyonline.com/public/v6';

interface MBClient {
  Id: string;
  FirstName: string;
  LastName: string;
  Email?: string;
  MobilePhone?: string;
  HomePhone?: string;
  Status?: string; // 'Active', 'Non-Member', 'Suspended', etc.
  ActiveMemberships?: Array<{ Name: string; Status: string }>;
  SignupDate?: string;
  LastModifiedDateTime?: string;
  VisitCount?: number;
  UniqueId?: number;
}

interface MBProspect {
  Id: string;
  FirstName: string;
  LastName: string;
  Email?: string;
  MobilePhone?: string;
  CreationDateTime?: string;
  LeadChannel?: string;
}

interface MBPaginatedResponse<T> {
  PaginationResponse: { RequestedLimit: number; RequestedOffset: number; PageSize: number; TotalResults: number };
  Clients?: T[];
  Prospects?: T[];
}

export class MindbodyConnector extends ApiConnector {
  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, config);
    this.apiConfig.baseUrl = this.apiConfig.baseUrl ?? MINDBODY_BASE;
  }

  protected buildAuthHeaders(): Record<string, string> {
    return {
      'API-Key': this.apiConfig.apiKey,
      SiteId: this.apiConfig.siteId ?? '',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/site/sites', { limit: '1' });
      return true;
    } catch {
      return false;
    }
  }

  async syncMembers(): Promise<NormalizedMember[]> {
    this.log('Fetching clients from Mindbody…');

    const clients = await this.fetchAllPages<MBClient>(async (page) => {
      const limit = 200;
      const offset = (page - 1) * limit;
      const res = await this.get<MBPaginatedResponse<MBClient>>('/client/clients', {
        Limit: String(limit),
        Offset: String(offset),
      });
      const items = res.Clients ?? [];
      const total = res.PaginationResponse?.TotalResults ?? 0;
      return { items, hasMore: offset + items.length < total };
    });

    this.log(`Fetched ${clients.length} clients`);
    return clients.map(this.normaliseClient.bind(this));
  }

  async syncLeads(): Promise<NormalizedLead[]> {
    this.log('Fetching prospects from Mindbody…');

    const prospects = await this.fetchAllPages<MBProspect>(async (page) => {
      const limit = 200;
      const offset = (page - 1) * limit;
      const res = await this.get<MBPaginatedResponse<MBProspect>>('/prospect/prospects', {
        Limit: String(limit),
        Offset: String(offset),
      });
      const items = res.Prospects ?? [];
      const total = res.PaginationResponse?.TotalResults ?? 0;
      return { items, hasMore: offset + items.length < total };
    });

    this.log(`Fetched ${prospects.length} prospects`);
    return prospects.map(this.normaliseProspect.bind(this));
  }

  // ─── Normalisers ──────────────────────────────────────────────────────────

  private normaliseClient(c: MBClient): NormalizedMember {
    const rawStatus = (c.Status ?? '').toLowerCase();
    let status: NormalizedMember['status'] = 'active';
    if (rawStatus.includes('suspend') || rawStatus.includes('frozen')) status = 'frozen';
    else if (rawStatus.includes('cancel') || rawStatus.includes('terminat')) status = 'cancelled';
    else if (rawStatus.includes('non-member') || rawStatus.includes('inactive')) status = 'cancelled';

    const membership = c.ActiveMemberships?.[0]?.Name;

    return {
      crmId: String(c.UniqueId ?? c.Id),
      name: `${c.FirstName} ${c.LastName}`.trim(),
      email: c.Email?.toLowerCase() || undefined,
      phone: c.MobilePhone || c.HomePhone || undefined,
      status,
      membershipTier: membership,
      joinDate: c.SignupDate ? new Date(c.SignupDate) : undefined,
      visitCount30d: c.VisitCount,
    };
  }

  private normaliseProspect(p: MBProspect): NormalizedLead {
    const rawChannel = (p.LeadChannel ?? '').toLowerCase();
    let source = 'web_form';
    if (rawChannel.includes('walk') || rawChannel.includes('in_person')) source = 'walk_in';
    else if (rawChannel.includes('referral') || rawChannel.includes('refer')) source = 'referral';
    else if (rawChannel.includes('call') || rawChannel.includes('phone')) source = 'call';

    return {
      crmId: String(p.Id),
      name: `${p.FirstName} ${p.LastName}`.trim() || undefined,
      email: p.Email?.toLowerCase() || undefined,
      phone: p.MobilePhone || undefined,
      source,
      enquiryDate: p.CreationDateTime ? new Date(p.CreationDateTime) : undefined,
    };
  }
}
