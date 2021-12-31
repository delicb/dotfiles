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

	# check the modification time of pip config and do not do login again
	# if we have login newer than 11.5 hours (it expires after 12 hours)
	set -l _expiration_duration (math "11.5 * 60 * 60")
	set -l _expires_at (math (stat -f %m $HOME/.config/pip/pip.conf) + $_expiration_duration)
	if test $_expires_at -lt (date +%s)
		echo "Pip credentials potentially expired, refreshing..."
		aws --profile $AWS_PROFILE codeartifact login --tool pip --repository $AWS_CODEARTIFACT_REPOSITORY --domain $AWS_CODEARTIFACT_DOMAIN
	else
		echo "PIP credentials should be up to date, skipping refresh..."
	end
end
