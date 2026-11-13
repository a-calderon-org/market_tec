import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient, generateBlobSASQueryParameters, SASProtocol, StorageSharedKeyCredential,
  type BlobSASSignatureValues, type UserDelegationKey } from '@azure/storage-blob';
import { AzureBlobImageStorage } from '../adapters/out/azure-blob-image-storage.js';
import { isUuid } from '../domain/messaging.js';

export interface BlobImageSettings {
  readonly endpoint: string;
  readonly account: string;
  readonly stagingContainer: string;
  readonly publishedContainer: string;
  readonly clientId?: string;
  readonly emulatorKey?: string;
}

export function loadBlobImageSettings(environment: NodeJS.ProcessEnv, publicationsEnabled: boolean): BlobImageSettings | undefined {
  const endpoint = environment.CATALOG_BLOB_ENDPOINT?.trim();
  const stagingContainer = environment.CATALOG_BLOB_STAGING_CONTAINER?.trim();
  const publishedContainer = environment.CATALOG_BLOB_PUBLIC_CONTAINER?.trim();
  const clientId = environment.CATALOG_BLOB_MANAGED_IDENTITY_CLIENT_ID?.trim();
  const emulatorKey = environment.CATALOG_BLOB_EMULATOR_KEY?.trim();
  if (!endpoint && !stagingContainer && !publishedContainer && !clientId && !emulatorKey) return undefined;
  if (!publicationsEnabled) throw new Error('CATALOG_BLOB settings require authenticated publications');
  const url = URL.parse(endpoint ?? '');
  const azure = url?.protocol === 'https:' && !url.port && url.pathname === '/' &&
    /^([a-z0-9]{3,24})\.blob\.core\.windows\.net$/.exec(url.hostname);
  const emulator = url?.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port &&
    /^\/([a-z0-9]{3,24})\/?$/.exec(url.pathname);
  const account = (azure || emulator || undefined)?.[1];
  if (!url || !account || url.username || url.password || url.search || url.hash || !!emulator !== !!emulatorKey ||
      (clientId && (!azure || !isUuid(clientId)))) throw new Error('Invalid CATALOG_BLOB endpoint or authentication settings');
  const containerPattern = /^(?!.*--)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  if (!stagingContainer || !publishedContainer || stagingContainer === publishedContainer ||
      !containerPattern.test(stagingContainer) || !containerPattern.test(publishedContainer)) {
    throw new Error('Configure distinct valid CATALOG_BLOB_STAGING_CONTAINER and CATALOG_BLOB_PUBLIC_CONTAINER names');
  }
  return { endpoint: url.href.replace(/\/$/, ''), account, stagingContainer, publishedContainer,
    ...(clientId ? { clientId } : {}), ...(emulatorKey ? { emulatorKey } : {}) };
}

function delegationSigner(client: BlobServiceClient) {
  let key: UserDelegationKey | undefined;
  let pending: Promise<UserDelegationKey> | undefined;
  return async (options: BlobSASSignatureValues) => {
    if (!key || key.signedExpiresOn.getTime() <= options.expiresOn!.getTime() + 60_000) {
      const now = Date.now();
      pending ??= client.getUserDelegationKey(new Date(now - 60_000), new Date(now + 60 * 60_000), {
        abortSignal: AbortSignal.timeout(20_000),
      }).then(result => { key = result; return result; }).finally(() => { pending = undefined; });
      key = await pending;
    }
    return generateBlobSASQueryParameters(options, key, client.accountName).toString();
  };
}

export async function composeBlobImages(settings: BlobImageSettings): Promise<AzureBlobImageStorage> {
  const sharedKey = settings.emulatorKey && new StorageSharedKeyCredential(settings.account, settings.emulatorKey);
  const credential = sharedKey || new ManagedIdentityCredential(settings.clientId ? { clientId: settings.clientId } : {});
  const client = new BlobServiceClient(settings.endpoint, credential, { retryOptions: { maxTries: 2 } });
  const staging = client.getContainerClient(settings.stagingContainer);
  const published = client.getContainerClient(settings.publishedContainer);
  const abortSignal = AbortSignal.timeout(20_000);
  const [stagingProperties, publishedProperties] = await Promise.all([
    staging.getProperties({ abortSignal }), published.getProperties({ abortSignal }),
  ]);
  if (stagingProperties.blobPublicAccess || publishedProperties.blobPublicAccess !== 'blob') {
    throw new Error('Catalog images require a private staging container and blob-only anonymous access for published images');
  }
  return sharedKey
    ? new AzureBlobImageStorage(staging, published, options => generateBlobSASQueryParameters(options, sharedKey).toString(),
      SASProtocol.HttpsAndHttp)
    : new AzureBlobImageStorage(staging, published, delegationSigner(client));
}
