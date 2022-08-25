function pip --wraps=pip --description "Wrapper for pip that does automatic signin if needed"
	# if "org" command exists, use it to login in to pip
	# org command is smart enough not to login if pip credentials are
	# still valid, so it is not that expensive to call it every time
	if command -q org
		command org aws login --tool pip --quiet
	end
	command pip $argv
end