import { OPConnect } from '@1password/connect';
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
        parameters.set(param.Name.slice(1), param.Value);
      }
    });

    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}

async function syncSendgridTemplateIdsByEnvironment(env: 'dev'|'prod', ssmClient: SSMClient, connectClient: OPConnect) {
  console.log(`Starting parameter sync for ${env}`);
  const existingParameters = await getExistingParameters(ssmClient, env, 'sendgrid_template_ids');

  const item = await connectClient.getItemById(process.env[`${env.toUpperCase()}_SENDGRID_VAULT_ID`]!, process.env[`${env.toUpperCase()}_SENDGRID_ITEM_ID`]!);
  const notesField = item.fields?.find(f => f.label === 'notesPlain');

  if (!notesField?.value) {
      throw new Error('Notes field not found or empty');
  }

  const onePasswordParameters = JSON.parse(notesField.value) as Record<string, string>;

  for (const [key, value] of Object.entries(onePasswordParameters)) {
      try {
      await ssmClient.send(new PutParameterCommand({
          Name: `/${key}`,
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

  const connectClient = new OPConnect({
    serverURL: '',
    token: '',
  });
  
  const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

  await syncSendgridTemplateIdsByEnvironment('dev', ssmClient, connectClient);
  await syncSendgridTemplateIdsByEnvironment('prod', ssmClient, connectClient);
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
