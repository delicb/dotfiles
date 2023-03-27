#####################################################################
# Relevant only for interactive use
#####################################################################

if status is-interactive
	type -q rtx;      and rtx activate fish --quiet | source
	type -q starship; and starship init fish | source
	type -q jump;     and jump shell fish | source

	# run script with porentially private config
	if test -e $HOME/.private.config.fish
		source $HOME/.private.config.fish
	end

	# configure shell integration for vscode, if available
	string match -q "$TERM_PROGRAM" "vscode"
	and command --query code
	and . (code --locate-shell-integration-path fish)
end
