import { DeleteParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { getExistingParameters } from "./ssm";
import { createClient } from "@1password/sdk";

async function syncSendgridTemplateIdsByEnvironment(env: 'dev'|'prod', ssmClient: SSMClient, onepasswordClient: Awaited<ReturnType<typeof createClient>>) {
  console.log(`Starting parameter sync for ${env}`);
  const existingParameters = await getExistingParameters(ssmClient, `/${env}/sendgrid_template_ids`);

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

export async function syncSendgridTemplateIds(ssmClient: SSMClient, onepasswordClient: Awaited<ReturnType<typeof createClient>>) {
    await syncSendgridTemplateIdsByEnvironment('dev', ssmClient, onepasswordClient);
    await syncSendgridTemplateIdsByEnvironment('prod', ssmClient, onepasswordClient);
}