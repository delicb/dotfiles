#####################################################################
# Relevant only for interactive use
#####################################################################

if status is-interactive
        #type -q starship; and starship init fish | source
	type -q zoxide;   and zoxide init --cmd j fish | source

	# run script with porentially private config
	if test -e $HOME/.private.config.fish
		source $HOME/.private.config.fish
	end

	# configure shell integration for vscode, if available
	string match -q "$TERM_PROGRAM" "vscode"
	and command --query code
	and . (code --locate-shell-integration-path fish)
end
