# pulumi-aws-resource-scraper

This is a tool to scrape AWS resources and output `resource.json` which is formatted to be used for Pulumi bulk import.

Codes that importing EC2 resources are based on [pulumi-import-aws-account-scraper](https://github.com/pulumi/pulumi-import-aws-account-scraper).

## Supported Resources

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
- S3

## Usage

Set proper AWS credential & config first then run:

```
npm run scrape
```

And then use created `resource.json` file as an input for Pulumi import.
