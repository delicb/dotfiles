function ecr_login --description "ECR login with AWS credentials"
	if not set -q "AWS_ACCOUNT_ID"
		echo "AWS_ACCOUNT_ID is not set"; and return 1
	end
	set -q AWS_REGION; or set -lx AWS_REGION "us-east-1"
	set -q AWS_PROFILE; or set -lx AWS_PROFILE "default"

	aws --profile $AWS_PROFILE ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
end
