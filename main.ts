import {
  EC2Client,
  DescribeRouteTablesCommand,
  DescribeInstancesCommand,
  DescribeAddressesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeNatGatewaysCommand,
  DescribeInternetGatewaysCommand,
  Address,
  SecurityGroup,
} from '@aws-sdk/client-ec2'

import { writeFileSync } from 'node:fs'
import { S3 } from '@aws-sdk/client-s3'

import * as stringcase from 'stringcase'

const ec2 = new EC2Client({})
const s3 = new S3({})

type PulumiResource = {
  type: string
  name: string
  id: string
}

const commandMap = {
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeRouteTablesCommand,
  DescribeNatGatewaysCommand,
  DescribeInternetGatewaysCommand,
}

const generateImportResources = async (
  getAwsResources: () => Promise<any[]>,
  getResourceId: (resource: any) => string,
  pulumiTypeIdentifier: string,
): Promise<PulumiResource[]> => {
  const pulumiResources: PulumiResource[] = []
  const awsResources = await getAwsResources()
  for (const awsResource of awsResources) {
    const resourceId = getResourceId(awsResource)
    let name = `import-${resourceId}`
    if (awsResource['Name']) {
      name = awsResource['Name']
    } else if (awsResource['Tags']) {
      for (let tag of awsResource['Tags']) {
        if (tag['Key'] === 'Name') {
          name = `${tag['Value']}-${resourceId}`
          break
        }
      }
    }

    pulumiResources.push({
      type: pulumiTypeIdentifier,
      name: name,
      id: resourceId,
    })
  }
  return pulumiResources
}

const importEc2Resources = async (resourceTypePascalCase: string): Promise<PulumiResource[]> => {
  const resourceTypeCamelCase = stringcase.camelcase(resourceTypePascalCase)

  const getAwsResources = async () => {
    const CommandConstructor = commandMap[`Describe${resourceTypePascalCase}sCommand`]
    const command = new CommandConstructor({})
    const response = await ec2.send(command)
    return response[`${resourceTypePascalCase}s`]
  }

  const getResourceId = (resource: any) => resource[`${resourceTypePascalCase}Id`]
  const pulumiTypeIdentifier = `aws:ec2/${resourceTypeCamelCase}:${resourceTypePascalCase}`

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

const importRouteTableAssociations = async (): Promise<PulumiResource[]> => {
  const pulumiResources: PulumiResource[] = []
  const routeTables = await ec2.send(new DescribeRouteTablesCommand({}))

  for (let routeTable of routeTables.RouteTables) {
    for (let association of routeTable.Associations) {
      if (!association.SubnetId) {
        continue
      }
      pulumiResources.push({
        type: 'aws:ec2/routeTableAssociation:RouteTableAssociation',
        name: `import-${association.RouteTableAssociationId}`,
        id: `${association.SubnetId}/${routeTable.RouteTableId}`,
      })
    }
  }

  return pulumiResources
}

const main = async () => {
  const pulumiImport = {
    resources: [] as PulumiResource[],
  }

  const resourceTypes = ['Vpc', 'Subnet', 'RouteTable', 'NatGateway', 'InternetGateway']

  for (let resourceType of resourceTypes) {
    pulumiImport.resources.push(...(await importEc2Resources(resourceType)))
  }

  pulumiImport.resources.push(...(await importRouteTableAssociations()))

  pulumiImport.resources.push(
    ...(await generateImportResources(
      async () => (await ec2.send(new DescribeAddressesCommand({}))).Addresses as Address[],
      (resource: Address) => resource.AllocationId,
      'aws:ec2/eip:Eip',
    )),
  )

  const { Reservations: ec2Instances } = await ec2.send(new DescribeInstancesCommand({}))
  pulumiImport.resources.push(
    ...(await generateImportResources(
      async () => ec2Instances.flatMap(reservation => reservation.Instances),
      (resource: any) => resource.InstanceId,
      'aws:ec2/instance:Instance',
    )),
  )

  pulumiImport.resources.push(
    ...(await generateImportResources(
      async () =>
        (await ec2.send(new DescribeSecurityGroupsCommand({}))).SecurityGroups as SecurityGroup[],
      (resource: SecurityGroup) => resource.GroupId,
      'aws:ec2/securityGroup:SecurityGroup',
    )),
  )

  pulumiImport.resources.push(
    ...(await generateImportResources(
      async () => (await s3.listBuckets({})).Buckets,
      (resource: any) => resource.Name,
      'aws:s3/bucket:Bucket',
    )),
  )

  writeFileSync('resource.json', JSON.stringify(pulumiImport, null, 2))
}

main()
