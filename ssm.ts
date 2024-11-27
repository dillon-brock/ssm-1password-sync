import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

export async function getExistingParameters(ssmClient: SSMClient, path: string): Promise<Map<string, string>> {
  const parameters = new Map<string, string>();
  let nextToken: string | undefined;

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true,
      NextToken: nextToken
    });

    const response = await ssmClient.send(command);
    const ssmParameters = response.Parameters;
    if (!ssmParameters) {
      console.log('No parameters found at path:', path);
      break;
    }

    response.Parameters?.forEach(param => {
      if (param.Name && param.Value) {
        parameters.set(param.Name.split('/').slice(2).join('/'), param.Value);
      }
    });

    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}