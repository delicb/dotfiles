function chezmoi --wraps=chezmoi --description="Wrapper for chezmoi that automatically logs in to 1password CLI"
	# a lot of chezmoi commands do not require 1password, so detect just the
	# ones that do and force login
	# this is probably not a full list, so add new items if it is needed
	for cmd in "apply" "diff" "execute_template" "secret" "update" "cat"
		if contains $cmd $argv
			if command -q op
				op_signin
			end
			OP_SESSION_my=(cat $HOME/.op_session) command chezmoi $argv
			return
		end
	end

	# otherwise just execute chezmoi
	command chezmoi $argv
end
