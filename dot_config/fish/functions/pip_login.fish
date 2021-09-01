function pip_login --description "performs AWS pip login with currently set AWS credentials"
	if not set -q AWS_ACCOUNT_ID
		echo "AWS_ACCOUNT_ID not set"; and return 1
	end

	if not set -q AWS_CODEARTIFACT_REPOSITORY
		echo "AWS_CODEARTIFACT_REPOSITORY not set"; and return 1
	end

	if not set -q AWS_CODEARTIFACT_DOMAIN
		echo "AWS_CODEARTIFACT_DOMAIN not set"; and return 1
	end
	set -q AWS_REGION; or set -lx AWS_REGION "us-east-1"
	set -q AWS_PROFILE; or set -lx AWS_PROFILE "default"

	aws --profile $AWS_PROFILE codeartifact login --tool pip --repository $AWS_CODEARTIFACT_REPOSITORY --domain $AWS_CODEARTIFACT_DOMAIN
end
