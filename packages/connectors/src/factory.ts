/**
 * createConnector factory — separate file to avoid circular imports.
 * Both scheduler.ts and index.ts import from here.
 */

import type { ConnectorConfig } from './types';
import type { BaseConnector } from './base';
import { MindbodyConnector } from './api/mindbody';
import { ClubRightConnector } from './api/clubright';
import { GloFoxConnector } from './browser/glofox';
import { EmailConnector } from './email/parser';

/**
 * Instantiate the correct connector for a gym based on its stored config.
 *
 * @example
 *   const config: ApiConnectorConfig = { type: 'api', provider: 'mindbody', apiKey: '…', siteId: '123' };
 *   const connector = createConnector(gymId, config);
 *   const members = await connector.syncMembers();
 */
export function createConnector(gymId: string, config: ConnectorConfig): BaseConnector {
  switch (config.type) {
    case 'api': {
      const provider = config.provider.toLowerCase();
      if (provider === 'mindbody') return new MindbodyConnector(gymId, config);
      if (provider === 'clubright') return new ClubRightConnector(gymId, config);
      throw new Error(`Unknown API provider "${config.provider}". Supported: mindbody, clubright`);
    }
    case 'browser': {
      const provider = config.provider.toLowerCase();
      if (provider === 'glofox') return new GloFoxConnector(gymId, config);
      throw new Error(`Unknown browser provider "${config.provider}". Supported: glofox`);
    }
    case 'email':
      return new EmailConnector(gymId, config);
    case 'upload':
    case 'manual':
      throw new Error(
        `Connector type "${config.type}" does not support automated sync. ` +
          'Use DataPipeline directly with manually parsed data.'
      );
    default:
      throw new Error(`Unknown connector type: ${(config as ConnectorConfig).type}`);
  }
}
