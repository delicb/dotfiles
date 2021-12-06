function op --wraps=op --description="Wrapper for 1password CLI that shares token"
	op_signin
	OP_SESSION_my=(cat $HOME/.op_session) command op $argv
end