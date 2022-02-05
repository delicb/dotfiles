function pipx --wraps pipx --description "Wrapper for pipx that does automatic signin if needed"
	# using existance of AWS_ACCOUNT_ID variable to determine if 
	# default public PyPI should be used or CodeArtifact one
	if not set -q AWS_ACCOUNT_ID
		PIP_INDEX_URL="https://pypi.python.org/simple" command pipx $argv
		return
	end

	pip_login
	command pipx $argv
end
