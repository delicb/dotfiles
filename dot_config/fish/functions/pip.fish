function pip --wraps=pip --description="Wrapper for pip that does automatic signing if needed"
	# using existance of AWS_ACCOUNT_ID variable to determine if 
	# default public PyPI should be used or CodeArtifact one
	if not set -q AWS_ACCOUNT_ID
		echo "AWS_ACCOUNT_ID not set, using public PyPI"

		PIP_INDEX_URL="https://pypi.python.org/simple" command pip $argv
		return
	end

	pip_login
	command pip $argv
end