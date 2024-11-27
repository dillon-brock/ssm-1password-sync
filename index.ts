import { createClient } from '@1password/sdk';
import { 
  SSMClient, 
  PutParameterCommand, 
  DeleteParameterCommand,
  GetParametersByPathCommand
} from '@aws-sdk/client-ssm';

async function getExistingParameters(ssmClient: SSMClient, env: 'dev'|'prod', path: string): Promise<Map<string, string>> {
  const parameters = new Map<string, string>();
  let nextToken: string | undefined;

  do {
    const command = new GetParametersByPathCommand({
      Path: `/${env}/${path}`,
      Recursive: true,
      WithDecryption: true,
      NextToken: nextToken
    });

    const response = await ssmClient.send(command);
    response.Parameters?.forEach(param => {
      if (param.Name && param.Value) {
        parameters.set(param.Name.split('/').slice(2).join('/'), param.Value);
      }
    });

    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}

async function syncSendgridTemplateIdsByEnvironment(env: 'dev'|'prod', ssmClient: SSMClient, onepasswordClient: Awaited<ReturnType<typeof createClient>>) {
  console.log(`Starting parameter sync for ${env}`);
  const existingParameters = await getExistingParameters(ssmClient, env, 'sendgrid_template_ids');

  const vaultId = process.env[`${env.toUpperCase()}_SENDGRID_VAULT_ID`]!;
  const itemId = process.env[`${env.toUpperCase()}_SENDGRID_ITEM_ID`]!;
  
  const item = await onepasswordClient.items.get(vaultId, itemId);
  const textField = item.fields?.find(field => field.title == 'text');

  if (!textField?.value) {
    throw new Error('Text value not found or empty');
  }

  const onePasswordParameters = JSON.parse(textField.value) as Record<string, string>;

  for (const [key, value] of Object.entries(onePasswordParameters)) {
    try {
      await ssmClient.send(new PutParameterCommand({
        Name: `/${env}/sendgrid_template_ids/${key}`,
        Value: value,
        Type: 'String',
        Overwrite: true
      }));
      console.log(`Successfully updated ${key}`);
      existingParameters.delete(key);
    } catch (error) {
      console.error(`Failed to update ${key}:`, error);
    }
  }

  for (const [key] of existingParameters) {
    try {
      await ssmClient.send(new DeleteParameterCommand({
        Name: `/${key}`
      }));
      console.log(`Successfully deleted ${key} (not found in 1Password)`);
    } catch (error) {
      console.error(`Failed to delete ${key}:`, error);
    }
  }
}

async function sync() {
  console.log('Starting parameter sync');

  const onepasswordClient = await createClient({
    auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
    integrationName: "sendgrid-template-sync",
    integrationVersion: "1.0.0",
  });
  
  const ssmClient = new SSMClient({ region: 'us-east-1' });

  await syncSendgridTemplateIdsByEnvironment('dev', ssmClient, onepasswordClient);
  await syncSendgridTemplateIdsByEnvironment('prod', ssmClient, onepasswordClient);
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