# pulumi-aws-resource-scraper

This is a tool to scrape AWS resources and output `json` file which is formatted to be used for Pulumi bulk import.

Codes that importing EC2 resources are based
on [pulumi-import-aws-account-scraper](https://github.com/pulumi/pulumi-import-aws-account-scraper).

## Supported Resources

### EC2 Related

- VPCs
- Subnets
- Routes
- Route tables
- Route table associations
- NAT gateways
- Internet gateways
- Elastic IPs
- Security groups
- EC2 instances

### S3

- Bucket
- BucketPolicy
- BucketBlockPublicAccess
- BucketNotification
- BucketOwnershipControls

## Usage

Set proper AWS credential & config first then run:

```
npm run scrape
```

And then use created `ec2-resource.json`, `s3-resource-{region}.json` file as an input for Pulumi import.
