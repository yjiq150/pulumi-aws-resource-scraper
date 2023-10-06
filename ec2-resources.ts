import {
  Address,
  DescribeAddressesCommand,
  DescribeInstancesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  Instance,
  InternetGateway,
  NatGateway,
  RouteTable,
  SecurityGroup,
  Subnet,
  Vpc,
} from '@aws-sdk/client-ec2'
import { writeFileSync } from 'node:fs'
import { PulumiResource } from './pulumi'

const ec2 = new EC2Client({})

export async function importEc2Resources() {
  const resources: PulumiResource[] = []

  resources.push(...(await importVpc()))
  resources.push(...(await importSubnet()))
  resources.push(...(await importInternetGateway()))
  resources.push(...(await importNatGateway()))
  resources.push(...(await importRouteTable()))
  resources.push(...(await importRouteTableAssociation()))
  resources.push(...(await importEip()))
  resources.push(...(await importInstance()))
  resources.push(...(await importSecurityGroup()))

  const pulumiImport = {
    resources,
  }

  writeFileSync('output/ec2-resources.json', JSON.stringify(pulumiImport, null, 2))
}

async function importVpc(): Promise<PulumiResource[]> {
  const getAwsResources = async () => (await ec2.send(new DescribeVpcsCommand({}))).Vpcs
  const getResourceId = (resource: Vpc) => resource.VpcId
  const pulumiTypeIdentifier = 'aws:ec2/vpc:Vpc'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importSubnet(): Promise<PulumiResource[]> {
  const getAwsResources = async () => (await ec2.send(new DescribeSubnetsCommand({}))).Subnets
  const getResourceId = (resource: Subnet) => resource.SubnetId
  const pulumiTypeIdentifier = 'aws:ec2/vpc:Vpc'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importInternetGateway(): Promise<PulumiResource[]> {
  const getAwsResources = async () =>
    (await ec2.send(new DescribeInternetGatewaysCommand({}))).InternetGateways
  const getResourceId = (resource: InternetGateway) => resource.InternetGatewayId
  const pulumiTypeIdentifier = 'aws:ec2/vpc:Vpc'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importNatGateway(): Promise<PulumiResource[]> {
  const getAwsResources = async () =>
    (await ec2.send(new DescribeNatGatewaysCommand({}))).NatGateways
  const getResourceId = (resource: NatGateway) => resource.NatGatewayId
  const pulumiTypeIdentifier = 'aws:ec2/natGateway:NatGateway'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importRouteTable(): Promise<PulumiResource[]> {
  const getAwsResources = async () =>
    (await ec2.send(new DescribeRouteTablesCommand({}))).RouteTables
  const getResourceId = (resource: RouteTable) => resource.RouteTableId
  const pulumiTypeIdentifier = 'aws:ec2/routeTable:RouteTable'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importRouteTableAssociation(): Promise<PulumiResource[]> {
  const pulumiResources: PulumiResource[] = []
  const routeTables = await ec2.send(new DescribeRouteTablesCommand({}))

  for (let routeTable of routeTables.RouteTables) {
    for (let association of routeTable.Associations) {
      if (!association.SubnetId) {
        continue
      }
      pulumiResources.push({
        type: 'aws:ec2/routeTableAssociation:RouteTableAssociation',
        name: association.RouteTableAssociationId,
        id: `${association.SubnetId}/${routeTable.RouteTableId}`,
      })
    }
  }

  return pulumiResources
}

async function importEip(): Promise<PulumiResource[]> {
  const getAwsResources = async () => (await ec2.send(new DescribeAddressesCommand({}))).Addresses
  const getResourceId = (resource: Address) => resource.AllocationId
  const pulumiTypeIdentifier = 'aws:ec2/eip:Eip'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importInstance(): Promise<PulumiResource[]> {
  const getAwsResources = async () => {
    const { Reservations: ec2Instances } = await ec2.send(new DescribeInstancesCommand({}))
    return ec2Instances.flatMap(reservation => reservation.Instances)
  }
  const getResourceId = (resource: Instance) => resource.InstanceId
  const pulumiTypeIdentifier = 'aws:ec2/instance:Instance'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function importSecurityGroup() {
  const getAwsResources = async () =>
    (await ec2.send(new DescribeSecurityGroupsCommand({}))).SecurityGroups

  const getResourceId = (resource: SecurityGroup) => resource.GroupId
  const pulumiTypeIdentifier = 'aws:ec2/securityGroup:SecurityGroup'

  return generateImportResources(getAwsResources, getResourceId, pulumiTypeIdentifier)
}

async function generateImportResources(
  getAwsResources: () => Promise<any[]>,
  getResourceId: (resource: any) => string,
  pulumiTypeIdentifier: string,
): Promise<PulumiResource[]> {
  const pulumiResources: PulumiResource[] = []
  const awsResources = await getAwsResources()

  for (const awsResource of awsResources) {
    const resourceId = getResourceId(awsResource)
    let name = resourceId
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
