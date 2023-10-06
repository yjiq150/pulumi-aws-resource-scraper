import { S3 } from '@aws-sdk/client-s3'
import { groupBy } from 'lodash'
import { writeFileSync } from 'node:fs'
import { PulumiResource } from './pulumi'

const s3 = new S3({})

export async function importS3Resources() {
  const { Buckets: buckets } = await s3.listBuckets({})

  const allResources = (
    await Promise.all(
      buckets
        .map(bucket => ({
          type: 'aws:s3/bucket:Bucket',
          name: bucket.Name,
          id: bucket.Name,
        }))
        .map($0 => generateRelatedS3Resources($0)),
    )
  ).flat()

  // S3 buckets have their own regions, but all buckets are returned regardless of a region.
  // - pulumi stack is usually configured with default provider which set to a certain region.
  // - Therefore pulumi cannot import resources from multiple regions at once.
  const resourcesByRegion = groupBy(allResources, $0 => $0.region)

  Object.entries(resourcesByRegion).forEach(([region, buckets]) => {
    const s3PulumiImport = {
      resources: buckets,
    }

    writeFileSync(`output/s3-resources-${region}.json`, JSON.stringify(s3PulumiImport, null, 2))
  })
}

async function ignoreNotFoundError<T>(block: () => Promise<T>): Promise<T | undefined> {
  try {
    return await block()
  } catch (e) {
    const errorCode = e.Code
    if (errorCode && (errorCode.includes('NoSuch') || errorCode.includes('NotFound'))) {
      console.info(`[${e.BucketName}] ${errorCode} - ${e.message}`)
      return undefined
    }

    throw e
  }
}

async function generateRelatedS3Resources(
  resource: PulumiResource,
): Promise<(PulumiResource & { region: string })[]> {
  const bucketRequest = { Bucket: resource.name }
  const bucketLocation = await ignoreNotFoundError(() => s3.getBucketLocation(bucketRequest))

  // When bucket is in 'us-east-1', it does not return value.
  const region = bucketLocation?.LocationConstraint || 'us-east-1'
  const regionSpecificS3 = new S3({ region })

  const relatedResources = []

  // Always add bucket itself
  relatedResources.push({
    ...resource,
    region,
  })

  const bucketNotification = await ignoreNotFoundError(() =>
    regionSpecificS3.getBucketNotificationConfiguration(bucketRequest),
  )
  if (
    bucketNotification?.EventBridgeConfiguration ||
    bucketNotification?.QueueConfigurations ||
    bucketNotification?.TopicConfigurations ||
    bucketNotification?.LambdaFunctionConfigurations
  ) {
    relatedResources.push({
      type: 'aws:s3/bucketNotification:BucketNotification',
      name: `${resource.name}-bucketNotification`,
      id: resource.id,
      region,
    })
  }

  const bucketPolicy = await ignoreNotFoundError(() =>
    regionSpecificS3.getBucketPolicy(bucketRequest),
  )

  if (bucketPolicy?.Policy) {
    relatedResources.push({
      type: 'aws:s3/bucketPolicy:BucketPolicy',
      name: `${resource.name}-bucketPolicy`,
      id: resource.id,
      region,
    })
  }

  const bucketPublicAccessBlock = await ignoreNotFoundError(() =>
    regionSpecificS3.getPublicAccessBlock(bucketRequest),
  )
  if (bucketPublicAccessBlock?.PublicAccessBlockConfiguration) {
    relatedResources.push({
      type: 'aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock',
      name: `${resource.name}-bucketPublicAccessBlock`,
      id: resource.id,
      region,
    })
  }

  const bucketOwnershipControls = await ignoreNotFoundError(() =>
    regionSpecificS3.getBucketOwnershipControls(bucketRequest),
  )
  if (
    bucketOwnershipControls?.OwnershipControls &&
    // Import only if a resource is not using default values.
    bucketOwnershipControls?.OwnershipControls?.Rules?.some(
      $0 => $0.ObjectOwnership !== 'BucketOwnerEnforced',
    )
  ) {
    relatedResources.push({
      type: 'aws:s3/bucketOwnershipControls:BucketOwnershipControls',
      name: `${resource.name}-bucketOwnershipControls`,
      id: resource.id,
      region,
    })
  }

  return relatedResources
}
