import { importEc2Resources } from './ec2-resources'
import { importS3Resources } from './s3-resources'

const main = async () => {
  await importS3Resources()
  await importEc2Resources()
}

main().catch(e => {
  console.log(e)
})
