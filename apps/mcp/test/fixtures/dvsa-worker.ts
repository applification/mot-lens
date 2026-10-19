import { DvsaClient, VehicleService } from '../../src/dvsa';

export default {
  async fetch() {
    const client = new DvsaClient({ credentials: {
      DVSA_API_KEY: 'fixture-api-key', DVSA_CLIENT_ID: 'fixture-client', DVSA_CLIENT_SECRET: 'fixture-secret',
      DVSA_TOKEN_URL: 'https://login.microsoftonline.com/fixture/oauth2/v2.0/token', DVSA_SCOPE: 'fixture-scope',
    }, sleep: async () => {} });
    return Response.json(await new VehicleService({ client }).lookup('AB12CDE'));
  },
};
