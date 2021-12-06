function chezmoi --wraps=chezmoi --description="Wrapper for chezmoi that automatically logs in to 1password CLI"
	if command -q op
		op_signin
	end
	OP_SESSION_my=(cat $HOME/.op_session) command chezmoi $argv
end
