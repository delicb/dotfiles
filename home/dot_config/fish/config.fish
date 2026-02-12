#####################################################################
# Relevant only for interactive use
#####################################################################

if status is-interactive
	type -q starship; and starship init fish | source
	type -q zoxide;   and zoxide init --cmd j fish | source

	# run script with potentially private config
	if test -e $HOME/.private.config.fish
		source $HOME/.private.config.fish
	end

	# configure shell integration for vscode, if available
	string match -q "$TERM_PROGRAM" "vscode"
	and command --query code
	and . (code --locate-shell-integration-path fish)
end

# pnpm
set -gx PNPM_HOME "/Users/del-boy/Library/pnpm"
if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end
