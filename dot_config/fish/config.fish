#####################################################################
# Relevant only for interactive use
#####################################################################

if status is-interactive
	# initialize rtx
	if type -q rtx
		rtx activate -s fish | source
	end

	# initialize direnv
	if type -q direnv
		direnv hook fish | source
	end

	# initialize prompt
	if type -q starship
		starship init fish | source
	end

	# initialize jump
	if type -q jump
		jump shell fish | source
	end

	# run script with porentially private config
	if test -e $HOME/.private.config.fish
		source $HOME/.private.config.fish
	end

	# configure shell integration for vscode, if available
	string match -q "$TERM_PROGRAM" "vscode"
	and command --query code
	and . (code --locate-shell-integration-path fish)
end
