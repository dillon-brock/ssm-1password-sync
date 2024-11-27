import { createClient } from '@1password/sdk';
import { 
  SSMClient, 
} from '@aws-sdk/client-ssm';
import { syncSendgridTemplateIds } from './sendgrid';

async function sync() {
  console.log('Starting parameter sync');

  const onepasswordClient = await createClient({
    auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
    integrationName: "sendgrid-template-sync",
    integrationVersion: "1.0.0",
  });
  
  const ssmClient = new SSMClient({ region: 'us-east-1' });

  await syncSendgridTemplateIds(ssmClient, onepasswordClient);
}

export const handler = async () => {
  try {
    await sync();
    return { statusCode: 200, body: 'Sync completed successfully' };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Sync failed',
        error: String(error)
      })
    };
  }
};